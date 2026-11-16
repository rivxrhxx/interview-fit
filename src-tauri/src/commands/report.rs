use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::report_export::{self, ReportError, ReportErrorCode};

#[derive(Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SaveStatus {
    Saved,
    Cancelled,
}

#[derive(Debug, Serialize)]
pub struct SaveOutcome {
    pub status: SaveStatus,
}

fn save_failed() -> ReportError {
    ReportError::new(ReportErrorCode::ReportSaveFailed)
}

/// Opens the native save dialog and writes the text report only to the path
/// the user confirms. Nothing is written if the dialog is cancelled.
#[tauri::command]
pub async fn save_report(
    app: AppHandle,
    suggested_name: String,
    contents: String,
) -> Result<SaveOutcome, ReportError> {
    report_export::validate_report(&contents)?;
    let file_name = report_export::suggested_file_name(&suggested_name);

    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Save Interview Fit report")
            .set_file_name(file_name)
            .add_filter("Markdown", &["md"])
            .blocking_save_file()
    })
    .await
    .map_err(|_| save_failed())?;

    let Some(picked) = picked else {
        return Ok(SaveOutcome {
            status: SaveStatus::Cancelled,
        });
    };
    // If `.md` had to be appended, the final path was never confirmed in the dialog,
    // so it must not overwrite an existing file.
    let (path, renamed) =
        report_export::markdown_destination(picked.into_path().map_err(|_| save_failed())?);
    tauri::async_runtime::spawn_blocking(move || {
        report_export::write_report_to(&path, &contents, renamed)
    })
    .await
    .map_err(|_| save_failed())??;
    Ok(SaveOutcome {
        status: SaveStatus::Saved,
    })
}
