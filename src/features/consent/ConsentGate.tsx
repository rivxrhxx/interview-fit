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

  return (
    <form className="consent-gate" onSubmit={handleSubmit} noValidate>
      <div className="consent-grid">
        <section aria-labelledby="consent-what">
          <h2 id="consent-what">What is sent</h2>
          <ul>
            <li>The photo you just confirmed, re-encoded on this device without location or camera metadata.</li>
            <li>The job description text you saved.</li>
          </ul>
        </section>
        <section aria-labelledby="consent-why">
          <h2 id="consent-why">Why</h2>
          <ul>
            <li>To produce optional, neutral suggestions about lighting, framing, background, and attire context.</li>
            <li>To preview one curated interview attire style if you choose to.</li>
          </ul>
        </section>
        <section aria-labelledby="consent-who">
          <h2 id="consent-who">Who receives it</h2>
          <ul>
            <li>The Interview Fit backend, operated for this app.</li>
            <li>
              YouCam (Perfect Corp.), the image-analysis and try-on provider the backend uses on Interview Fit&apos;s
              behalf. Its own retention terms apply to its processing.
            </li>
          </ul>
        </section>
        <section aria-labelledby="consent-never">
          <h2 id="consent-never">What Interview Fit never does</h2>
          <ul>
            <li>Diagnose health conditions or score appearance or attractiveness.</li>
            <li>Infer personality, emotion, or protected traits, or predict interview or hiring outcomes.</li>
            <li>Keep your photo in app history. Results are saved only if you export them.</li>
          </ul>
        </section>
      </div>

      <div className="consent-control">
        <input
          ref={checkboxRef}
          id={`${errorId}-checkbox`}
          type="checkbox"
          checked={agreed}
          onChange={(event) => {
            setAgreed(event.target.checked);
            if (event.target.checked) setShowError(false);
          }}
          aria-describedby={showError ? errorId : undefined}
          aria-invalid={showError || undefined}
        />
        <label htmlFor={`${errorId}-checkbox`}>
          I agree to send this photo and job description to Interview Fit and its provider for this analysis.
        </label>
      </div>
      {showError && (
        <p className="field-error" id={errorId}>
          Check the box to agree, or choose Not now.
        </p>
      )}
      <p className="field-hint">Consent version {CONSENT_VERSION}</p>

      <div className="photo-actions">
        <button type="submit" className="button button-primary">
          Agree and analyze
        </button>
        <button type="button" className="button button-secondary" onClick={onDecline}>
          Not now
        </button>
      </div>
    </form>
  );
}
