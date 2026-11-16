import { useI18n } from "../lib/i18n";
import { FLOW_STEPS, isProgressStep, type FlowStep } from "./flow";

interface StepProgressProps {
  current: FlowStep;
}

/** Segmented progress bar. Labels stay available to assistive technology. */
export function StepProgress({ current }: StepProgressProps) {
  const { m } = useI18n();
  const currentIndex = isProgressStep(current) ? FLOW_STEPS.indexOf(current) : -1;

  return (
    <nav className="step-progress" aria-label={m.shell.progressLabel}>
      <ol>
        {FLOW_STEPS.map((step, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={step} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="visually-hidden">{m.steps[step].label}</span>
              {state === "complete" && <span className="visually-hidden">{m.shell.completed}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
