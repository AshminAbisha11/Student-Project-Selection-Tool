import React from 'react';
import { useNavigate } from 'react-router-dom';
import './projectCard.css';

const ProjectCard = ({
  project,
  onViewDetails,
  onAddPreference,
  onRemovePreference,
  isAdded,
  disableAdd,
}) => {
  const navigate = useNavigate();

  const quotaRemaining =
    typeof project.quota === 'number' && typeof project.spots_filled === 'number'
      ? Math.max(0, project.quota - project.spots_filled)
      : '-';

  // detect "student proposal ideas" / idea-pool projects
  const isIdeaPool =
    project?.is_student_pool === 1 ||
    project?.is_student_proposal === 1 ||
    (typeof project.title === 'string' &&
      project.title.trim().toLowerCase() === 'student proposal ideas') ||
    (typeof project.topic === 'string' &&
      project.topic.trim().toLowerCase() === 'student proposal ideas');

  // When the Add/Submit button is clicked:
  // - for idea-pool items: navigate to the My Proposal page
  // - otherwise: call onAddPreference (existing behaviour)
  const handlePrimaryClick = (e) => {
    if (isIdeaPool) {
      // route to the My Proposal page (change path if needed)
      navigate('/my-proposals');
    } else {
      if (typeof onAddPreference === 'function') onAddPreference(e);
    }
  };

  // label and title
  const addButtonLabel = isIdeaPool ? 'Submit My Proposal' : (disableAdd ? 'Max Reached' : 'Add to Preference');
  const addButtonTitle = isIdeaPool ? 'Go to your proposal' : (disableAdd ? 'Max 5 preferences reached' : 'Add to Preference');

  return (
    <div className="project-card">
      <div className="project-header">
        <h4>{project.title}</h4>
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
            onClick={handlePrimaryClick}
            // for idea-pool, allow navigation even if disableAdd is true;
            // for regular projects, respect disableAdd
            disabled={!isIdeaPool && disableAdd}
            title={addButtonTitle}
          >
            {addButtonLabel}
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
