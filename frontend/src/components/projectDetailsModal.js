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

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>
        <h2>{project.title}</h2>
        <p><strong>Supervisor:</strong> {project.supervisor_name}</p>
        <p><strong>Topic:</strong> {project.topic}</p>
        <p>
          <strong>Quota:</strong>{' '}
          {project.quota - project.spots_filled} slot(s) left
        </p>
        <hr />
        <p><strong>Project Description:</strong></p>
        <p>{project.full_description}</p>
        <p><strong>Prerequisites:</strong></p>
        <p>{project.prerequisites}</p>

        <div className="modal-actions">
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
  );
};

export default ProjectDetailsModal;
