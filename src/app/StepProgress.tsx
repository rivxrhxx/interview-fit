import { FLOW_STEPS, STEP_META, isProgressStep, type FlowStep } from "./flow";

interface StepProgressProps {
  current: FlowStep;
}

/** Segmented progress bar. Labels stay available to assistive technology. */
export function StepProgress({ current }: StepProgressProps) {
  const currentIndex = isProgressStep(current) ? FLOW_STEPS.indexOf(current) : -1;

  return (
    <nav className="step-progress" aria-label="Progress">
      <ol>
        {FLOW_STEPS.map((step, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={step} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="visually-hidden">{STEP_META[step].label}</span>
              {state === "complete" && <span className="visually-hidden">(completed)</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
