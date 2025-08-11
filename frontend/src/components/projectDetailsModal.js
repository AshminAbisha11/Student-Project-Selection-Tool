import React from 'react';
import './projectDetailsModal.css';

const ProjectDetailsModal = ({
  project,
  onClose,
  isAdded,
  onAddPreference,
  onRemovePreference,
  disableAdd, // optional
}) => {
  if (!project) return null;

  // Email link (only if we have an email from the API)
  const email = project.supervisor_email; // make sure your /details API returns this
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
    <div className="modal-overlay">
      <div className="modal-container">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h2>{project.title}</h2>

        <p><strong>Supervisor:</strong> {project.supervisor_name}</p>
        <p><strong>Topic:</strong> {project.topic}</p>
        <p>
          <strong>Quota:</strong> {slotsLeft} slot(s) left
        </p>

        <hr />

        <p><strong>Project Description:</strong></p>
        <p>{project.full_description}</p>

        <p><strong>Prerequisites:</strong></p>
        <p>{project.prerequisites}</p>

        <div className="modal-actions">
          <div className="contact-area">
            {mailHref ? (
              <a className="contact-btn" href={mailHref}>
                ✉️ Email Supervisor
              </a>
            ) : (
              <span className="contact-missing" title="No email provided by supervisor">
                Supervisor email unavailable
              </span>
            )}
          </div>

          <div className="pref-area">
            {!isAdded ? (
              <button
                className="secondary"
                onClick={onAddPreference}
                disabled={disableAdd}
                title={disableAdd ? 'Max 5 preferences reached' : 'Add to Preference'}
              >
                {disableAdd ? 'Max Reached' : 'Add to Preference'}
              </button>
            ) : (
              <button className="danger" onClick={onRemovePreference}>
                Remove from Preferences
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailsModal;
