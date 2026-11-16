import type { Messages } from "../../lib/i18n";
import type { ImageErrorCode } from "../../lib/validation/image";

export function imageErrorMessage(m: Messages, code: ImageErrorCode): string {
  return code === "INTERNAL_ERROR" ? m.photo.prepareFailed : m.errors[code];
}
