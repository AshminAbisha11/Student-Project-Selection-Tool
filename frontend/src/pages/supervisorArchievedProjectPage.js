import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './supervisorMyProjectPage.css';            // reuse the same CSS
import SideBar from '../components/sideBar';
import HeaderBar from '../components/headerBar';

const API = 'http://localhost:5000';

const chipClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'approved': return 'chip chip--approved';
    case 'pending':  return 'chip chip--pending';
    case 'rejected': return 'chip chip--rejected';
    default:         return 'chip';
  }
};

const formatDate = (d) => (d ? new Date(d).toLocaleString() : '');

export default function ArchivedProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const authHeaders = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  );

  const fetchArchived = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/projects/my`, { headers: authHeaders });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Failed (${res.status}): ${t}`);
      }
      const data = await res.json();
      const archived = Array.isArray(data) ? data.filter(p => Boolean(p.is_archived)) : [];
      setProjects(archived);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load archived projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchArchived(); /* eslint-disable-next-line */ }, []);

  const unarchiveProject = async (projectId) => {
    try {
      const res = await fetch(`${API}/projects/${projectId}/unarchive`, {
        method: 'PATCH',
        headers: authHeaders,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Unarchive failed: ${res.status} ${t}`);
      }
      await fetchArchived();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Unarchive failed');
    }
  };

  const EmptyState = () => (
    <div className="empty-state">
      <h3>No archived projects</h3>
      <p>You haven’t archived any projects yet.</p>
      <button className="btn btn-outline" onClick={() => navigate('/my-projects')}>
        Go to My Projects
      </button>
    </div>
  );

  return (
    <div className="page-container">
      <SideBar />
      <div className="content-area">
        <HeaderBar />

        <div className="page-inner">
          {/* simple left-aligned header controls */}
          <div className="myproj-controls">
            <button className="btn btn-outline" onClick={() => navigate('/my-projects')}>
              ← Back to My Projects
            </button>
            <button className="btn btn-outline" onClick={fetchArchived}>
              Refresh
            </button>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {loading ? (
            <div className="loading">Loading...</div>
          ) : projects.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="projects-grid">
              {projects.map((p) => {
                const remaining = Math.max(0, Number(p.quota ?? 0) - Number(p.spots_filled ?? 0));
                const full = remaining === 0;

                return (
                  <div key={p.project_id} className="project-card">
                    <div className="project-card__top">
                      <span className={chipClass(p.approval_status)}>
                        {String(p.approval_status || '').toUpperCase() || 'STATUS'}
                      </span>
                      {p.is_student_proposal && <span className="chip chip--ghost">Student Proposal</span>}
                      <span className="chip chip--archived">Archived</span>
                    </div>

                    <h3 className="project-title">{p.title}</h3>
                    <p className="project-desc">{p.description}</p>

                    <div className="meta-row">
                      {p.topic && <span className="meta-pill">Topic: {p.topic}</span>}
                      {p.keywords && <span className="meta-pill">Keywords: {p.keywords}</span>}
                    </div>

                    <div className="capacity-row">
                      <div className={`quota-badge ${full ? 'full' : ''}`}>
                        {full ? 'Full' : `${remaining} slot${remaining === 1 ? '' : 's'} left`}
                      </div>
                      <div className="numbers">
                        <span>Quota: <strong>{p.quota}</strong></span>
                        <span>Allocated: <strong>{p.allocated_count ?? p.spots_filled}</strong></span>
                      </div>
                    </div>

                    <div className="footer-row">
                      <small className="dates">
                        Created: {formatDate(p.created_at)}
                        {p.updated_at ? ` · Updated: ${formatDate(p.updated_at)}` : ''}
                        {p.archived_at ? ` · Archived: ${formatDate(p.archived_at)}` : ''}
                      </small>

                      <div className="card-actions">
                        <button
                          className="btn btn-outline"
                          onClick={() => unarchiveProject(p.project_id)}
                          title="Restore to active"
                        >
                          Unarchive
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
