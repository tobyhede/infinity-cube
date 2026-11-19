//! The signals that stop a run (Storage ST-63): SIGINT, SIGTERM and SIGHUP,
//! merged. On Windows, Ctrl-C, Ctrl-Break and the console closing stand in
//! for them; Windows is not yet a supported platform (issue 22), and no CI
//! job compiles or tests that half.

use std::io;

/// The stop signals, installed once; each [`Signals::next`] waits for one.
/// Each listener is kept from [`Signals::install`] on, so a signal that
/// arrives between two waits is held for the next, never lost.
pub(crate) struct Signals {
    #[cfg(unix)]
    interrupt: tokio::signal::unix::Signal,
    #[cfg(unix)]
    terminate: tokio::signal::unix::Signal,
    #[cfg(unix)]
    hangup: tokio::signal::unix::Signal,
    #[cfg(windows)]
    ctrl_c: tokio::signal::windows::CtrlC,
    #[cfg(windows)]
    ctrl_break: tokio::signal::windows::CtrlBreak,
    #[cfg(windows)]
    ctrl_close: tokio::signal::windows::CtrlClose,
}

impl Signals {
    /// Take over the stop signals: from here on none ends the process by default.
    #[cfg(unix)]
    pub(crate) fn install() -> io::Result<Self> {
        use tokio::signal::unix::{SignalKind, signal};
        Ok(Self {
            interrupt: signal(SignalKind::interrupt())?,
            terminate: signal(SignalKind::terminate())?,
            hangup: signal(SignalKind::hangup())?,
        })
    }

    /// Take over the stop signals: from here on none ends the process by default.
    #[cfg(windows)]
    pub(crate) fn install() -> io::Result<Self> {
        use tokio::signal::windows::{ctrl_break, ctrl_c, ctrl_close};
        Ok(Self {
            ctrl_c: ctrl_c()?,
            ctrl_break: ctrl_break()?,
            ctrl_close: ctrl_close()?,
        })
    }

    /// Whether a stop signal has arrived and not been waited for, without
    /// waiting: each listener holds a signal until it is received.
    pub(crate) async fn pending(&mut self) -> bool {
        tokio::select! {
            biased;
            () = self.next() => true,
            () = std::future::ready(()) => false,
        }
    }

    /// The next stop signal.
    #[cfg(unix)]
    pub(crate) async fn next(&mut self) {
        tokio::select! {
            _ = self.interrupt.recv() => {}
            _ = self.terminate.recv() => {}
            _ = self.hangup.recv() => {}
        }
    }

    /// The next stop signal.
    #[cfg(windows)]
    pub(crate) async fn next(&mut self) {
        tokio::select! {
            _ = self.ctrl_c.recv() => {}
            _ = self.ctrl_break.recv() => {}
            _ = self.ctrl_close.recv() => {}
        }
    }
}
