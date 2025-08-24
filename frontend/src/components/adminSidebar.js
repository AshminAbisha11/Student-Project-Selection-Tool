import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

export default function AdminSidebar() {
  const navigate = useNavigate();

  return (
    <aside className="as-sidebar">
      <img
        src="/assets/aston_logo.png"
        alt="Aston University"
        className="as-brand"
      />

      <nav className="as-nav">
        <NavLink
          to="/admin/allocations"
          className={({ isActive }) =>
            "as-navlink" + (isActive ? " active" : "")
          }
        >
          <span>Allocation run</span>
        </NavLink>

        <NavLink
          to="/admin/cycles"
          className={({ isActive }) =>
            "as-navlink" + (isActive ? " active" : "")
          }
        >
          <span>Manage cycles</span>
        </NavLink>

        <NavLink
          to="/admin/invite-admin"
          className={({ isActive }) =>
            "as-navlink" + (isActive ? " active" : "")
          }
        >
          <span>Invite admin</span>
        </NavLink>

        <NavLink
          to="/help-support"
          className={({ isActive }) =>
            "as-navlink" + (isActive ? " active" : "")
          }
        >
          <span>Help & docs</span>
        </NavLink>

        <div className="as-nav-spacer" />

        <button className="as-navlink danger" onClick={() => navigate("/logout")}>
          <span className="icon">↩</span>
          <span>Logout</span>
        </button>
      </nav>
    </aside>
  );
}
