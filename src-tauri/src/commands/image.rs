use tauri::ipc::{InvokeBody, Request, Response};

use crate::image_prep::{self, ImageError, ImageErrorCode};

/// Validates a selected image and returns a metadata-free, orientation-normalized
/// JPEG. The source bytes must be sent as a raw binary IPC body.
#[tauri::command]
pub async fn prepare_image(request: Request<'_>) -> Result<Response, ImageError> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(ImageError::new(ImageErrorCode::ImageInvalid));
    };
    if bytes.len() > image_prep::MAX_IMAGE_BYTES {
        return Err(ImageError::new(ImageErrorCode::ImageTooLarge));
    }
    let bytes = bytes.clone();
    let jpeg = tauri::async_runtime::spawn_blocking(move || image_prep::prepare_image(&bytes))
        .await
        .map_err(|_| ImageError::new(ImageErrorCode::InternalError))??;
    Ok(Response::new(jpeg))
}
