use std::collections::HashSet;

use super::*;

const PLATFORMS: [Platform; 2] = [Platform::MacOs, Platform::Other];

fn titles(platform: Platform) -> Vec<&'static str> {
    layout(platform, true)
        .iter()
        .map(|menu| menu.title)
        .collect()
}

fn commands(platform: Platform, updates: bool) -> Vec<Command> {
    layout(platform, updates)
        .into_iter()
        .flat_map(|menu| menu.items)
        .filter_map(|item| match item {
            Item::Command(command) => Some(command),
            _ => None,
        })
        .collect()
}

fn menu(platform: Platform, title: &str) -> Submenu {
    layout(platform, true)
        .into_iter()
        .find(|menu| menu.title == title)
        .unwrap_or_else(|| panic!("{platform:?} has no {title} menu"))
}

#[test]
fn every_command_is_named_by_its_own_id() {
    for command in Command::ALL {
        assert_eq!(Command::named(command.id()), Some(command), "{command:?}");
    }
    assert_eq!(Command::named("about"), None);
}

#[test]
fn every_page_it_opens_is_infinity_cubes_own_over_https() {
    for command in Command::ALL {
        if let Some(address) = command.address() {
            assert!(
                address.starts_with("https://github.com/tobyhede/infinity-cube"),
                "{command:?} opens {address}"
            );
        }
    }
    assert_eq!(Command::Help.address(), Some(HELP_ADDRESS));
    assert_eq!(Command::ReportIssue.address(), Some(REPORT_ISSUE_ADDRESS));
}

#[test]
fn no_two_commands_share_an_accelerator() {
    let accelerators: Vec<_> = Command::ALL
        .into_iter()
        .filter_map(Command::accelerator)
        .collect();
    let distinct: HashSet<_> = accelerators.iter().collect();
    assert_eq!(distinct.len(), accelerators.len(), "{accelerators:?}");
}

// ADR 0181: a SQLite file and a PostgreSQL database are offered where a
// folder is, after Open… in File, with no accelerator of their own.
#[test]
fn file_offers_a_sqlite_file_and_a_postgresql_database_after_open() {
    for platform in PLATFORMS {
        let file = menu(platform, "File").items;
        let open = file
            .iter()
            .position(|item| *item == Item::Command(Command::Open))
            .unwrap();
        assert_eq!(
            file[open + 1..open + 3],
            [
                Item::Command(Command::OpenSqliteFile),
                Item::Command(Command::ConnectPostgres),
            ],
            "{platform:?}"
        );
    }
    assert_eq!(Command::OpenSqliteFile.label(), "Open SQLite File…");
    assert_eq!(
        Command::ConnectPostgres.label(),
        "Connect to PostgreSQL Database…"
    );
    assert_eq!(Command::OpenSqliteFile.accelerator(), None);
    assert_eq!(Command::ConnectPostgres.accelerator(), None);
}

#[test]
fn every_platform_offers_new_open_close_quit_help_and_report_once() {
    for platform in PLATFORMS {
        let offered = commands(platform, true);
        for command in [
            Command::NewSpace,
            Command::Open,
            Command::Quit,
            Command::Help,
            Command::ReportIssue,
            Command::CheckForUpdates,
        ] {
            assert_eq!(
                offered.iter().filter(|&&each| each == command).count(),
                1,
                "{platform:?} offers {command:?} once"
            );
        }
    }
}

#[test]
fn help_is_the_last_menu_and_macos_knows_it_as_help() {
    for platform in PLATFORMS {
        let menus = layout(platform, true);
        let last = menus.last().unwrap_or_else(|| panic!("{platform:?}"));
        assert_eq!((last.title, last.role), ("Help", Some(Role::Help)));
    }
}

#[test]
fn offers_check_for_updates_only_when_the_build_has_an_updater() {
    for platform in PLATFORMS {
        assert!(!commands(platform, false).contains(&Command::CheckForUpdates));
    }
}

#[test]
fn no_menu_begins_or_ends_with_a_separator_or_holds_two_together() {
    for platform in PLATFORMS {
        for updates in [true, false] {
            for menu in layout(platform, updates) {
                let items = &menu.items;
                assert_ne!(items.first(), Some(&Item::Separator), "{}", menu.title);
                assert_ne!(items.last(), Some(&Item::Separator), "{}", menu.title);
                assert!(
                    !items
                        .windows(2)
                        .any(|pair| pair == [Item::Separator, Item::Separator]),
                    "{platform:?} {}: {items:?}",
                    menu.title
                );
            }
        }
    }
}

mod given_macos {
    use super::*;

    #[test]
    fn has_the_menus_a_mac_application_has() {
        assert_eq!(
            titles(Platform::MacOs),
            ["InfinityCube", "File", "Edit", "View", "Window", "Help"]
        );
    }

    #[test]
    fn about_and_quit_are_in_the_application_menu() {
        let application = menu(Platform::MacOs, "InfinityCube");
        assert_eq!(
            application.items.first(),
            Some(&Item::Predefined(Predefined::About))
        );
        assert_eq!(
            application.items.last(),
            Some(&Item::Command(Command::Quit))
        );
    }

    #[test]
    fn uses_the_platforms_own_close_window_and_full_screen() {
        let offered = commands(Platform::MacOs, true);
        assert!(!offered.contains(&Command::CloseWindow));
        assert!(!offered.contains(&Command::FullScreen));
        assert!(
            menu(Platform::MacOs, "File")
                .items
                .contains(&Item::Predefined(Predefined::CloseWindow))
        );
        assert_eq!(
            menu(Platform::MacOs, "View").items,
            [Item::Predefined(Predefined::FullScreen)]
        );
    }

    #[test]
    fn the_window_menu_lists_the_open_windows_and_brings_them_all_to_front() {
        let window = menu(Platform::MacOs, "Window");
        assert_eq!(window.role, Some(Role::Window));
        assert!(
            window
                .items
                .contains(&Item::Predefined(Predefined::RaiseAll))
        );
    }
}

mod given_linux_or_windows {
    use super::*;

    #[test]
    fn has_file_view_and_help_and_no_edit_menu() {
        assert_eq!(titles(Platform::Other), ["File", "View", "Help"]);
    }

    #[test]
    fn file_ends_with_close_window_and_quit() {
        let file = menu(Platform::Other, "File").items;
        assert_eq!(
            file[file.len() - 2..],
            [
                Item::Command(Command::CloseWindow),
                Item::Command(Command::Quit)
            ]
        );
    }

    #[test]
    fn about_ends_the_help_menu() {
        assert_eq!(
            menu(Platform::Other, "Help").items.last(),
            Some(&Item::Predefined(Predefined::About))
        );
    }

    #[test]
    fn full_screen_is_a_command_on_f11() {
        assert_eq!(
            menu(Platform::Other, "View").items,
            [Item::Command(Command::FullScreen)]
        );
        assert_eq!(Command::FullScreen.accelerator(), Some("F11"));
    }
}
