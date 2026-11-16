fn main() {
    // Declaring app commands in the manifest makes each one deny-by-default; the
    // capability files must grant them explicitly per window.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["prepare_image"])),
    )
    .expect("failed to run tauri-build");
}
