//! Explicit report export (R7.1, R7.2). The webview supplies only the report
//! text and a suggested file name; the destination always comes from the native
//! save dialog the user confirms.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Upper bound for a text report.
pub const MAX_REPORT_BYTES: usize = 512 * 1024;
pub const DEFAULT_FILE_NAME: &str = "interview-fit-report.md";
const MAX_NAME_CHARS: usize = 80;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReportErrorCode {
    ReportInvalid,
    ReportSaveFailed,
}

/// Client-visible error. Paths and I/O details never cross the IPC boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReportError {
    pub code: ReportErrorCode,
}

impl ReportError {
    pub fn new(code: ReportErrorCode) -> Self {
        Self { code }
    }
}

/// Accepts only non-empty, bounded text with no embedded image data (R7.2).
pub fn validate_report(contents: &str) -> Result<(), ReportError> {
    let lower = contents.to_ascii_lowercase();
    let embeds_image =
        lower.contains("data:image") || lower.contains("<img") || contents.contains("![");
    if contents.is_empty()
        || contents.len() > MAX_REPORT_BYTES
        || contents.contains('\0')
        || embeds_image
    {
        return Err(ReportError::new(ReportErrorCode::ReportInvalid));
    }
    Ok(())
}

/// Reduces a suggested name to a safe Markdown basename for the save dialog.
pub fn suggested_file_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let mut name = String::new();
    let mut in_gap = false;
    for character in base.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
            name.push(character);
            in_gap = false;
        } else if !in_gap {
            name.push('-');
            in_gap = true;
        }
    }
    let name: String = name
        .trim_start_matches('.')
        .chars()
        .take(MAX_NAME_CHARS)
        .collect();
    if name.is_empty() {
        return DEFAULT_FILE_NAME.to_string();
    }
    if name.to_ascii_lowercase().ends_with(".md") {
        name
    } else {
        format!("{name}.md")
    }
}

/// Keeps the user's chosen location but guarantees a Markdown extension. The flag
/// is true when the name had to change, i.e. the final path was never confirmed.
pub fn markdown_destination(path: PathBuf) -> (PathBuf, bool) {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension) if extension.eq_ignore_ascii_case("md") => (path, false),
        Some(_) => {
            let mut name = path.file_name().unwrap_or_default().to_os_string();
            name.push(".md");
            (path.with_file_name(name), true)
        }
        None => (path.with_extension("md"), true),
    }
}

/// Writes the report. A path the user did not confirm (`must_be_new`) is never
/// overwritten; the dialog's own overwrite prompt covers confirmed paths.
pub fn write_report_to(path: &Path, contents: &str, must_be_new: bool) -> Result<(), ReportError> {
    use std::io::Write;
    let failed = |_| ReportError::new(ReportErrorCode::ReportSaveFailed);
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(!must_be_new)
        .create_new(must_be_new)
        .truncate(!must_be_new)
        .open(path)
        .map_err(failed)?;
    file.write_all(contents.as_bytes()).map_err(failed)
}

#[cfg(test)]
mod tests {
    // Task 9.1 — explicit report export: input validation and safe writes (R7.2, tauri-rust steering).
    use super::*;
    use std::path::PathBuf;

    fn with_markdown_extension(path: PathBuf) -> PathBuf {
        markdown_destination(path).0
    }

    fn write_report(path: &Path, contents: &str) -> Result<(), ReportError> {
        write_report_to(path, contents, false)
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("interview-fit-test-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn rejects_empty_oversized_and_binary_reports() {
        assert_eq!(
            validate_report("").unwrap_err().code,
            ReportErrorCode::ReportInvalid
        );
        let huge = "a".repeat(MAX_REPORT_BYTES + 1);
        assert_eq!(
            validate_report(&huge).unwrap_err().code,
            ReportErrorCode::ReportInvalid
        );
        assert_eq!(
            validate_report("ok\0hidden").unwrap_err().code,
            ReportErrorCode::ReportInvalid
        );
        assert!(validate_report("# Interview Fit report\n").is_ok());
    }

    #[test]
    fn rejects_reports_that_embed_images() {
        for embedded in [
            "![photo](data:image/jpeg;base64,/9j/4AAQ)",
            "<img src=\"x.png\">",
            "data:image/png;base64,iVBORw0KGgo",
        ] {
            assert_eq!(
                validate_report(embedded).unwrap_err().code,
                ReportErrorCode::ReportInvalid
            );
        }
    }

    #[test]
    fn suggested_names_are_plain_markdown_basenames() {
        assert_eq!(
            suggested_file_name("interview-fit-report-2026-11-16.md"),
            "interview-fit-report-2026-11-16.md"
        );
        assert_eq!(suggested_file_name("../../etc/passwd"), "passwd.md");
        assert_eq!(
            suggested_file_name("C:\\Users\\me\\report.txt"),
            "report.txt.md"
        );
        assert_eq!(
            suggested_file_name("my report (final).md"),
            "my-report-final-.md"
        );
        assert_eq!(suggested_file_name(".hidden"), "hidden.md");
        assert_eq!(suggested_file_name(""), DEFAULT_FILE_NAME);
        assert_eq!(suggested_file_name("///"), DEFAULT_FILE_NAME);
        assert!(suggested_file_name(&"x".repeat(500)).len() <= 83);
    }

    #[test]
    fn enforces_a_markdown_extension_on_the_chosen_path() {
        assert_eq!(
            with_markdown_extension(PathBuf::from("/tmp/report")),
            PathBuf::from("/tmp/report.md")
        );
        assert_eq!(
            with_markdown_extension(PathBuf::from("/tmp/report.md")),
            PathBuf::from("/tmp/report.md")
        );
        assert_eq!(
            with_markdown_extension(PathBuf::from("/tmp/report.MD")),
            PathBuf::from("/tmp/report.MD")
        );
        assert_eq!(
            with_markdown_extension(PathBuf::from("/tmp/report.exe")),
            PathBuf::from("/tmp/report.exe.md")
        );
    }

    #[test]
    fn writes_exactly_the_report_text_to_the_chosen_path() {
        let dir = temp_dir("write");
        let path = dir.join("report.md");

        write_report(&path, "# Report\n").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# Report\n");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn never_overwrites_a_file_the_dialog_did_not_confirm() {
        let dir = temp_dir("no-overwrite");
        let chosen = dir.join("notes");
        let existing = dir.join("notes.md");
        std::fs::write(&existing, "keep me").unwrap();

        let (path, renamed) = markdown_destination(chosen);
        assert!(renamed);
        let error = write_report_to(&path, "# Report\n", renamed).unwrap_err();

        assert_eq!(error.code, ReportErrorCode::ReportSaveFailed);
        assert_eq!(std::fs::read_to_string(&existing).unwrap(), "keep me");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn overwrites_only_the_exact_path_the_user_confirmed() {
        let dir = temp_dir("confirmed");
        let chosen = dir.join("report.md");
        std::fs::write(&chosen, "old").unwrap();

        let (path, renamed) = markdown_destination(chosen.clone());
        assert!(!renamed);
        write_report_to(&path, "# New\n", renamed).unwrap();

        assert_eq!(std::fs::read_to_string(&chosen).unwrap(), "# New\n");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reports_write_failures_without_exposing_the_path() {
        let missing = temp_dir("missing").join("no-such-dir").join("report.md");

        let error = write_report(&missing, "# Report\n").unwrap_err();

        assert_eq!(error.code, ReportErrorCode::ReportSaveFailed);
        let json = serde_json::to_string(&error).unwrap();
        assert_eq!(json, r#"{"code":"REPORT_SAVE_FAILED"}"#);
    }
}
