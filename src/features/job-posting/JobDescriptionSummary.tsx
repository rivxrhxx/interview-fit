import { formatCount, type JobDescription } from "./validation";

interface JobDescriptionSummaryProps {
  job: JobDescription;
  onEdit: () => void;
}

export function JobDescriptionSummary({ job, onEdit }: JobDescriptionSummaryProps) {
  return (
    <section className="panel" aria-labelledby="job-summary-heading">
      <div className="section-header">
        <h2 id="job-summary-heading" className="section-title">
          Job description
        </h2>
        <button type="button" className="button button-text button-small" onClick={onEdit} aria-label="Edit job description">
          Edit
        </button>
      </div>
      {/* Rendered as a text node only: job text is untrusted and never parsed as markup (R1.3). */}
      <p className="job-summary-text">{job.text}</p>
      <p className="meta">{formatCount(job.length)} characters saved</p>
    </section>
  );
}
