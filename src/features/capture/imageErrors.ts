import type { ImageErrorCode } from "../../lib/validation/image";

export function imageErrorMessage(code: ImageErrorCode): string {
  switch (code) {
    case "IMAGE_INVALID":
      return "Choose a JPEG or PNG image.";
    case "IMAGE_TOO_LARGE":
      return "Choose an image up to 10 MB and 16 megapixels.";
    case "INTERNAL_ERROR":
      return "The photo could not be prepared. Try again or choose a different image.";
  }
}
