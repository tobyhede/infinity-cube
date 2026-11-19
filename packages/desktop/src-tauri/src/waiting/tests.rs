//! The close-wait decision, event by event, and its timing on tokio's
//! paused clock.

#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    reason = "a test fails by panicking"
)]

use std::path::PathBuf;

use tokio::sync::mpsc;

use super::*;

fn folder(name: &str) -> PathBuf {
    PathBuf::from(format!("/talks/{name}"))
}

fn close(talk: &'static str) -> Event<&'static str> {
    Event::CloseRequested {
        talk,
        folder: folder(talk),
    }
}

/// A coordinator with `talk`'s window closing, and the wait it is in.
fn closing(talk: &'static str) -> (Waiting<&'static str>, WaitId) {
    let mut waiting = Waiting::default();
    let effects = waiting.on(close(talk));
    let [Effect::StartTimer(id)] = effects[..] else {
        panic!("a close starts the wait's timer, got {effects:?}");
    };
    (waiting, id)
}

/// A coordinator with `talk`'s window closing and its question showing.
fn asking(talk: &'static str) -> (Waiting<&'static str>, WaitId) {
    let (mut waiting, id) = closing(talk);
    assert_eq!(
        waiting.on(Event::Elapsed(id)),
        vec![Effect::Ask {
            wait: id,
            folders: vec![folder(talk)]
        }],
        "the question names the folder once the time has passed"
    );
    (waiting, id)
}

mod given_a_window_closing {
    use super::*;

    #[test]
    fn a_write_that_finishes_in_time_closes_the_window_without_asking() {
        let (mut waiting, id) = closing("rust");
        assert_eq!(
            waiting.on(Event::WriteFinished("rust")),
            vec![Effect::Close("rust")],
            "the window closes as soon as its write ends"
        );
        assert_eq!(
            waiting.on(Event::Elapsed(id)),
            vec![],
            "a timer that fires after the write ended asks nothing"
        );
    }

    #[test]
    fn a_write_still_running_when_the_time_passes_asks_naming_its_folder() {
        let _ = asking("rust");
    }

    #[test]
    fn the_question_goes_by_itself_when_the_write_finishes_and_the_window_closes() {
        let (mut waiting, id) = asking("rust");
        assert_eq!(
            waiting.on(Event::WriteFinished("rust")),
            vec![Effect::Close("rust"), Effect::Dismiss(id)],
            "the window closes and the question is taken away"
        );
        assert_eq!(
            waiting.on(Event::Chose(id, Choice::CloseWithoutSaving)),
            vec![],
            "an answer arriving after the write ended abandons nothing"
        );
    }

    #[test]
    fn keep_waiting_dismisses_the_question_and_asks_again_after_another_period() {
        let (mut waiting, id) = asking("rust");
        assert_eq!(
            waiting.on(Event::Chose(id, Choice::KeepWaiting)),
            vec![Effect::Dismiss(id), Effect::StartTimer(id)],
            "keep waiting takes the question away and starts the time again"
        );
        assert_eq!(
            waiting.on(Event::Elapsed(id)),
            vec![Effect::Ask {
                wait: id,
                folders: vec![folder("rust")]
            }],
            "still writing, it asks again"
        );
    }

    #[test]
    fn close_without_saving_abandons_the_write_and_closes() {
        let (mut waiting, id) = asking("rust");
        assert_eq!(
            waiting.on(Event::Chose(id, Choice::CloseWithoutSaving)),
            vec![
                Effect::Dismiss(id),
                Effect::Abandon(vec![("rust", folder("rust"))])
            ],
            "the question goes and the window closes without its write"
        );
        assert_eq!(
            waiting.on(Event::WriteFinished("rust")),
            vec![],
            "an abandoned write that ends later closes nothing"
        );
    }

    #[test]
    fn an_answer_with_no_question_showing_does_nothing() {
        let (mut waiting, id) = closing("rust");
        for choice in [Choice::KeepWaiting, Choice::CloseWithoutSaving] {
            assert_eq!(
                waiting.on(Event::Chose(id, choice)),
                vec![],
                "{choice:?} before any question"
            );
        }
        assert_eq!(
            waiting.on(Event::WriteFinished("rust")),
            vec![Effect::Close("rust")],
            "the write is still waited for"
        );
    }

    #[test]
    fn a_repeated_close_starts_no_second_wait() {
        let (mut waiting, _id) = closing("rust");
        assert_eq!(waiting.on(close("rust")), vec![], "one wait per talk");
    }

    #[test]
    fn two_windows_closing_are_asked_about_separately() {
        let (mut waiting, first) = asking("rust");
        let effects = waiting.on(close("go"));
        let [Effect::StartTimer(second)] = effects[..] else {
            panic!("a second close starts a wait of its own, got {effects:?}");
        };
        assert_ne!(first, second, "a wait of its own");
        assert_eq!(
            waiting.on(Event::Chose(first, Choice::CloseWithoutSaving)),
            vec![
                Effect::Dismiss(first),
                Effect::Abandon(vec![("rust", folder("rust"))])
            ],
            "abandoning one abandons only its own talk"
        );
        assert_eq!(
            waiting.on(Event::WriteFinished("go")),
            vec![Effect::Close("go")],
            "the other is still waited for"
        );
    }
}

mod given_a_quit {
    use super::*;

    fn quit(writing: &[&'static str]) -> Event<&'static str> {
        Event::QuitRequested {
            writing: writing.iter().map(|talk| (*talk, folder(talk))).collect(),
        }
    }

    /// A coordinator quitting with `writing` still writing, and its wait.
    fn quitting(writing: &[&'static str]) -> (Waiting<&'static str>, WaitId) {
        let mut waiting = Waiting::default();
        let effects = waiting.on(quit(writing));
        let [Effect::StartTimer(id)] = effects[..] else {
            panic!("a quit starts one timer, got {effects:?}");
        };
        (waiting, id)
    }

    #[test]
    fn with_nothing_writing_it_exits_at_once() {
        let mut waiting: Waiting<&str> = Waiting::default();
        assert_eq!(
            waiting.on(quit(&[])),
            vec![Effect::Exit],
            "nothing to wait for"
        );
    }

    #[test]
    fn asks_once_naming_every_folder_still_writing() {
        let (mut waiting, id) = quitting(&["rust", "go", "zig"]);
        assert_eq!(
            waiting.on(Event::WriteFinished("go")),
            vec![],
            "a talk written during a quit closes nothing by itself"
        );
        assert_eq!(
            waiting.on(Event::Elapsed(id)),
            vec![Effect::Ask {
                wait: id,
                folders: vec![folder("rust"), folder("zig")]
            }],
            "one question naming each folder still writing"
        );
    }

    #[test]
    fn the_question_names_fewer_folders_as_writes_finish_and_goes_with_the_last() {
        let (mut waiting, id) = quitting(&["rust", "go"]);
        let _asked = waiting.on(Event::Elapsed(id));
        assert_eq!(
            waiting.on(Event::WriteFinished("rust")),
            vec![Effect::Ask {
                wait: id,
                folders: vec![folder("go")]
            }],
            "the question shows again naming the one left"
        );
        assert_eq!(
            waiting.on(Event::WriteFinished("go")),
            vec![Effect::Dismiss(id), Effect::Exit],
            "the last write takes the question away and the application ends"
        );
    }

    #[test]
    fn close_without_saving_applies_to_every_folder_and_exits() {
        let (mut waiting, id) = quitting(&["rust", "go"]);
        let _asked = waiting.on(Event::Elapsed(id));
        assert_eq!(
            waiting.on(Event::Chose(id, Choice::CloseWithoutSaving)),
            vec![Effect::Dismiss(id), Effect::Exit],
            "every write is abandoned with the one answer"
        );
    }

    #[test]
    fn keep_waiting_applies_to_every_folder_and_asks_again() {
        let (mut waiting, id) = quitting(&["rust", "go"]);
        let _asked = waiting.on(Event::Elapsed(id));
        assert_eq!(
            waiting.on(Event::Chose(id, Choice::KeepWaiting)),
            vec![Effect::Dismiss(id), Effect::StartTimer(id)],
            "one answer, one timer"
        );
    }

    #[test]
    fn windows_already_closing_join_the_one_question_and_theirs_go() {
        let (mut waiting, window) = asking("rust");
        let effects = waiting.on(quit(&["go"]));
        let [Effect::Dismiss(dismissed), Effect::StartTimer(id)] = effects[..] else {
            panic!("the window's question goes and the quit's timer starts, got {effects:?}");
        };
        assert_eq!(dismissed, window, "the window's own question");
        assert_eq!(
            waiting.on(Event::Elapsed(window)),
            vec![],
            "the window's own timer asks nothing any more"
        );
        assert_eq!(
            waiting.on(Event::Elapsed(id)),
            vec![Effect::Ask {
                wait: id,
                folders: vec![folder("go"), folder("rust")]
            }],
            "the one question names the closing window's folder too"
        );
    }

    #[test]
    fn a_window_closing_with_its_write_still_running_holds_a_quit_with_no_other_talk() {
        let (mut waiting, _window) = closing("rust");
        let effects = waiting.on(quit(&[]));
        assert!(
            matches!(effects[..], [Effect::StartTimer(_)]),
            "the quit waits for the closing window's write, got {effects:?}"
        );
        assert_eq!(
            waiting.on(Event::WriteFinished("rust")),
            vec![Effect::Exit],
            "and ends once it lands"
        );
    }

    #[test]
    fn an_abandoned_window_does_not_hold_a_quit() {
        let (mut waiting, id) = asking("rust");
        let _abandoned = waiting.on(Event::Chose(id, Choice::CloseWithoutSaving));
        assert_eq!(
            waiting.on(quit(&[])),
            vec![Effect::Exit],
            "a write the presenter gave up on is not waited for again"
        );
    }

    #[test]
    fn a_window_closed_during_a_quit_joins_it() {
        let (mut waiting, id) = quitting(&["rust"]);
        assert_eq!(waiting.on(close("go")), vec![], "no wait of its own");
        assert_eq!(
            waiting.on(Event::Elapsed(id)),
            vec![Effect::Ask {
                wait: id,
                folders: vec![folder("go"), folder("rust")]
            }],
            "the quit's question names it"
        );
    }
}

mod on_the_clock {
    use std::time::Duration;

    use super::*;

    struct Driven {
        events: mpsc::UnboundedSender<Event<&'static str>>,
        effects: mpsc::UnboundedReceiver<Effect<&'static str>>,
    }

    fn start() -> Driven {
        let (events, received) = mpsc::unbounded_channel();
        let (applied, effects) = mpsc::unbounded_channel();
        drop(tokio::spawn(drive(
            received,
            events.clone(),
            move |effect| {
                applied.send(effect).unwrap();
            },
        )));
        Driven { events, effects }
    }

    impl Driven {
        fn send(&self, event: Event<&'static str>) {
            self.events.send(event).unwrap();
        }

        /// Let `period` pass, and answer every effect applied meanwhile.
        async fn after(&mut self, period: Duration) -> Vec<Effect<&'static str>> {
            tokio::time::sleep(period).await;
            // Let the driver and any timer that fired run.
            for _ in 0..10 {
                tokio::task::yield_now().await;
            }
            let mut applied = Vec::new();
            while let Ok(effect) = self.effects.try_recv() {
                applied.push(effect);
            }
            applied
        }
    }

    const JUST_UNDER: Duration = Duration::from_millis(9_999);
    const THE_REST: Duration = Duration::from_millis(1);

    #[tokio::test(start_paused = true)]
    async fn asks_ten_seconds_after_the_close_and_not_before() {
        let mut driven = start();
        driven.send(close("rust"));
        assert_eq!(driven.after(JUST_UNDER).await, vec![], "not yet");
        let applied = driven.after(THE_REST).await;
        assert!(
            matches!(&applied[..], [Effect::Ask { folders, .. }] if *folders == vec![folder("rust")]),
            "asked at ten seconds, got {applied:?}"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn a_write_finishing_in_time_closes_and_never_asks() {
        let mut driven = start();
        driven.send(close("rust"));
        assert_eq!(
            driven.after(Duration::from_secs(5)).await,
            vec![],
            "waiting"
        );
        driven.send(Event::WriteFinished("rust"));
        assert_eq!(
            driven.after(Duration::ZERO).await,
            vec![Effect::Close("rust")],
            "closed as the write ends"
        );
        assert_eq!(
            driven.after(Duration::from_secs(60)).await,
            vec![],
            "and nothing asked afterwards"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn keep_waiting_asks_again_ten_seconds_after_the_answer() {
        let mut driven = start();
        driven.send(close("rust"));
        let applied = driven.after(Duration::from_secs(10)).await;
        let [Effect::Ask { wait, .. }] = applied[..] else {
            panic!("asked, got {applied:?}");
        };
        // The presenter answers some while after the question showed.
        assert_eq!(
            driven.after(Duration::from_secs(30)).await,
            vec![],
            "no repeat while showing"
        );
        driven.send(Event::Chose(wait, Choice::KeepWaiting));
        assert_eq!(
            driven.after(Duration::ZERO).await,
            vec![Effect::Dismiss(wait)],
            "dismissed at once"
        );
        assert_eq!(
            driven.after(JUST_UNDER).await,
            vec![],
            "not asked again yet"
        );
        let applied = driven.after(THE_REST).await;
        assert!(
            matches!(&applied[..], [Effect::Ask { wait: again, .. }] if *again == wait),
            "asked again ten seconds after the answer, got {applied:?}"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn a_write_finishing_while_asking_dismisses_and_closes() {
        let mut driven = start();
        driven.send(close("rust"));
        let applied = driven.after(Duration::from_secs(10)).await;
        let [Effect::Ask { wait, .. }] = applied[..] else {
            panic!("asked, got {applied:?}");
        };
        driven.send(Event::WriteFinished("rust"));
        assert_eq!(
            driven.after(Duration::ZERO).await,
            vec![Effect::Close("rust"), Effect::Dismiss(wait)],
            "the window closes and the question goes by itself"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn a_quit_asks_once_ten_seconds_after_it_was_asked_for() {
        let mut driven = start();
        driven.send(close("rust"));
        assert_eq!(
            driven.after(Duration::from_secs(8)).await,
            vec![],
            "waiting"
        );
        driven.send(Event::QuitRequested {
            writing: vec![("go", folder("go"))],
        });
        // The closing window's own ten seconds pass, and ask nothing.
        assert_eq!(driven.after(JUST_UNDER).await, vec![], "not yet");
        let applied = driven.after(THE_REST).await;
        assert!(
            matches!(&applied[..], [Effect::Ask { folders, .. }] if *folders == vec![folder("go"), folder("rust")]),
            "one question for both, ten seconds after the quit, got {applied:?}"
        );
    }
}
