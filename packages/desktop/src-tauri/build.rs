fn main() {
    // `open_talk` and `answer_closing` are the only commands the application
    // defines; declaring them here makes each a permission a capability
    // grants (`open_talk` to the home window, `answer_closing` to a close's
    // question window), so no other window, and no page a talk window loads,
    // can invoke either.
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(&["open_talk", "answer_closing"]));
    if let Err(error) = tauri_build::try_build(attributes) {
        eprintln!("tauri-build failed: {error:#}");
        std::process::exit(1);
    }
}
