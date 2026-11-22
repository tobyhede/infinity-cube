# Window lifecycle

Trace an open from the native folder chooser through `open_aggregate_at` in [main.rs](../../../../packages/desktop/src-tauri/src/main.rs). The [registry](../../../../packages/desktop/src-tauri/src/aggregates.rs) tracks open and closing Aggregates. [server.rs](../../../../packages/desktop/src-tauri/src/server.rs) opens the host run, resolves the first product address and handles navigation for its Space windows. For a directory already in use, check both the registry and the cross-process lock described by ST-124.

An Edit takes the usual Space API through the custom scheme. The Rust host schedules Export and owns the final write. For a change to which bytes land on disk or when they land, start with ST-119 and the [host run tests](../../../../crates/host/tests/run.rs). The production Node sidecar is a peer for HTTP conformance. Running it exercises a different entry point from a Space window.

For “close while an Edit is being written”, trace the close event through [waiting.rs](../../../../packages/desktop/src-tauri/src/waiting.rs), its effects in `main.rs`, and `close_aggregate` in `server.rs`. Exercise the write finishing while the question is visible, Keep waiting, and Close without saving in the [waiting tests](../../../../packages/desktop/src-tauri/src/waiting/tests.rs). A quit can cover several Aggregates. ST-122 records the observable outcomes and which have been exercised in a real webview.

With the browser application built (`pnpm build`), run the shell cases from the repository root with `cargo test --locked -j 2 -p infinity-cube-desktop waiting`. For host write behaviour run `cargo test --locked -j 2 -p host --test run`.
