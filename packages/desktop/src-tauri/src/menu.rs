//! The application's menus (ADR 0167, Storage ST-121), laid out as data.
//!
//! [`layout`] decides which menus each platform gets and what is in them; the
//! shell draws that layout with Tauri's menu types and answers the
//! [`Command`]s it holds. A native menu follows the platform's conventions,
//! with its accelerators (UI-8): macOS gets the application, File, Edit, View,
//! Window and Help menus a Mac application has; Linux and Windows get File,
//! View and Help, with About and Check for Updates… under Help and Quit under
//! File. Linux and Windows get no Edit menu: the webview answers the clipboard
//! keys itself there, and a menu accelerator would take them from it.

/// The platform whose conventions a menu follows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    MacOs,
    /// Linux and Windows.
    Other,
}

impl Platform {
    /// The platform this build runs on.
    pub const CURRENT: Self = if cfg!(target_os = "macos") {
        Self::MacOs
    } else {
        Self::Other
    };
}

/// A menu item the shell answers itself.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    NewSpace,
    Open,
    /// Closes the focused window as its own control would, so a Space
    /// window's close waits for its last write (ST-122).
    CloseWindow,
    /// Asks the application to exit, so a quit waits for each Aggregate's
    /// last write and may ask; the predefined Quit ends the process without
    /// asking the application.
    Quit,
    /// Toggles the focused window's full screen.
    FullScreen,
    Help,
    ReportIssue,
    CheckForUpdates,
}

impl Command {
    const ALL: [Self; 8] = [
        Self::NewSpace,
        Self::Open,
        Self::CloseWindow,
        Self::Quit,
        Self::FullScreen,
        Self::Help,
        Self::ReportIssue,
        Self::CheckForUpdates,
    ];

    /// The id its menu item carries.
    pub const fn id(self) -> &'static str {
        match self {
            Self::NewSpace => "new",
            Self::Open => "open",
            Self::CloseWindow => "close-window",
            Self::Quit => "quit",
            Self::FullScreen => "full-screen",
            Self::Help => "help",
            Self::ReportIssue => "report-issue",
            Self::CheckForUpdates => "check-for-updates",
        }
    }

    /// The command a menu item's id names, if it names one.
    pub fn named(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|command| command.id() == id)
    }

    pub const fn label(self) -> &'static str {
        match self {
            Self::NewSpace => "New Space…",
            Self::Open => "Open…",
            Self::CloseWindow => "Close Window",
            Self::Quit => "Quit InfinityCube",
            Self::FullScreen => "Toggle Full Screen",
            Self::Help => "InfinityCube Help",
            Self::ReportIssue => "Report an Issue…",
            Self::CheckForUpdates => "Check for Updates…",
        }
    }

    pub const fn accelerator(self) -> Option<&'static str> {
        match self {
            Self::NewSpace => Some("CmdOrCtrl+N"),
            Self::Open => Some("CmdOrCtrl+O"),
            Self::CloseWindow => Some("CmdOrCtrl+W"),
            Self::Quit => Some("CmdOrCtrl+Q"),
            Self::FullScreen => Some("F11"),
            Self::Help | Self::ReportIssue | Self::CheckForUpdates => None,
        }
    }

    /// The page the system browser opens for it, if it opens one. The shell
    /// opens it; no window navigates there (ST-121).
    pub const fn address(self) -> Option<&'static str> {
        match self {
            Self::Help => Some(HELP_ADDRESS),
            Self::ReportIssue => Some(REPORT_ISSUE_ADDRESS),
            _ => None,
        }
    }
}

/// InfinityCube's README, where a person starts.
pub const HELP_ADDRESS: &str = "https://github.com/tobyhede/infinity-cube#readme";
/// A new issue on InfinityCube's repository.
pub const REPORT_ISSUE_ADDRESS: &str = "https://github.com/tobyhede/infinity-cube/issues/new";
/// The website About names.
pub const WEBSITE: &str = "https://github.com/tobyhede/infinity-cube";

/// A menu item the platform provides, drawn with its own label and
/// accelerator.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Predefined {
    About,
    Hide,
    HideOthers,
    ShowAll,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    /// macOS's full screen, which names itself Enter or Exit Full Screen.
    FullScreen,
    Minimize,
    Zoom,
    CloseWindow,
    /// Raises every window of the application above other applications'.
    RaiseAll,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Item {
    Command(Command),
    Predefined(Predefined),
    Separator,
}

/// What macOS makes of a menu beyond its items.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    /// macOS lists the open windows in it.
    Window,
    /// macOS adds its search field to it.
    Help,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Submenu {
    pub title: &'static str,
    pub role: Option<Role>,
    pub items: Vec<Item>,
}

/// The menus `platform` gets, in order. Check for Updates… is offered only
/// when this build has an updater (`updates`).
pub fn layout(platform: Platform, updates: bool) -> Vec<Submenu> {
    use Item::{Command as C, Predefined as P, Separator};
    let check = updates.then_some(C(Command::CheckForUpdates));
    match platform {
        Platform::MacOs => vec![
            submenu(
                "InfinityCube",
                None,
                [Some(P(Predefined::About)), check, Some(Separator)]
                    .into_iter()
                    .flatten()
                    .chain([
                        P(Predefined::Hide),
                        P(Predefined::HideOthers),
                        P(Predefined::ShowAll),
                        Separator,
                        C(Command::Quit),
                    ]),
            ),
            submenu(
                "File",
                None,
                [
                    C(Command::NewSpace),
                    C(Command::Open),
                    Separator,
                    P(Predefined::CloseWindow),
                ],
            ),
            submenu(
                "Edit",
                None,
                [
                    P(Predefined::Undo),
                    P(Predefined::Redo),
                    Separator,
                    P(Predefined::Cut),
                    P(Predefined::Copy),
                    P(Predefined::Paste),
                    P(Predefined::SelectAll),
                ],
            ),
            submenu("View", None, [P(Predefined::FullScreen)]),
            submenu(
                "Window",
                Some(Role::Window),
                [
                    P(Predefined::Minimize),
                    P(Predefined::Zoom),
                    Separator,
                    P(Predefined::RaiseAll),
                ],
            ),
            submenu(
                "Help",
                Some(Role::Help),
                [C(Command::Help), C(Command::ReportIssue)],
            ),
        ],
        Platform::Other => vec![
            submenu(
                "File",
                None,
                [
                    C(Command::NewSpace),
                    C(Command::Open),
                    Separator,
                    C(Command::CloseWindow),
                    C(Command::Quit),
                ],
            ),
            submenu("View", None, [C(Command::FullScreen)]),
            submenu(
                "Help",
                Some(Role::Help),
                [Some(C(Command::Help)), Some(C(Command::ReportIssue)), check]
                    .into_iter()
                    .flatten()
                    .chain([Separator, P(Predefined::About)]),
            ),
        ],
    }
}

fn submenu(
    title: &'static str,
    role: Option<Role>,
    items: impl IntoIterator<Item = Item>,
) -> Submenu {
    Submenu {
        title,
        role,
        items: items.into_iter().collect(),
    }
}

#[cfg(test)]
mod tests;
