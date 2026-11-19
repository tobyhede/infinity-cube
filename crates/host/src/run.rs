//! Running an Aggregate directory (`src/run/run.ts`): Import it into a fresh
//! memory store, serve the HTTP application over that store, and Export
//! back in place once Edits have been quiet for the quiet period.
//!
//! One writer task owns every write, so writes never overlap: an Edit during
//! a write causes exactly one further write, nothing is written without an
//! Edit, a failed write is tried again after the quiet period, and
//! [`Run::stop`] writes what is not yet on disk before it answers. Only an
//! accepted `POST /api/spaces` is an Edit ([`Application::on_edit`]), so a
//! commit made while answering a read never schedules a write (ST-65).

use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Notify, oneshot};
use tokio::task::JoinHandle;

use crate::directory::{Filesystem, TokioFilesystem};
use crate::export::{ExportError, export_aggregate};
use crate::http::Application;
use crate::import::{IdSource, ImportError, import_directory};
use crate::memory::MemorySpaceRepository;
use crate::repository::RepositoryError;
use crate::shell::{BuiltFiles, Shell};

/// How long Edits must be quiet before a run writes.
pub const RUN_QUIET_PERIOD: Duration = Duration::from_secs(1);

/// The time a run waits by. [`TokioClock`] is the real one, and it follows
/// tokio's paused time in a test.
pub trait Clock: Send + Sync + 'static {
    /// Wait for `duration` to pass.
    fn sleep(&self, duration: Duration) -> impl Future<Output = ()> + Send;
}

/// `tokio::time::sleep`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TokioClock;

impl Clock for TokioClock {
    fn sleep(&self, duration: Duration) -> impl Future<Output = ()> + Send {
        tokio::time::sleep(duration)
    }
}

/// What the writer did, reported as it happens.
#[derive(Debug, Clone, Copy)]
#[non_exhaustive]
pub enum RunEvent<'a> {
    /// The directory holds every Edit committed before the write began.
    Written,
    /// A write failed; it is tried again after the quiet period.
    WriteFailed(&'a ExportError),
}

/// How a run stopped.
#[derive(Debug)]
#[non_exhaustive]
pub enum RunStopped {
    /// The directory holds every Edit.
    Stopped,
    /// The last write failed, so the directory may lack Edits.
    Unwritten(ExportError),
}

type Reporter = Arc<dyn Fn(&RunEvent<'_>) + Send + Sync>;
type ErrorReporter = Arc<dyn Fn(&str, &RepositoryError) + Send + Sync>;

/// A run's application: the memory store, the run's ids and the caller's shell.
pub type RunApplication<I, B> = Application<MemorySpaceRepository, Arc<I>, B>;

/// Builds a [`Run`]. The directory, the id source and the clock are required
/// and have no defaults (ADR 0109); [`Run::builder`] starts one.
pub struct RunBuilder<D, I, C, F = TokioFilesystem> {
    directory: D,
    ids: I,
    clock: C,
    fs: F,
    report: Option<Reporter>,
    failed: Option<ErrorReporter>,
}

impl<D, I, C, F> std::fmt::Debug for RunBuilder<D, I, C, F> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RunBuilder").finish_non_exhaustive()
    }
}

/// A builder slot not yet filled.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Unset;

impl<D, I, C, F> RunBuilder<D, I, C, F> {
    /// The Aggregate directory to run. Required.
    pub fn directory(self, directory: impl Into<PathBuf>) -> RunBuilder<PathBuf, I, C, F> {
        RunBuilder {
            directory: directory.into(),
            ids: self.ids,
            clock: self.clock,
            fs: self.fs,
            report: self.report,
            failed: self.failed,
        }
    }

    /// Where new ids come from. Required.
    pub fn ids<N: IdSource>(self, ids: N) -> RunBuilder<D, N, C, F> {
        RunBuilder {
            directory: self.directory,
            ids,
            clock: self.clock,
            fs: self.fs,
            report: self.report,
            failed: self.failed,
        }
    }

    /// The clock the quiet period is measured by. Required.
    pub fn clock<K: Clock>(self, clock: K) -> RunBuilder<D, I, K, F> {
        RunBuilder {
            directory: self.directory,
            ids: self.ids,
            clock,
            fs: self.fs,
            report: self.report,
            failed: self.failed,
        }
    }

    /// The filesystem Import and Export go through; [`TokioFilesystem`] unless given.
    pub fn filesystem<G: Filesystem>(self, fs: G) -> RunBuilder<D, I, C, G> {
        RunBuilder {
            directory: self.directory,
            ids: self.ids,
            clock: self.clock,
            fs,
            report: self.report,
            failed: self.failed,
        }
    }

