import { useId, useRef, useState, type FormEvent } from "react";
import { JOB_DESCRIPTION_MAX_LENGTH } from "../../lib/validation/limits";
import {
  formatCount,
  jobDescriptionErrorMessage,
  normalizeJobDescription,
  validateJobDescription,
  type JobDescription,
  type JobDescriptionError,
} from "./validation";

interface JobDescriptionFormProps {
  initialText?: string;
  onSubmit: (job: JobDescription) => void;
}

export function JobDescriptionForm({ initialText = "", onSubmit }: JobDescriptionFormProps) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<JobDescriptionError | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const hintId = useId();
  const counterId = useId();
  const errorId = useId();

  const length = normalizeJobDescription(text).length;
  const overLimit = length > JOB_DESCRIPTION_MAX_LENGTH;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateJobDescription(text);
    if (!result.ok) {
      setError(result.error);
      fieldRef.current?.focus();
      return;
    }
    setError(null);
    onSubmit(result.value);
  }

  function handleChange(value: string) {
    setText(value);
    if (error) setError(null);
  }

  const describedBy = [hintId, counterId, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label className="field-label" htmlFor={fieldId}>
          Job description
        </label>
        <p className="field-hint" id={hintId}>
          Paste the posting you are preparing for. It is treated as plain text and used only to tailor optional
          suggestions.
        </p>
        <textarea
          id={fieldId}
          ref={fieldRef}
          className="job-field"
          rows={9}
          value={text}
          onChange={(event) => handleChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          spellCheck
        />
        <div className="field-footer">
          {error && (
            <p className="field-error" id={errorId}>
              {jobDescriptionErrorMessage(error)}
            </p>
          )}
          <p className="field-counter" id={counterId} data-over-limit={overLimit || undefined}>
            {formatCount(length)} / {formatCount(JOB_DESCRIPTION_MAX_LENGTH)} characters
          </p>
        </div>
      </div>
      <div className="actions">
        <button type="submit" className="button button-primary">
          Save job description
        </button>
      </div>
    </form>
  );
}
