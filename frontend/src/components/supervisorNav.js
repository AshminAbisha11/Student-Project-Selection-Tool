// src/components/SupervisorNav.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import './supervisorNav.css';

export default function SupervisorNav() {
  return (
    <aside className="sv-sidebar">
      <nav className="sv-nav">
        <NavLink to="/supervisor/allocated" className="sv-link">
          Allocated Students
        </NavLink>
        <NavLink to="/my-projects" className="sv-link">
          My Projects
        </NavLink>
        <NavLink to="/supervisor/proposals" className="sv-link">
          Received Proposals
        </NavLink>
        <NavLink to="/logout" className="sv-link sv-link--danger">
          Logout
        </NavLink>
      </nav>
    </aside>
  );
}
