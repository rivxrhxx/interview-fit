//! Image validation and privacy preprocessing (R2.3, R3.3).
//!
//! Every image is checked for size, signature, and declared dimensions before any
//! pixel buffer is allocated, then decoded, rotated according to its Exif
//! orientation, and re-encoded as a baseline JPEG. Re-encoding drops every
//! metadata segment (Exif, GPS, XMP, IPTC, ICC, comments) from the output.

use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader};
use serde::Serialize;

/// Maximum accepted source size: 10 MiB.
pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
/// Maximum accepted pixel count: 16 megapixels.
pub const MAX_IMAGE_PIXELS: u64 = 16_000_000;
const OUTPUT_JPEG_QUALITY: u8 = 90;

const PNG_SIGNATURE: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
const JPEG_SIGNATURE: &[u8] = &[0xFF, 0xD8, 0xFF];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImageErrorCode {
    ImageInvalid,
    ImageTooLarge,
    InternalError,
}

/// Client-visible error. Only the stable code crosses the IPC boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImageError {
    pub code: ImageErrorCode,
}

impl ImageError {
    pub fn new(code: ImageErrorCode) -> Self {
        Self { code }
    }

    fn invalid() -> Self {
        Self::new(ImageErrorCode::ImageInvalid)
    }

    fn too_large() -> Self {
        Self::new(ImageErrorCode::ImageTooLarge)
    }
}

/// Identifies JPEG and PNG by file signature; file names and MIME hints are ignored.
pub fn detect_format(bytes: &[u8]) -> Option<ImageFormat> {
    if bytes.starts_with(PNG_SIGNATURE) {
        Some(ImageFormat::Png)
    } else if bytes.starts_with(JPEG_SIGNATURE) {
        Some(ImageFormat::Jpeg)
    } else {
        None
    }
}

/// Rejects empty images and images above [`MAX_IMAGE_PIXELS`] using header dimensions only.
pub fn check_dimensions(width: u32, height: u32) -> Result<(), ImageError> {
    if width == 0 || height == 0 {
        return Err(ImageError::invalid());
    }
    if u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return Err(ImageError::too_large());
    }
    Ok(())
}

/// Returns a metadata-free, orientation-normalized JPEG encoding of `bytes`.
pub fn prepare_image(bytes: &[u8]) -> Result<Vec<u8>, ImageError> {
    if bytes.is_empty() {
        return Err(ImageError::invalid());
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ImageError::too_large());
    }
    let format = detect_format(bytes).ok_or_else(ImageError::invalid)?;

    let mut decoder = ImageReader::with_format(Cursor::new(bytes), format)
        .into_decoder()
        .map_err(|_| ImageError::invalid())?;

    let (width, height) = decoder.dimensions();
    check_dimensions(width, height)?;

    let orientation = decoder.orientation().map_err(|_| ImageError::invalid())?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(|_| ImageError::invalid())?;
    image.apply_orientation(orientation);

    let rgb = image.to_rgb8();
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, OUTPUT_JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(|_| ImageError::new(ImageErrorCode::InternalError))?;

    Ok(jpeg)
}

#[cfg(test)]
mod tests {
    // Task 4.1 — verifies R2.3 (JPEG/PNG, 10 MiB, 16 MP) and R3.3 (orientation + metadata removal).
    use super::*;
    use image::{ImageEncoder, RgbImage, codecs::jpeg::JpegEncoder, codecs::png::PngEncoder};

    fn png_bytes(width: u32, height: u32) -> Vec<u8> {
        let image = RgbImage::from_fn(width, height, |x, y| {
            image::Rgb([(x * 40) as u8, (y * 40) as u8, 128])
        });
        let mut out = Vec::new();
        PngEncoder::new(&mut out)
            .write_image(
                image.as_raw(),
                width,
                height,
                image::ExtendedColorType::Rgb8,
            )
            .unwrap();
        out
    }

    fn jpeg_bytes(width: u32, height: u32) -> Vec<u8> {
        let image = RgbImage::from_fn(width, height, |x, _| image::Rgb([(x * 30) as u8, 90, 160]));
        let mut out = Vec::new();
        JpegEncoder::new_with_quality(&mut out, 90)
            .encode_image(&image)
            .unwrap();
        out
    }

    const LOCATION_MARKER: &[u8] = b"GPS 48.8584N 2.2945E device-serial-1234";

    /// Builds a little-endian TIFF/Exif payload with an Orientation tag and an
    /// ASCII tag carrying location-like text that must not survive preprocessing.
    fn exif_app1(orientation: u16) -> Vec<u8> {
        let mut tiff = vec![0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00];
        tiff.extend_from_slice(&2u16.to_le_bytes());
        // Orientation (0x0112), SHORT, count 1, value inline.
        tiff.extend_from_slice(&0x0112u16.to_le_bytes());
        tiff.extend_from_slice(&3u16.to_le_bytes());
        tiff.extend_from_slice(&1u32.to_le_bytes());
        tiff.extend_from_slice(&u32::from(orientation).to_le_bytes());
        // ImageDescription (0x010E), ASCII, stored after the IFD.
        let text_len = (LOCATION_MARKER.len() + 1) as u32;
        let text_offset = 8 + 2 + 12 * 2 + 4;
        tiff.extend_from_slice(&0x010Eu16.to_le_bytes());
        tiff.extend_from_slice(&2u16.to_le_bytes());
        tiff.extend_from_slice(&text_len.to_le_bytes());
        tiff.extend_from_slice(&(text_offset as u32).to_le_bytes());
        tiff.extend_from_slice(&0u32.to_le_bytes());
        tiff.extend_from_slice(LOCATION_MARKER);
        tiff.push(0);

        let mut payload = b"Exif\0\0".to_vec();
        payload.extend_from_slice(&tiff);
        let mut segment = vec![0xFF, 0xE1];
        segment.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
        segment.extend_from_slice(&payload);
        segment
    }

