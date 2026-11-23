#[expect(
    clippy::print_stderr,
    reason = "a build script reports its failure on standard error"
)]
fn main() {
    // `answer_closing` is the only command the application defines; declaring
    // it here makes it a permission a capability grants (to a close's question
    // window), so no other window, and no page a Space window loads, can
    // invoke it.
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(&["answer_closing"]));
    if let Err(error) = tauri_build::try_build(attributes) {
        eprintln!("tauri-build failed: {error:#}");
        std::process::exit(1);
    }
}
