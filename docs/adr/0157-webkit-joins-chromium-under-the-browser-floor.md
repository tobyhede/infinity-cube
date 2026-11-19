# WebKit joins Chromium under the browser floor

Status: accepted
Date: 2026-11-18
Refines: 0071
Related: 0052, 0069, 0155

ADR 0071 sets the browser floor at any current evergreen browser that natively implements the `Uint8Array` base64 and hexadecimal codecs. In practice the repository tests Chromium only (`pnpm e2e`, `pnpm e2e:ladle`). ADR 0155 ships the desktop application with Tauri, which draws in the operating system's own engine: WebView2 (Chromium) on Windows, WKWebView on macOS and WebKitGTK on Linux. The WebKit versions follow the installed operating system or distribution, not an evergreen update channel.

## The decision

- **WebKit is a supported engine.** CI runs the Playwright end-to-end suite in a WebKit project beside the Chromium one, and a failure there is a failure of the change.
- **The desktop application declares a minimum operating system.** Its macOS bundle sets a minimum macOS version, and its Linux packages a minimum WebKitGTK version, each the oldest whose engine provides the native `Uint8Array` codecs and passes the suite. The floor of ADR 0071 is unchanged; what changes is that the desktop application enforces it by refusing to install on an older system rather than leaving it to an evergreen browser.
- **Windows needs no minimum beyond WebView2's evergreen runtime.**

## Why

- **Most presenters are likely on macOS.** Shipping Windows first would avoid WebKit but leave the likeliest audience out.
- **A WebKit defect found by CI costs far less than one found on stage.** The application has never been exercised in WebKit, and the desktop application makes it the default engine on two of three platforms.

## Rejected

- **Windows-only first, where WebView2 is Chromium.** No new engine to test, but no macOS or Linux application.
- **No minimum operating system, relying on ADR 0071's wording.** A presenter on an older macOS would install an application that fails on its first product URL, because the product-URL codec (ADR 0069) reads its compact identifiers with them.

## Consequences

- This ADR refines 0071: "evergreen browser" becomes "evergreen browser, or the declared minimum system for the desktop application".
- Every behaviour `pnpm e2e` tests must hold in WebKit as well as Chromium. Whether the Ladle story suite (ADR 0052) also runs in WebKit is left to the ticket that adds the WebKit project.
- The minimum versions are found by testing, recorded in the desktop application's bundle configuration, and restated where ADR 0071's floor is, `docs/agents/build-tooling.md` (the platform-floor rule). AGENTS.md's E2E line, which says `pnpm e2e` runs Chromium only, changes in the same change as the WebKit project.
