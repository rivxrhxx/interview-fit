import "./App.css";

const pillars = [
  ["Context", "Analyze the role and company cues in a job description."],
  ["Privacy", "Keep vendor credentials off-device and gate every image upload with consent."],
  ["Try-on", "Preview one curated interview-ready style without rating appearance."],
];

function App() {
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">KIROWEEN 2026 · FRANKENSTEIN</p>
        <h1>Interview Fit</h1>
        <p className="lede">
          A privacy-first desktop AI coach for interview-ready presentation.
        </p>
        <div className="status" role="status">
          Development harness ready
        </div>
      </header>

      <section className="grid" aria-label="Product pillars">
        {pillars.map(([title, description]) => (
          <article className="card" key={title}>
            <span className="card-index">0{pillars.findIndex(([item]) => item === title) + 1}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <section className="next-step">
        <div>
          <p className="eyebrow">NEXT SPEC TASK</p>
          <h2>Build the feature-oriented application shell</h2>
        </div>
        <code>.kiro/specs/interview-fit-mvp/tasks.md</code>
      </section>
    </main>
  );
}

export default App;
