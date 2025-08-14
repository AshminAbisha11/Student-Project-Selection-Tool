import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './supervisorMyProjectPage.css';
import SupervisorNav from '../components/supervisorNav';
import SupervisorHeader from '../components/supervisorHeader';

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

const MyProjectsPage = () => {
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const user  = JSON.parse(localStorage.getItem('user') || 'null');

  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (String(user.role).toLowerCase() !== 'supervisor') {
      navigate('/student-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const fetchMyProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/projects/my`, { headers: authHeaders });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Failed (${res.status}): ${t}`);
      }
      const data = await res.json();
      const list = Array.isArray(data)
        ? data.filter((p) => Boolean(p.is_archived) === showArchived)
        : [];
      setProjects(list);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const onEdit = () => alert('Edit not implemented yet');
  const onDelete = async () => alert('Delete not implemented yet');

  const archiveProject = async (projectId) => {
    try {
      const res = await fetch(`${API}/projects/${projectId}/archive`, {
        method: 'PATCH',
        headers: authHeaders,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Archive failed: ${res.status} ${t}`);
      }
      await fetchMyProjects();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Archive failed');
    }
  };

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
      await fetchMyProjects();
    } catch (e) {
      console.error(e);
      alert(e.message || 'Unarchive failed');
    }
  };

  const onCreate = () => navigate('/supervisor/create-project');

  const EmptyState = () => (
    <div className="empty-state">
      <h3>{showArchived ? 'No archived projects' : 'No projects yet'}</h3>
      <p>
        {showArchived
          ? 'You have not archived any projects.'
          : 'Get started by creating your first project.'}
      </p>
      {!showArchived && (
        <button className="btn btn-primary" onClick={onCreate}>
          Create Project
        </button>
      )}
    </div>
  );

  return (
    <div
      className="page-root"
      style={{
        backgroundImage: "url('/assets/login_background.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {/* Full-width sticky header at the very top */}
      <div className="topbar-wrap">
        <SupervisorHeader />
      </div>

      {/* Grid under the header: sidebar + main content */}
      <div className="main-grid">
        <SupervisorNav />

        <div className="content-area">
          {/* Big white container panel like the dashboard */}
          <section className="myproj-panel">
            <div className="page-inner">
              {/* Controls row — left aligned */}
              <div className="myproj-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={!showArchived}
                    onChange={(e) => setShowArchived(!e.target.checked)}
                  />
                  {' '}Active
                </label>

                <button className="btn btn-outline" onClick={fetchMyProjects}>
                  Refresh
                </button>
                <button className="btn btn-primary" onClick={onCreate}>
                  Create Project
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
                    const remaining = Math.max(
                      0,
                      Number(p.quota ?? 0) - Number(p.spots_filled ?? 0)
                    );
                    const full = remaining === 0;

                    return (
                      <div key={p.project_id} className="project-card">
                        <div className="project-card__top">
                          <span className={chipClass(p.approval_status)}>
                            {String(p.approval_status || '').toUpperCase() || 'STATUS'}
                          </span>
                          {p.is_student_proposal ? (
                            <span className="chip chip--ghost">Student Proposal</span>
                          ) : null}
                          {p.is_archived ? (
                            <span className="chip chip--archived">Archived</span>
                          ) : null}
                        </div>

                        <h3 className="project-title">{p.title}</h3>
                        <p className="project-desc">{p.description}</p>

                        <div className="meta-row">
                          {p.topic ? <span className="meta-pill">Topic: {p.topic}</span> : null}
                          {p.keywords ? <span className="meta-pill">Keywords: {p.keywords}</span> : null}
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
                            {p.archived_at && showArchived ? ` · Archived: ${formatDate(p.archived_at)}` : ''}
                          </small>

                          <div className="card-actions">
                            {!showArchived ? (
                              <>
                                <button className="btn btn-outline" onClick={onEdit}>Edit</button>
                                <button className="btn btn-danger" onClick={onDelete}>Delete</button>
                                <button className="btn btn-archive" onClick={() => archiveProject(p.project_id)} title="Move to archived">
                                  Archive
                                </button>
                              </>
                            ) : (
                              <button className="btn btn-outline" onClick={() => unarchiveProject(p.project_id)} title="Restore to active">
                                Unarchive
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MyProjectsPage;
