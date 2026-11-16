import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { STEP_META, describeStep, type FlowStep } from "./flow";
import { StepProgress } from "./StepProgress";

interface AppShellProps {
  step: FlowStep;
  children: ReactNode;
}

export function AppShell({ step, children }: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const renderedStep = useRef(step);

  // Move focus to the new step heading so keyboard and screen-reader users land
  // on the content that changed. The first render keeps the document's natural
  // focus order so the skip link remains the first tab stop.
  useEffect(() => {
    if (renderedStep.current === step) return;
    renderedStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    mainRef.current?.focus();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={skipToMain}>
        Skip to main content
      </a>
      <header className="app-header">
        <p className="app-name">Interview Fit</p>
        <p className="app-tagline">Optional, neutral presentation guidance for your next interview.</p>
      </header>
      <StepProgress current={step} />
      <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">
        <h1 ref={headingRef} tabIndex={-1}>
          {STEP_META[step].heading}
        </h1>
        {children}
      </main>
      <p className="visually-hidden" role="status" aria-live="polite">
        {describeStep(step)}
      </p>
    </div>
  );
}
