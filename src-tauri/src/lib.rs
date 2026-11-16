mod commands;
mod image_prep;
mod report_export;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Used only from Rust (save_report); the webview has no dialog permissions.
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::image::prepare_image,
            commands::report::save_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
