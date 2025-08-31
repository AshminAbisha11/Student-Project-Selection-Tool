// src/components/SupervisorNav.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import './supervisorNav.css';

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/**
 * Fixed sidebar for the supervisor area.
 * Width is exposed as a CSS var so the header/main can align using the same value.
 */
export default function SupervisorNav({ widthPx = 280 }) {
  return (
    <aside
      className="sv-sidebar"
      style={{ '--sidebar-w': `${widthPx}px` }}
      aria-label="Supervisor sidebar"
    >
      {/* Brand */}
      <NavLink to="/supervisor-dashboard" className="sv-logo" aria-label="Go to supervisor dashboard">
        <img src="/assets/aston_logo.png" alt="Aston University logo" />
        <div className="sv-brand">
          <div className="sv-brand-title">Aston University</div>
          <div className="sv-brand-sub">Supervisor Portal</div>
        </div>
      </NavLink>

      {/* Nav links */}
      <nav className="sv-nav" aria-label="Supervisor navigation">
        <NavLink
          to="/supervisor/allocated-students"
          end
          className={({ isActive }) => cx('sv-link', isActive && 'active')}
        >
          Allocated Students
        </NavLink>

        {/* In your router, /my-projects aliases /supervisor/my-projects */}
        <NavLink
          to="/my-projects"
          className={({ isActive }) => cx('sv-link', isActive && 'active')}
        >
          My Projects
        </NavLink>

        {/* Back-compat route to proposals list */}
        <NavLink
          to="/supervisor-list/proposals"
          className={({ isActive }) => cx('sv-link', isActive && 'active')}
        >
          Received Proposals
        </NavLink>

        <NavLink
          to="/logout"
          className={({ isActive }) => cx('sv-link', 'sv-link--danger', isActive && 'active')}
        >
          Logout
        </NavLink>
      </nav>
    </aside>
  );
}
