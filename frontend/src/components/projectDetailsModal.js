import React from 'react';
import './projectDetailsModal.css';

const ProjectDetailsModal = ({ project, onClose }) => {
  if (!project) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>{project.title}</h2>
        <p><strong>Supervisor:</strong> {project.supervisor_name}</p>
        <p><strong>Topic:</strong> {project.topic}</p>
        <p><strong>Quota:</strong> {project.quota - project.spots_filled} slot(s) left</p>
        <hr />
        <p><strong>Project Description:</strong></p>
        <p>{project.full_description}</p>
        <p><strong>Prerequisites:</strong></p>
        <p>{project.prerequisites}</p>
      </div>
    </div>
  );
};

export default ProjectDetailsModal;