    fn with_exif(jpeg: &[u8], orientation: u16) -> Vec<u8> {
        let mut out = jpeg[..2].to_vec();
        out.extend_from_slice(&exif_app1(orientation));
        out.extend_from_slice(&jpeg[2..]);
        out
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack
            .windows(needle.len())
            .any(|window| window == needle)
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for byte in bytes {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = if crc & 1 == 1 {
                    (crc >> 1) ^ 0xEDB8_8320
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }

    /// A structurally valid PNG whose IHDR declares `width` x `height` but holds 1 pixel of data.
    fn png_with_declared_size(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = png_bytes(1, 1);
        // IHDR data starts after the 8-byte signature, 4-byte length, and 4-byte type.
        bytes[16..20].copy_from_slice(&width.to_be_bytes());
        bytes[20..24].copy_from_slice(&height.to_be_bytes());
        let crc = crc32(&bytes[12..29]);
        bytes[29..33].copy_from_slice(&crc.to_be_bytes());
        bytes
    }

    fn decoded_dimensions(jpeg: &[u8]) -> (u32, u32) {
        let decoded = image::load_from_memory(jpeg).unwrap();
        (decoded.width(), decoded.height())
    }

    #[test]
    fn rejects_empty_input() {
        assert_eq!(
            prepare_image(&[]).unwrap_err().code,
            ImageErrorCode::ImageInvalid
        );
    }

    #[test]
    fn rejects_unsupported_formats() {
        let gif = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04".to_vec();
        let svg = b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".to_vec();
        let webp = b"RIFF\x1a\x00\x00\x00WEBPVP8 ".to_vec();
        for bytes in [gif, svg, webp] {
            assert_eq!(
                prepare_image(&bytes).unwrap_err().code,
                ImageErrorCode::ImageInvalid
            );
        }
    }

    #[test]
    fn rejects_input_over_ten_mebibytes_before_decoding() {
        let mut bytes = png_bytes(2, 2);
        bytes.resize(MAX_IMAGE_BYTES + 1, 0);
        assert_eq!(
            prepare_image(&bytes).unwrap_err().code,
            ImageErrorCode::ImageTooLarge
        );
    }

    #[test]
    fn rejects_images_over_sixteen_megapixels_from_the_header() {
        // 5000 x 4000 = 20 MP declared, but almost no pixel data is present.
        let bytes = png_with_declared_size(5000, 4000);
        assert_eq!(
            prepare_image(&bytes).unwrap_err().code,
            ImageErrorCode::ImageTooLarge
        );
    }

    #[test]
    fn rejects_truncated_and_malformed_images() {
        let png = png_bytes(8, 8);
        let jpeg = jpeg_bytes(8, 8);
        let mut corrupt_jpeg = jpeg.clone();
        corrupt_jpeg.truncate(20);
        for bytes in [png[..30].to_vec(), corrupt_jpeg, vec![0xFF, 0xD8, 0xFF]] {
            assert_eq!(
                prepare_image(&bytes).unwrap_err().code,
                ImageErrorCode::ImageInvalid
            );
        }
    }

    #[test]
    fn accepts_png_and_reencodes_as_jpeg() {
        let jpeg = prepare_image(&png_bytes(6, 4)).unwrap();
        assert!(jpeg.starts_with(JPEG_SIGNATURE));
        assert_eq!(decoded_dimensions(&jpeg), (6, 4));
    }

    #[test]
    fn accepts_jpeg_input() {
        let jpeg = prepare_image(&jpeg_bytes(5, 3)).unwrap();
        assert_eq!(decoded_dimensions(&jpeg), (5, 3));
    }

    #[test]
    fn enforces_the_sixteen_megapixel_boundary_exactly() {
        assert_eq!(check_dimensions(4000, 4000), Ok(()));
        assert_eq!(
            check_dimensions(16_000_001, 1).unwrap_err().code,
            ImageErrorCode::ImageTooLarge
        );
        assert_eq!(
            check_dimensions(u32::MAX, u32::MAX).unwrap_err().code,
            ImageErrorCode::ImageTooLarge
        );
        assert_eq!(
            check_dimensions(0, 10).unwrap_err().code,
            ImageErrorCode::ImageInvalid
        );
    }

    #[test]
    fn removes_exif_metadata_including_location_text() {
        let source = with_exif(&jpeg_bytes(8, 4), 1);
        assert!(
            contains(&source, LOCATION_MARKER),
            "fixture must contain the marker"
        );

        let jpeg = prepare_image(&source).unwrap();

        assert!(!contains(&jpeg, b"Exif"));
        assert!(!contains(&jpeg, LOCATION_MARKER));
    }

    #[test]
    fn applies_exif_orientation_before_removing_it() {
        // Orientation 6 = rotate 90 degrees clockwise, so width and height swap.
        let source = with_exif(&jpeg_bytes(8, 4), 6);

        let jpeg = prepare_image(&source).unwrap();

        assert_eq!(decoded_dimensions(&jpeg), (4, 8));
    }

    #[test]
    fn serializes_errors_as_stable_client_codes() {
        let json = serde_json::to_string(&ImageError::new(ImageErrorCode::ImageTooLarge)).unwrap();
        assert_eq!(json, r#"{"code":"IMAGE_TOO_LARGE"}"#);
        let json = serde_json::to_string(&ImageError::new(ImageErrorCode::ImageInvalid)).unwrap();
        assert_eq!(json, r#"{"code":"IMAGE_INVALID"}"#);
    }
}
