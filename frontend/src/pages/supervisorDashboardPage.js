import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HeaderBar from '../components/headerBar';
import useRequireRole from '../hooks/userRequireRole';
import './supervisorDashboardPage.css';

const API = 'http://localhost:5000';

function getNameFromToken() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob((token.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.name || null;
  } catch {
    return null;
  }
}

const StatCard = ({ title, value, loading }) => (
  <div className="stat-card">
    <div className="stat-title">{title}</div>
    <div className={`stat-value ${loading ? 'skeleton' : ''}`}>{loading ? '—' : value}</div>
  </div>
);

export default function SupervisorDashboardPage() {
  useRequireRole('supervisor'); // ⬅️ guard lives IN the page now

  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState({ projects: 0, pendingProposals: 0, allocatedStudents: 0 });

  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const name = useMemo(() => user?.name || getNameFromToken() || 'Supervisor', [user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await fetch(`${API}/supervisor/overview`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to load overview');
        const data = await res.json();
        if (!mounted) return;
        setOverview({
          projects: Number(data.projects) || 0,
          pendingProposals: Number(data.pendingProposals) || 0,
          allocatedStudents: Number(data.allocatedStudents) || 0,
        });
      } catch (e) {
        console.warn(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <HeaderBar />
      <div className="supdash-wrap">
        <aside className="supdash-aside">
          <nav>
            <button onClick={() => navigate('/supervisor/allocated')} className="aside-link">Allocated Students</button>
            <button onClick={() => navigate('/supervisor/projects')} className="aside-link">My Projects</button>
            <button onClick={() => navigate('/supervisor/proposals')} className="aside-link">Received Proposals</button>
            <button onClick={() => navigate('/logout')} className="aside-link danger">Logout</button>
          </nav>
        </aside>

        <main className="supdash-main">
          <header className="supdash-header">
            <h2>Welcome, {name}!</h2>
            <p className="muted">Here’s a quick overview of your project journey.</p>
          </header>

          <section className="stat-grid">
            <StatCard title="Projects Supervised" value={overview.projects} loading={loading} />
            <StatCard title="Proposals Pending Review" value={overview.pendingProposals} loading={loading} />
            <StatCard title="Students Allocated" value={overview.allocatedStudents} loading={loading} />
          </section>

          <section className="qa-card">
            <h3>Quick Actions</h3>
            <div className="qa-actions">
              <button className="btn primary" onClick={() => navigate('/supervisor/create-project')}>Add new Project</button>
              <button className="btn outline" onClick={() => navigate('/supervisor/proposals')}>Review Proposals</button>
              <button className="btn outline" onClick={() => navigate('/supervisor/allocated')}>View Allocated Students</button>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
