// src/components/SupervisorNav.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import './supervisorNav.css';

export default function SupervisorNav() {
  return (
    <aside className="sv-sidebar">
      {/* Logo / brand */}
      <NavLink to="/supervisor-dashboard" className="sv-logo">
        <img src="/assets/aston_logo.png" alt="Aston University" />
        <div className="sv-brand">
          <div className="sv-brand-title">Aston University</div>
          <div className="sv-brand-sub">Supervisor Portal</div>
        </div>
      </NavLink>

      {/* Nav */}
      <nav className="sv-nav">
        <NavLink to="/supervisor/allocated" className="sv-link">
          Allocated Students
        </NavLink>
        <NavLink to="/my-projects" className="sv-link">
          My Projects
        </NavLink>
        <NavLink to="/supervisor-list/proposals" className="sv-link">
          Received Proposals
        </NavLink>
        <NavLink to="/logout" className="sv-link sv-link--danger">
          Logout
        </NavLink>
      </nav>
    </aside>
  );
}
