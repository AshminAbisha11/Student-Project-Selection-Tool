import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ProfileDropdown from '../components/profileDropdown';
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

  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (String(user.role).toLowerCase() !== 'supervisor') {
      navigate('/student-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

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
    return () => (mounted = false);
  }, [token, user, navigate]);

  return (
    <div
      className="dashboard-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      {/* Left rail */}
      <aside className="sd-sidebar">
        <div className="sd-logo">
          <img src="/assets/aston_logo.png" alt="Aston" />
        </div>

        <nav className="sd-nav">
          <button className="sd-link" onClick={() => navigate('/supervisor/allocated')}>
            Allocated Students
          </button>
          <button className="sd-link" onClick={() => navigate('/supervisor/projects')}>
            My Projects
          </button>
          <button className="sd-link" onClick={() => navigate('/supervisor/proposals')}>
            Received Proposals
          </button>
          <button className="sd-link danger" onClick={() => navigate('/logout')}>
            Logout
          </button>
        </nav>
      </aside>

      {/* Main pane — same layout classes as student */}
      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Supervisor Project Portal</h2> {/* <- updated title */}
          <ProfileDropdown />
        </header>

        <div className="dashboard-welcome">
          <h3>Welcome, {name}!</h3>
          <p>Here’s a quick overview of your project journey</p>
        </div>

        <div className="dashboard-cards">
          <div
            className="dashboard-card"
            onClick={() => navigate('/supervisor/projects')}
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
        </div>
      </div>
    </div>
  );
}
