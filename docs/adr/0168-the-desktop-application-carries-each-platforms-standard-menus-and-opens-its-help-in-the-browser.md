# The desktop application carries each platform's standard menus and opens its help in the browser

Status: accepted
Date: 2026-11-23
Refines: 0167
Related: 0155, 0166

ADR 0167 gave the desktop application native menus with the platform's accelerators, deciding File › New Space…, Open… and Quit, and on macOS the application, Edit and Window menus. It left Linux and Windows with File alone and no platform with Help, About details, full screen or a way to ask for an update, which a person looks for in any desktop application.

## The decision

- **Each platform gets its standard menus.** macOS: the application menu (About, Check for Updates…, Hide, Quit), File (New Space…, Open…, Close Window), Edit, View (the platform's full screen), Window (Minimize, Zoom, Bring All to Front and the open windows) and Help. Linux and Windows: File (New Space…, Open…, Close Window, Quit), View (Toggle Full Screen) and Help (InfinityCube Help, Report an Issue…, Check for Updates…, About). The accelerators added are `CmdOrCtrl+W` and, on Linux and Windows, `F11`.
- **Linux and Windows get no Edit menu.** The webview answers the clipboard keys itself there, and a menu accelerator would take them from it.
- **Help opens fixed addresses in the system browser, from the shell.** InfinityCube Help and Report an Issue… open InfinityCube's repository through the opener plugin. No window navigates to a remote origin (ST-121), the plugin's link-click script is not injected, and no capability grants the opener to a page.
- **Close Window and Quit go through the close wait.** Close Window closes the focused window as its own control does, and Quit asks the application to exit, so each waits for the last write (ST-122).
- **One update check runs at a time.** Check for Updates… asks the endpoint as the launch does; a check asked for while one runs, or once a newer build is installed, starts nothing and says why.
- **Reaching into the page from a menu is not decided here.** A Keyboard Shortcuts item would be the first channel from the shell into a Space window; the page's own key opens the sheet.

## Why

- **A person's hands and eyes already know these menus.** Help last, About with a version, full screen, and Close Window on `Ctrl+W` are what every desktop application has.
- **The clipboard keys must keep working in the editor.** An Edit menu's accelerators on GTK are the menu's, not the webview's.
- **A page must not open addresses.** The shell opening fixed addresses keeps ST-121's rule that no window leaves its origin, and adds no permission a page could use.

## Rejected

- **Edit menu on every platform.** It risks the editor's clipboard keys on GTK for a menu nobody needs there.
- **View › Reload and Zoom.** Reload can throw away a draft not yet completed; zoom is the canvas's own.
- **Open Help in a window of the shell's.** A remote page in a webview of ours is what ST-121 forbids.
- **Let the page open links through the opener.** It grants every Space a way out of its origin.

## Consequences

- Storage ST-121 restates the menus, Help and Check for Updates…; UI-8 lists the accelerators. `packages/desktop/src-tauri/src/menu.rs` lays the menus out as data, held by its tests.
- The desktop build passes `INFINITY_CUBE_COMMIT`, so About names the commit as `infinity-cube --version` does.
