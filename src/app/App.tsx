import "./App.css";
import { AppShell } from "./AppShell";

function App() {
  return (
    <AppShell step="draft">
      <p className="step-intro">
        Paste the job description you are preparing for. Interview Fit uses it only to tailor optional presentation
        suggestions.
      </p>
    </AppShell>
  );
}

export default App;
