import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { FLOW_STEPS, STEP_META, describeStep, isProgressStep, type FlowStep } from "./flow";
import { StepProgress } from "./StepProgress";

interface AppShellProps {
  step: FlowStep;
  /** Optional message shown under the heading and announced with the step. */
  notice?: string;
  children: ReactNode;
}

export function AppShell({ step, notice, children }: AppShellProps) {
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

  const meta = STEP_META[step];
  const position = isProgressStep(step) ? FLOW_STEPS.indexOf(step) + 1 : null;

  return (
    <div className="app">
      <a className="skip-link" href="#main-content" onClick={skipToMain}>
        Skip to main content
      </a>
      <header className="topbar">
        <p className="brand">Interview Fit</p>
        <StepProgress current={step} />
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">
        {/* The live region below announces the step; this caption is visual only. */}
        <p className="step-caption" aria-hidden="true">
          {position ? `${position} of ${FLOW_STEPS.length} · ${meta.label}` : meta.label}
        </p>
        <h1 ref={headingRef} tabIndex={-1}>
          {meta.heading}
        </h1>
        <p className="step-description">{meta.description}</p>
        {notice && <p className={step === "error" ? "notice notice-danger" : "notice"}>{notice}</p>}
        <div className="step-body">{children}</div>
      </main>
      <p className="visually-hidden" role="status" aria-live="polite">
        {notice ? `${describeStep(step)}. ${notice}` : describeStep(step)}
      </p>
    </div>
  );
}
