import React from 'react';
import './projectCard.css';

const ProjectCard = ({
  project,
  onViewDetails,           
  onAddPreference,         
  onRemovePreference,      
  isAdded,
  disableAdd,              
}) => {
  const quotaRemaining =
    typeof project.quota === 'number' && typeof project.spots_filled === 'number'
      ? Math.max(0, project.quota - project.spots_filled)
      : '-';

  return (
    <div className="project-card">
      <div className="project-header">
        <h4>{project.title}</h4>
        <span className="heart-icon" title="Save">{'❤️'}</span>
      </div>

      <p><strong>Supervisor:</strong> {project.supervisor_name}</p>
      <p>
        <strong>Description:</strong>{' '}
        {(project.description || '').slice(0, 100)}
        {project.description && project.description.length > 100 ? '…' : ''}
      </p>
      <p>
        <strong>Quota remaining:</strong> {quotaRemaining} / {project.quota}{' '}
        spot{project.quota > 1 ? 's' : ''} available
      </p>

      <div className="project-actions">
        <button onClick={onViewDetails}>View Details</button>

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
            Remove
          </button>
        )}
      </div>
    </div>
  );
};

export default ProjectCard;