    /// Hear each write and each failed write.
    #[must_use]
    pub fn on_event(mut self, report: impl Fn(&RunEvent<'_>) + Send + Sync + 'static) -> Self {
        self.report = Some(Arc::new(report));
        self
    }

    /// Hear each store failure the application answers, as
    /// [`Application::on_error`] does.
    #[must_use]
    pub fn on_error(
        mut self,
        observer: impl Fn(&str, &RepositoryError) + Send + Sync + 'static,
    ) -> Self {
        self.failed = Some(Arc::new(observer));
        self
    }
}

impl<I: IdSource, C: Clock, F: Filesystem> RunBuilder<PathBuf, I, C, F> {
    /// Import the directory and start serving it through `shell`.
    ///
    /// # Errors
    ///
    /// [`ImportError::Empty`] for a missing or empty directory (`init` makes
    /// one), [`ImportError::Refused`] with intake's refusals, or a directory
    /// that could not be listed. Nothing is written.
    pub async fn start<B: BuiltFiles>(self, shell: Shell<B>) -> Result<Run<I, B>, ImportError> {
        let repository = Arc::new(MemorySpaceRepository::new());
        let ids = Arc::new(self.ids);
        import_directory(repository.as_ref(), &self.fs, &self.directory, ids.as_ref()).await?;
        let edits = Arc::new(Notify::new());
        let notified = Arc::clone(&edits);
        let mut application =
            Application::new(Arc::clone(&repository), ids, shell).on_edit(move || {
                notified.notify_one();
            });
        if let Some(failed) = self.failed {
            application = application.on_error(move |context, error| failed(context, error));
        }
        let application = Arc::new(application);
        let (stop, stopped) = oneshot::channel();
        let writer = Writer {
            repository,
            fs: self.fs,
            directory: self.directory,
            clock: self.clock,
            report: self.report,
            edits,
        };
        let task = tokio::spawn(writer.run(stopped));
        Ok(Run {
            application,
            stop,
            task,
        })
    }
}

/// A running Aggregate directory: the application to hand requests to, and
/// the writer behind it.
///
/// [`Run::stop`] is how a run ends: it answers once everything committed is
/// on disk. A run dropped without it closes the writer's stop channel, which
/// the writer reads as a stop, so it still writes what is not on disk, but
/// on its own task, which nothing awaits and a runtime shutting down cuts
/// short.
pub struct Run<I, B> {
    application: Arc<RunApplication<I, B>>,
    stop: oneshot::Sender<()>,
    task: JoinHandle<RunStopped>,
}

impl<I, B> std::fmt::Debug for Run<I, B> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Run").finish_non_exhaustive()
    }
}

impl Run<Unset, Unset> {
    /// A builder with nothing set.
    #[must_use]
    pub fn builder() -> RunBuilder<Unset, Unset, Unset> {
        RunBuilder {
            directory: Unset,
            ids: Unset,
            clock: Unset,
            fs: TokioFilesystem,
            report: None,
            failed: None,
        }
    }
}

impl<I: IdSource, B: BuiltFiles> Run<I, B> {
    /// The application that answers this run's requests.
    #[must_use]
    pub fn application(&self) -> &Arc<RunApplication<I, B>> {
        &self.application
    }

    /// Write any Edit not yet on disk, wait for the write in flight, and stop
    /// writing. Answers once the directory holds everything committed, or
    /// with the failure of the last write.
    pub async fn stop(self) -> RunStopped {
        let _ignored = self.stop.send(());
        self.task.await.unwrap_or_else(|error| {
            RunStopped::Unwritten(ExportError::Destination(format!(
                "the writer stopped: {error}"
            )))
        })
    }
}

struct Writer<C, F> {
    repository: Arc<MemorySpaceRepository>,
    fs: F,
    directory: PathBuf,
    clock: C,
    report: Option<Reporter>,
    edits: Arc<Notify>,
}

impl<C: Clock, F: Filesystem> Writer<C, F> {
    fn report(&self, event: &RunEvent<'_>) {
        if let Some(report) = &self.report {
            report(event);
        }
    }

    /// One write; `None` when it landed.
    async fn write(&self) -> Option<ExportError> {
        let failure = export_aggregate(self.repository.as_ref(), &self.fs, &self.directory)
            .await
            .err();
        self.report(
            &failure
                .as_ref()
                .map_or(RunEvent::Written, RunEvent::WriteFailed),
        );
        failure
    }

    async fn run(self, mut stop: oneshot::Receiver<()>) -> RunStopped {
        let mut changed = false;
        let mut failure: Option<ExportError> = None;
        loop {
            if !changed {
                tokio::select! {
                    biased;
                    () = self.edits.notified() => changed = true,
                    _ = &mut stop => break,
                }
            }
            loop {
                tokio::select! {
                    biased;
                    _ = &mut stop => return self.flush(changed, failure).await,
                    () = self.edits.notified() => {}
                    () = self.clock.sleep(RUN_QUIET_PERIOD) => break,
                }
            }
            failure = self.write().await;
            changed = failure.is_some();
        }
        self.flush(changed, failure).await
    }

    /// Write until no Edit is left unwritten, including one committed while
    /// the last write ran, and answer the last write's failure, if any.
    async fn flush(&self, mut changed: bool, mut failure: Option<ExportError>) -> RunStopped {
        while changed || self.edit_pending().await {
            failure = self.write().await;
            if failure.is_some() {
                break;
            }
            changed = false;
        }
        failure.map_or(RunStopped::Stopped, RunStopped::Unwritten)
    }

    /// Whether an Edit has been committed since the writer last waited for
    /// one, without waiting: `notify_one` keeps its permit until it is taken.
    async fn edit_pending(&self) -> bool {
        tokio::select! {
            biased;
            () = self.edits.notified() => true,
            () = std::future::ready(()) => false,
        }
    }
}
