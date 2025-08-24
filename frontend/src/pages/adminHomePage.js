// src/pages/AdminHomePage.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/adminLayout";
import "./adminHomePage.css";

export default function AdminHomePage() {
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  }, []);

  const initials = (user?.name || "Admin")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AdminLayout>
      <div className="ah-grid">
        {/* HERO (top, full width) */}
        <section className="as-card hero">
          <div className="hero-row">
            <div className="ah-avatar">{initials}</div>
            <div className="ah-user">
              <h3 className="as-title">Welcome, {user?.name || "Admin"}</h3>
              {user?.email && <small>{user.email}</small>}
              <small className="ah-role">Role: {user?.role || "admin"}</small>
            </div>
            <div className="hero-spacer" />
            <div className="ah-actions">
              <button
                className="as-btn as-btn--ghost"
                onClick={() => navigate("/change-password")}
              >
                Change password
              </button>
              <button
                className="as-btn as-btn--primary"
                onClick={() => navigate("/profile")}
              >
                Profile settings
              </button>
            </div>
          </div>
        </section>

        {/* CYCLE (bottom-left) */}
        <section className="as-card cycle">
          <h3 className="as-title">Current Allocation Cycle</h3>

          <dl className="ah-rows">
            <div className="row">
              <dt>Name</dt>
              <dd>2025 Dissertation</dd>
            </div>
            <div className="row">
              <dt>Opens</dt>
              <dd>8/1/2025, 9:00:00 AM</dd>
            </div>
            <div className="row">
              <dt>Closes</dt>
              <dd>9/20/2025, 5:00:00 PM</dd>
            </div>
            <div className="row">
              <dt>Status</dt>
              <dd>
                <span className="ah-pill ok">Submissions OPEN</span>
                <span className="ah-pill ok">Before deadline</span>
              </dd>
            </div>
          </dl>

          <div className="ah-actions">
            <button
              className="as-btn as-btn--primary"
              onClick={() => navigate("/admin/allocations")}
            >
              Go to Allocation run
            </button>
            <button
              className="as-btn as-btn--ghost"
              onClick={() => navigate("/admin/cycles")}
            >
              Manage cycles
            </button>
          </div>
        </section>

        {/* QUICK (bottom-right) */}
        <section className="as-card quick">
          <h3 className="as-title">Quick Actions</h3>

          <div className="ah-quick">
            <button
              className="ah-qa"
              onClick={() => navigate("/admin/allocations")}
            >
              <span className="icon"></span> Run allocations
            </button>
            <button
              className="ah-qa"
              onClick={() => navigate("/admin/invite-admin")}
            >
              <span className="icon"></span> Invite/create admin
            </button>
            <button className="ah-qa" onClick={() => navigate("/admin/cycles")}>
              <span className="icon"></span> Open/close cycle
            </button>
            <button
              className="ah-qa"
              onClick={() => navigate("/help-support")}
            >
              <span className="icon"></span> Help & docs
            </button>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
