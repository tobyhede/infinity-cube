fn main() {
    // `open_talk` is the only command the application defines; declaring it
    // here makes it a permission the home window's capability grants, so no
    // other window, and no page a talk window loads, can invoke it.
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(&["open_talk"]));
    if let Err(error) = tauri_build::try_build(attributes) {
        eprintln!("tauri-build failed: {error:#}");
        std::process::exit(1);
    }
}
