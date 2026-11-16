import { ERROR_MESSAGES } from "../../lib/api/contracts";
import type { ImageErrorCode } from "../../lib/validation/image";

export function imageErrorMessage(code: ImageErrorCode): string {
  if (code === "INTERNAL_ERROR") return "The photo could not be prepared. Try again or choose a different image.";
  return ERROR_MESSAGES[code];
}
