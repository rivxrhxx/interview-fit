import { useId, useRef, useState, type FormEvent } from "react";
import { CONSENT_VERSION, createConsentRecord, type ConsentRecord } from "./consent";

interface ConsentGateProps {
  onAccept: (consent: ConsentRecord) => void;
  onDecline: () => void;
}

export function ConsentGate({ onAccept, onDecline }: ConsentGateProps) {
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

  const groups: Array<{ id: string; title: string; items: string[] }> = [
    {
      id: "consent-what",
      title: "What is sent",
      items: [
        "The photo you just confirmed, re-encoded on this device without location or camera metadata.",
        "The job description text you saved.",
        "The backend keeps a temporary copy for up to 15 minutes so you can preview attire, and deletes it sooner when you cancel or start over.",
      ],
    },
    {
      id: "consent-why",
      title: "Why",
      items: [
        "To produce optional, neutral suggestions about lighting, framing, background, and attire context.",
        "To preview one curated interview attire style if you choose to.",
      ],
    },
    {
      id: "consent-who",
      title: "Who receives it",
      items: [
        "The Interview Fit backend, operated for this app.",
        "YouCam (Perfect Corp.), the image-analysis and try-on provider the backend uses on Interview Fit's behalf. Its own retention terms apply to its processing.",
      ],
    },
    {
      id: "consent-never",
      title: "What Interview Fit never does",
      items: [
        "Diagnose health conditions or score appearance or attractiveness.",
        "Infer personality, emotion, or protected traits, or predict interview or hiring outcomes.",
        "Keep your photo in app history. Results are saved only if you export them.",
      ],
    },
  ];

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
          <span className="consent-text">
            I agree to send this photo and job description to Interview Fit and its provider for this analysis.
          </span>
        </label>
        {showError && (
          <p className="field-error" id={errorId}>
            Check the box to agree, or choose Not now.
          </p>
        )}
        <p className="meta">Consent version {CONSENT_VERSION}</p>
      </div>

      <div className="actions">
        <button type="submit" className="button button-primary">
          Agree and analyze
        </button>
        <button type="button" className="button button-text" onClick={onDecline}>
          Not now
        </button>
      </div>
    </form>
  );
}
