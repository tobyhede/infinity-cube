#[expect(
    clippy::print_stderr,
    reason = "a build script reports its failure on standard error"
)]
fn main() {
    // About names the commit the release workflow built from.
    println!("cargo::rerun-if-env-changed=INFINITY_CUBE_COMMIT");
    // The commands the application defines: `answer_closing` and the Start
    // window's `start_window_ping`. Declaring them here makes each a
    // permission a capability grants (`capabilities/closing.json` to a
    // close's question window, `capabilities/start.json` to the Start window),
    // so no other window, and no page a Space window loads, can invoke them.
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["answer_closing", "start_window_ping"]),
    );
    if let Err(error) = tauri_build::try_build(attributes) {
        eprintln!("tauri-build failed: {error:#}");
        std::process::exit(1);
    }
}
