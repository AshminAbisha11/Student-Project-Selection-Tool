import React from 'react';
import './projectCard.css';

const ProjectCard = ({ project, onViewDetails }) => {
  const quotaRemaining = project.quota - project.spots_filled;

  return (
    <div className="project-card">
      <div className="project-header">
        <h4>{project.title}</h4>
        <span className="heart-icon">❤️</span>
      </div>

      <p><strong>Supervisor:</strong> {project.supervisor_name}</p>
      <p><strong>Description:</strong> {project.description.slice(0, 100)}...</p>
      <p><strong>Quota remaining:</strong> {quotaRemaining} / {project.quota} spot{project.quota > 1 ? 's' : ''} available</p>

      <div className="project-actions">
        <button onClick={onViewDetails}>View Details</button>
        <button className="secondary">Add to Preference</button>
      </div>
    </div>
  );
};

export default ProjectCard;
