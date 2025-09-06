// src/pages/SupervisorDashboardPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ProfileDropdown from '../components/profileDropdown';
import SupervisorNav from '../components/supervisorNav';
import './supervisorDashboardPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
// If your server is mounted at /supervisor-list, change this to '/supervisor-list'
const SUP_BASE = '/supervisor';

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

/** Small helper: GET with auth + 401/403 handling */
async function apiGet(path, navigate, signal) {
  const token = localStorage.getItem('token');
  try {
    const { data } = await axios.get(`${API}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    });
    return data;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      localStorage.clear();
      try { navigate('/login', { replace: true }); } catch {}
      throw new Error(
        err?.response?.data?.message || 'Your session has expired. Please log in again.'
      );
    }
    throw err;
  }
}

export default function SupervisorDashboardPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState({
    projects: 0,
    pendingProposals: 0,
    allocatedStudents: 0, // <-- match controller key
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
  const loadOverview = useCallback(async (signal) => {
    setLoading(true);
    try {
      const data = await apiGet(`${SUP_BASE}/overview`, navigate, signal);
      setOverview({
        projects: Number(data.projects || 0),
        pendingProposals: Number(data.pendingProposals || 0),
        allocatedStudents: Number(data.allocatedStudents || 0), // <-- fixed to match controller
      });
    } catch (err) {
      // errors are handled in apiGet (401/403). For others, just log.
      console.warn('Overview load failed:', err?.message || err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!token || !userId) return;
    const controller = new AbortController();
    loadOverview(controller.signal);
    return () => controller.abort();
  }, [token, userId, loadOverview]);

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
          <button
            className="dashboard-card"
            onClick={() => navigate('/supervisor/my-projects')}
            aria-label="View my projects"
            title="View My Projects"
          >
            <h4>{loading ? '—' : overview.projects}</h4>
            <p>Projects Created</p>
          </button>

          <button
            className="dashboard-card"
            onClick={() => navigate('/supervisor/received-proposals')}
            aria-label="Review proposals"
            title="Review Proposals"
          >
            <h4>{loading ? '—' : overview.pendingProposals}</h4>
            <p>Proposals Pending Review</p>
          </button>

          <button
            className="dashboard-card"
            onClick={() => navigate('/supervisor/allocated-students')}
            aria-label="View allocated students"
            title="View Allocated Students"
          >
            <h4>{loading ? '—' : overview.allocatedStudents}</h4>
            <p>Students Allocated</p>
          </button>
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

            <button
              className="btn btn-outline"
              onClick={() => loadOverview()}
              disabled={loading}
              title="Refresh overview"
              style={{ marginLeft: 8 }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Account & Settings */}
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
              onClick={() => navigate('/help-support')}
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
