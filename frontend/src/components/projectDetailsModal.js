import React from 'react';
import './projectDetailsModal.css';

const ProjectDetailsModal = ({ project, onClose }) => {
  if (!project) return null;

  // prefer BE-provided email, but fall back to a generic "email" if your join names it differently
  const email =
    project.supervisor_email ||
    project.email || // if you joined users as u.email
    '';

  const subject = `Query about "${project.title}"`;
  const body =
    `Hi ${project.supervisor_name},\n\n` +
    `I'm interested in your project "${project.title}". ` +
    `Could we discuss a couple of questions?\n\n` +
    `Thanks,\n`;

  const mailHref = email
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  const slotsLeft =
    typeof project.quota === 'number' && typeof project.spots_filled === 'number'
      ? Math.max(0, project.quota - project.spots_filled)
      : '-';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="proj-title">
      <div className="modal-container">
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <h2 id="proj-title">{project.title}</h2>

        <p><strong>Supervisor:</strong> {project.supervisor_name}</p>

        {/* NEW: show the email address (clickable) when available */}
        {email && (
          <p>
            <strong>Email:</strong>{' '}
            <a href={mailHref} className="link-email">
              {email}
            </a>
          </p>
        )}

        <p><strong>Topic:</strong> {project.topic || '—'}</p>
        <p><strong>Quota:</strong> {slotsLeft} slot(s) left</p>

        <hr />

        <p><strong>Project Description:</strong></p>
        <p>{project.full_description || '—'}</p>

        <p><strong>Prerequisites:</strong></p>
        <p>{project.prerequisites || '—'}</p>

        <div className="modal-actions modal-actions--single">
          {mailHref ? (
            <a className="contact-btn" href={mailHref}>✉️ Email Supervisor</a>
          ) : (
            <span className="contact-missing" title="No email provided by supervisor">
              Supervisor email unavailable
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailsModal;
