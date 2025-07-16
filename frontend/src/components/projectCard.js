import React from 'react';
import './projectCard.css';

const ProjectCard = ({ project }) => {
  return (
    <div className="project-card">
      <div className="project-header">
        <h4>{project.title}</h4>
        <span className="heart-icon">❤️</span>
      </div>
      <p><strong>Supervisor:</strong> {project.supervisor_name}</p>
      <p><strong>Description:</strong> {project.description}</p>
      <p><strong>Quota remaining:</strong> {project.quota - project.spots_filled} / {project.quota} spots available</p>
      <div className="project-actions">
        <button>View Details</button>
        <button className="secondary">Add to Preference</button>
      </div>
    </div>
  );
};

export default ProjectCard;
