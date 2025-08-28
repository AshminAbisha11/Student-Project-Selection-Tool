// src/pages/SupervisorDashboardPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ProfileDropdown from '../components/profileDropdown';
import SupervisorNav from '../components/supervisorNav';
import './supervisorDashboardPage.css';

const API = 'http://localhost:5000';

function getNameFromToken() {
  try {
    const t = localStorage.getItem('token');
    if (!t) return null;
    const payload = JSON.parse(
      atob((t.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/'))
    );
    return payload?.name || null;
  } catch {
    return null;
  }
}

export default function SupervisorDashboardPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState({
    projects: 0,
    pendingProposals: 0,
    allocatedStudents: 0,
  });

  // Memoize token & user so they don't change identity each render
  const token = useMemo(() => localStorage.getItem('token'), []);
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const userRole = (user?.role || '').toLowerCase();
  const userId = user?.user_id;
  const name = useMemo(() => user?.name || getNameFromToken() || 'Supervisor', [user]);

  // auth + role guard
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (userRole !== 'supervisor') {
      navigate('/student-dashboard', { replace: true });
    }
  }, [navigate, token, user, userRole]);

  // load dashboard overview
  useEffect(() => {
    if (!token || !userId) return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(`${API}/supervisor/overview`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        setOverview({
          projects: Number(data.projects || 0),
          pendingProposals: Number(data.pendingProposals || 0),
          allocatedStudents: Number(data.allocatedStudents || 0),
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn('Overview load failed:', err?.response?.data || err.message);
          if (err.response?.status === 401 || err.response?.status === 403) {
            localStorage.clear();
            navigate('/login', { replace: true });
          }
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [token, userId, navigate]);

  return (
    <div
      className="dashboard-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <SupervisorNav />

      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Supervisor Project Portal</h2>
          <ProfileDropdown />
        </header>

        <div className="dashboard-welcome">
          <h3>Welcome, {name}!</h3>
          <p>Here’s a quick overview of your project journey</p>
        </div>

        {/* KPI cards */}
        <div className="dashboard-cards">
          <div
            className="dashboard-card"
            onClick={() => navigate('/supervisor/my-projects')}
            style={{ cursor: 'pointer' }}
            aria-label="View my projects"
            title="View My Projects"
          >
            <h4>{loading ? '—' : overview.projects}</h4>
            <p>Projects Created</p>
          </div>

        <div
            className="dashboard-card"
            onClick={() => navigate('/supervisor/received-proposals')}
            style={{ cursor: 'pointer' }}
            aria-label="Review proposals"
            title="Review Proposals"
          >
            <h4>{loading ? '—' : overview.pendingProposals}</h4>
            <p>Proposals Pending Review</p>
          </div>

          <div
            className="dashboard-card"
            onClick={() => navigate('/supervisor/allocated-students')}
            style={{ cursor: 'pointer' }}
            aria-label="View allocated students"
            title="View Allocated Students"
          >
            <h4>{loading ? '—' : overview.allocatedStudents}</h4>
            <p>Students Allocated</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-actions">
          <h4>Quick Actions</h4>
          <div className="qa-row">
            <button
              className="btn btn-primary"
              onClick={() => navigate('/supervisor/create-project')}
              disabled={loading}
              title="Create a new project"
            >
              Add New Project
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => navigate('/supervisor/my-projects')}
              disabled={loading}
              title="Go to My Projects"
            >
              My Projects
            </button>
          </div>
        </div>

        {/* NEW: Account & Settings (after Quick Actions) */}
        <section className="dashboard-settings">
          <h4>Account &amp; Settings</h4>
          <div className="settings-grid">
            <button
              className="settings-card"
              onClick={() => navigate('/settings/profile')}
              title="Edit your profile details"
            >
              <div className="settings-content">
                <h5>Profile Settings</h5>
                <p>Update your name, department and contact details.</p>
              </div>
              <span className="settings-cta" aria-hidden>Manage →</span>
            </button>

            <button
              className="settings-card"
              onClick={() => navigate('/settings/password')}
              title="Change your password"
            >
              <div className="settings-content">
                <h5>Change Password</h5>
                <p>Choose a strong password and keep your account secure.</p>
              </div>
              <span className="settings-cta" aria-hidden>Update →</span>
            </button>


            <button
              className="settings-card"
              onClick={() => navigate('/help')}
              title="Open help and FAQ"
            >
              <div className="settings-content">
                <h5>Help &amp; FAQ</h5>
                <p>Common questions and ways to contact support.</p>
              </div>
              <span className="settings-cta" aria-hidden>Open →</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
