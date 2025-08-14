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

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const name = useMemo(() => user?.name || getNameFromToken() || 'Supervisor', [user]);

  // auth + role guard
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (String(user.role).toLowerCase() !== 'supervisor') {
      navigate('/student-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

  // load dashboard overview
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { data } = await axios.get(`${API}/supervisor/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!mounted) return;
        setOverview({
          projects: Number(data.projects || 0),
          pendingProposals: Number(data.pendingProposals || 0),
          allocatedStudents: Number(data.allocatedStudents || 0),
        });
      } catch (err) {
        console.warn('Overview load failed:', err?.response?.data || err.message);
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.clear();
          navigate('/login', { replace: true });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (token && user) load();
    return () => { mounted = false; };
  }, [token, user, navigate]);

  return (
    <div
      className="dashboard-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      {/* Supervisor sidebar */}
      <SupervisorNav />

      {/* Main pane */}
      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Supervisor Project Portal</h2>
          <ProfileDropdown />
        </header>

        <div className="dashboard-welcome">
          <h3>Welcome, {name}!</h3>
          <p>Here’s a quick overview of your project journey</p>
        </div>

        <div className="dashboard-cards">
          <div
            className="dashboard-card"
            onClick={() => navigate('/my-projects')}
            style={{ cursor: 'pointer' }}
          >
            <h4>{loading ? '—' : overview.projects}</h4>
            <p>Projects Supervised</p>
          </div>

          <div
            className="dashboard-card"
            onClick={() => navigate('/supervisor/proposals')}
            style={{ cursor: 'pointer' }}
          >
            <h4>{loading ? '—' : overview.pendingProposals}</h4>
            <p>Proposals Pending Review</p>
          </div>

          <div
            className="dashboard-card"
            onClick={() => navigate('/supervisor/allocated')}
            style={{ cursor: 'pointer' }}
          >
            <h4>{loading ? '—' : overview.allocatedStudents}</h4>
            <p>Students Allocated</p>
          </div>
        </div>

        <div className="dashboard-actions">
          <h4>Quick Actions</h4>
          <button onClick={() => navigate('/supervisor/create-project')}>Add new Project</button>
          <button onClick={() => navigate('/supervisor/proposals')}>Review Proposals</button>
          <button onClick={() => navigate('/supervisor/allocated')}>View Allocated Students</button>
          <button onClick={() => navigate('/my-projects')}>My Projects</button>
        </div>
      </div>
    </div>
  );
}
