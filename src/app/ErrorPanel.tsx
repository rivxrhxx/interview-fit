import { ERROR_POLICY, type ErrorCode, type Recovery } from "../lib/api/contracts";
import { useI18n } from "../lib/i18n";

interface ErrorPanelProps {
  code: ErrorCode;
  onRecover: (recovery: Recovery) => void;
}

/** Controlled, recoverable failure state with a primary action chosen by the error policy (R8.3). */
export function ErrorPanel({ code, onRecover }: ErrorPanelProps) {
  const { m } = useI18n();
  const { recovery } = ERROR_POLICY[code];
  return (
    <div className="actions">
      <button type="button" className="button button-primary" onClick={() => onRecover(recovery)}>
        {m.recovery[recovery]}
      </button>
      {recovery !== "start-over" && (
        <button type="button" className="button button-text" onClick={() => onRecover("start-over")}>
          {m.recovery["start-over"]}
        </button>
      )}
    </div>
  );
}
