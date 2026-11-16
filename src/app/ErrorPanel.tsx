import { ERROR_POLICY, type ErrorCode, type Recovery } from "../lib/api/contracts";

const RECOVERY_LABELS: Record<Recovery, string> = {
  retry: "Try again",
  "retry-later": "Try again",
  "choose-another-image": "Choose another photo",
  "review-consent": "Review consent",
  "edit-job-description": "Edit job description",
  "start-over": "Start over",
};

interface ErrorPanelProps {
  code: ErrorCode;
  onRecover: (recovery: Recovery) => void;
}

/** Controlled, recoverable failure state with a primary action chosen by the error policy (R8.3). */
export function ErrorPanel({ code, onRecover }: ErrorPanelProps) {
  const { recovery } = ERROR_POLICY[code];
  return (
    <div className="photo-actions">
      <button type="button" className="button button-primary" onClick={() => onRecover(recovery)}>
        {RECOVERY_LABELS[recovery]}
      </button>
      {recovery !== "start-over" && (
        <button type="button" className="button button-secondary" onClick={() => onRecover("start-over")}>
          Start over
        </button>
      )}
    </div>
  );
}
