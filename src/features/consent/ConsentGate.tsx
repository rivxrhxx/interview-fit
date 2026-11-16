import { useId, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../../lib/i18n";
import { CONSENT_VERSION, createConsentRecord, type ConsentRecord } from "./consent";

interface ConsentGateProps {
  onAccept: (consent: ConsentRecord) => void;
  onDecline: () => void;
}

export function ConsentGate({ onAccept, onDecline }: ConsentGateProps) {
  const { m } = useI18n();
  const [agreed, setAgreed] = useState(false);
  const [showError, setShowError] = useState(false);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreed) {
      setShowError(true);
      checkboxRef.current?.focus();
      return;
    }
    onAccept(createConsentRecord());
  }

  const groups = m.consent.groups;

  return (
    <form className="step-stack" onSubmit={handleSubmit} noValidate>
      <div className="panel consent-panel">
        {groups.map((group) => (
          <section key={group.id} className="consent-group" aria-labelledby={group.id}>
            <h2 id={group.id} className="group-title">
              {group.title}
            </h2>
            <ul className="bullet-list">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="field">
        <label className="consent-check">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={agreed}
            onChange={(event) => {
              setAgreed(event.target.checked);
              if (event.target.checked) setShowError(false);
            }}
            aria-describedby={showError ? errorId : undefined}
            aria-invalid={showError || undefined}
          />
          <span className="consent-text">{m.consent.agree}</span>
        </label>
        {showError && (
          <p className="field-error" id={errorId}>
            {m.consent.error}
          </p>
        )}
        <p className="meta">{m.consent.version(CONSENT_VERSION)}</p>
      </div>

      <div className="actions">
        <button type="submit" className="button button-primary">
          {m.consent.submit}
        </button>
        <button type="button" className="button button-text" onClick={onDecline}>
          {m.consent.decline}
        </button>
      </div>
    </form>
  );
}
