import { formatCount, type JobDescription } from "./validation";

interface JobDescriptionSummaryProps {
  job: JobDescription;
  onEdit: () => void;
}

export function JobDescriptionSummary({ job, onEdit }: JobDescriptionSummaryProps) {
  return (
    <section className="summary-card" aria-labelledby="job-summary-heading">
      <div className="summary-header">
        <h2 id="job-summary-heading">Job description</h2>
        <button type="button" className="button button-secondary" onClick={onEdit}>
          Edit job description
        </button>
      </div>
      {/* Rendered as a text node only: job text is untrusted and never parsed as markup (R1.3). */}
      <p className="job-summary-text">{job.text}</p>
      <p className="field-hint">{formatCount(job.length)} characters saved</p>
    </section>
  );
}
