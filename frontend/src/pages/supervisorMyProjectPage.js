// src/pages/supervisorMyProjectPage.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import './supervisorMyProjectPage.css';
import SupervisorNav from '../components/supervisorNav';
import SupervisorHeader from '../components/supervisorHeader';
import SupervisorProjectEditModal from '../components/supervisorProjectEditModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/* ---------- Confirm Modal ---------- */
function ConfirmModal({
  open,
  title = 'Confirm',
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const dlgRef = useRef(null);
  const backdropRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    dlgRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onCancel?.();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="sv-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current && !busy) onCancel?.();
      }}
    >
      <div className="sv-modal" tabIndex={-1} ref={dlgRef}>
        <h3 id="confirm-title">{title}</h3>
        {message && <p>{message}</p>}
        <div className="sv-modal-actions">
          <button className="sv-btn sv-btn--ghost" onClick={onCancel} disabled={busy}>
            {cancelText}
          </button>
          <button className="sv-btn sv-btn--danger" onClick={onConfirm} disabled={busy}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */
const chipClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'approved': return 'chip chip--approved';
    case 'pending':  return 'chip chip--pending';
    case 'rejected': return 'chip chip--rejected';
    default:         return 'chip';
  }
};
const formatDate = (d) => (d ? new Date(d).toLocaleString() : '');

export default function MyProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [editId, setEditId]     = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title }
  const [deleting, setDeleting] = useState(false);

  const navigate  = useNavigate();
  const location  = useLocation();
  const isArchivedRoute = location.pathname.endsWith('/archived');
  const [showArchived, setShowArchived] = useState(isArchivedRoute);

  useEffect(() => {
    setShowArchived(location.pathname.endsWith('/archived'));
  }, [location.pathname]);

  const token = localStorage.getItem('token');
  const user  = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } })();

  // role guard
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if ((user.role || '').toLowerCase() !== 'supervisor') {
      navigate('/student-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  const fetchMyProjects = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const archivedQ = showArchived ? '1' : '0';
      // ✅ Use the projects/my endpoint which honors ?archived=0|1
      const res = await fetch(
        `${API}/projects/my?archived=${archivedQ}&_=${Date.now()}`,
        { headers: authHeaders, cache: 'no-store' }
      );
      if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        navigate('/login', { replace: true });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to load projects');
      setProjects(Array.isArray(data) ? data : (data.projects || []));
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to load projects');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, navigate, showArchived]);

  useEffect(() => { fetchMyProjects(); }, [fetchMyProjects]);

  /* -------- Delete -------- */
  const requestDelete = (id, title) => setDeleteTarget({ id, title });

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    const id = deleteTarget.id;

    // optimistic remove
    setProjects((prev) => prev.filter((p) => p.project_id !== id));

    setDeleting(true);
    try {
      const res = await fetch(`${API}/projects/${id}`, { method: 'DELETE', headers: authHeaders });
      if (res.status === 401 || res.status === 403) {
        localStorage.clear(); navigate('/login', { replace: true }); return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Delete failed');
      await fetchMyProjects(); // keep in sync
    } catch (e) {
      console.error(e);
      setError(e.message || 'Delete failed');
      await fetchMyProjects();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  /* -------- Archive / Unarchive -------- */
  const archiveProject = async (projectId) => {
    try {
      const res = await fetch(`${API}/projects/${projectId}/archive`, {
        method: 'PATCH', headers: authHeaders,
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.clear(); navigate('/login', { replace: true }); return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Archive failed');
      await fetchMyProjects();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Archive failed');
    }
  };

  const unarchiveProject = async (projectId) => {
    try {
      const res = await fetch(`${API}/projects/${projectId}/unarchive`, {
        method: 'PATCH', headers: authHeaders,
      });
      if (res.status === 401 || res.status === 403) {
        localStorage.clear(); navigate('/login', { replace: true }); return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Unarchive failed');
      await fetchMyProjects();
    } catch (e) {
      console.error(e);
      setError(e.message || 'Unarchive failed');
    }
  };

  const onCreate = () => navigate('/supervisor/create-project');

  const EmptyState = () => (
    <div className="empty-state">
      <h3>{showArchived ? 'No archived projects' : 'No projects yet'}</h3>
      <p>{showArchived ? 'You have not archived any projects.' : 'Get started by creating your first project.'}</p>
      {!showArchived && <button className="btn btn-primary" onClick={onCreate}>Create Project</button>}
    </div>
  );

  return (
    <div
      className="sv-layout"
      style={{
        backgroundImage: "url('/assets/login_background.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <SupervisorNav />
      <SupervisorHeader />

      <main className="sv-main">
        <section className="myproj-panel">
          <div className="page-inner">
            <div className="myproj-controls">
              <div className="seg-tabs">
                <NavLink
                  to="/supervisor/my-projects"
                  end
                  className={({ isActive }) => `seg-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => setShowArchived(false)}
                >
                  Active
                </NavLink>
                <NavLink
                  to="/supervisor/my-projects/archived"
                  className={({ isActive }) => `seg-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => setShowArchived(true)}
                >
                  Archived
                </NavLink>
              </div>

              <div className="controls-right">
                <button className="btn btn-outline" onClick={fetchMyProjects}>
                  Refresh
                </button>
                {!showArchived && (
                  <button className="btn btn-primary" onClick={onCreate}>
                    Create Project
                  </button>
                )}
              </div>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {loading ? (
              <div className="loading">Loading...</div>
            ) : projects.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="projects-grid">
                {projects.map((p) => {
                  const allocated = Number(p.allocated_count ?? p.spots_filled ?? 0);
                  const quota = Number(p.quota ?? 0);
                  const remaining = Math.max(0, quota - allocated);
                  const full = remaining === 0;

                  return (
                    <div key={p.project_id} className="project-card">
                      <div className="project-card__top">
                        <span className={chipClass(p.approval_status)}>
                          {String(p.approval_status || '').toUpperCase() || 'STATUS'}
                        </span>

                        {(Number(p.is_student_pool) === 1 ||
                          /student proposal/i.test(`${p.title || ''} ${p.topic || ''}`)) && (
                          <span className="chip chip--ghost">Student Proposal</span>
                        )}

                        {Number(p.is_archived) === 1 && (
                          <span className="chip chip--archived">Archived</span>
                        )}
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
                          <span>
                            Quota: <strong>{quota}</strong>
                          </span>
                          <span>
                            Allocated: <strong>{allocated}</strong>
                          </span>
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
                              <button
                                className="btn btn-outline"
                                onClick={() => setEditId(p.project_id)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-danger"
                                onClick={() => requestDelete(p.project_id, p.title)}
                              >
                                Delete
                              </button>
                              <button
                                className="btn btn-archive"
                                onClick={() => archiveProject(p.project_id)}
                                title="Move to archived"
                              >
                                Archive
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-outline"
                              onClick={() => unarchiveProject(p.project_id)}
                              title="Restore to active"
                            >
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

        {editId && (
          <SupervisorProjectEditModal
            projectId={editId}
            token={token}
            onClose={() => setEditId(null)}
            onSaved={() => fetchMyProjects()}
          />
        )}
      </main>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete project"
        message={
          deleteTarget
            ? `Delete “${deleteTarget.title || 'this project'}” permanently? This cannot be undone.`
            : ''
        }
        confirmText={deleting ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        busy={deleting}
        onCancel={() => (!deleting ? setDeleteTarget(null) : null)}
        onConfirm={() => (!deleting ? confirmDelete() : null)}
      />
    </div>
  );
}
