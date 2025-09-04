import React, { useEffect, useMemo, useState, useCallback } from 'react';
import SupervisorHeader from '../components/supervisorHeader';
import SupervisorNav from '../components/supervisorNav';
import './supervisorAllocatedStudentsPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/* ---------- utils ---------- */
function formatDate(input) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

/** Centralized fetch with auth + 401/403 handling */
async function apiFetch(path, opts = {}, navigate) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // Expired / missing auth: bounce to login
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // If navigate is available prefer it, otherwise hard redirect
    try {
      navigate?.('/login', { replace: true });
    } catch {}
    throw new Error('Your session has expired. Please log in again.');
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    // ignore non-JSON
  }
  if (!res.ok) throw new Error(data?.message || 'Request failed');
  return data;
}

export default function SupervisorAllocatedStudentsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);

  // pull user to ensure role gate (optional, UI-side)
  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); }
    catch { return {}; }
  }, []);

  const token = localStorage.getItem('token');
  const authHeaders = useMemo(
    () => ({ Authorization: token ? `Bearer ${token}` : '' }),
    [token]
  );

  const fetchList = useCallback(async () => {
    if (!token) {
      setErr('Please log in as a supervisor.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const data = await apiFetch('/allocations/supervisor', { headers: authHeaders });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message || 'Failed to load allocations');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const onDeallocate = async (allocation_id) => {
    if (!window.confirm('Remove this allocation? This frees 1 slot.')) return;
    try {
      await apiFetch(`/allocations/${allocation_id}`, { method: 'DELETE', headers: authHeaders });
      setRows((prev) => prev.filter((r) => r.allocation_id !== allocation_id));
      // Optionally: toast/snackbar here
    } catch (e) {
      alert(e.message || 'Failed to deallocate');
    }
  };

  return (
    <div
      className="page-root"
      style={{
        backgroundImage: "url('/assets/login_background.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Fixed sidebar + header */}
      <SupervisorNav />
      <SupervisorHeader />

      {/* Main content shifted by header+sidebar */}
      <main className="sv-main alloc-main">
        {/* --- Card container on top of the background --- */}
        <div className="alloc-panel">
          <div className="alloc-header">
            <h2>Allocated Students</h2>
            <div className="alloc-controls">
              <button className="btn btn-outline" onClick={fetchList}>
                Refresh
              </button>
            </div>
          </div>

          {/* Optional client-side guard for role */}
          {user?.role && String(user.role).toLowerCase() !== 'supervisor' && (
            <div className="alloc-alert">This page is for supervisors only.</div>
          )}

          {err && <div className="alloc-alert">{err}</div>}

          {loading ? (
            <p>Loading…</p>
          ) : rows.length === 0 ? (
            <p>No allocations found.</p>
          ) : (
            <div className="alloc-grid">
              {rows.map((r) => (
                <article key={r.allocation_id} className="alloc-card">
                  <header className="alloc-card-hd">
                    <h3 className="alloc-title">{r.student_name || 'Student'}</h3>
                    <span
                      className={`alloc-chip ${
                        String(r.allocation_status || '').toLowerCase() === 'allocated' ? 'ok' : ''
                      }`}
                      title={r.allocation_status}
                    >
                      {r.allocation_status || 'allocated'}
                    </span>
                  </header>

                  <dl className="alloc-kv">
                    <dt>Project</dt>
                    <dd>{r.project_title || '—'}</dd>

                    <dt>Topic</dt>
                    <dd>{r.project_topic_text || '—'}</dd>

                    <dt>Student Email</dt>
                    <dd>
                      {r.student_email ? (
                        <a href={`mailto:${r.student_email}`}>{r.student_email}</a>
                      ) : (
                        '—'
                      )}
                    </dd>

                    <dt>Allocated</dt>
                    <dd>{formatDate(r.allocated_at)}</dd>
                  </dl>

                  <div className="alloc-actions">
                    <button className="btn" onClick={() => setDetail(r)}>
                      View
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => onDeallocate(r.allocation_id)}
                    >
                      Deallocate
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        {/* --- /card container --- */}
      </main>

      {detail && (
        <AllocationDetailModal record={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function AllocationDetailModal({ record, onClose }) {
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  const fileUrl = record?.proposal_file_path
    ? `${apiBase}/uploads/${record.proposal_file_path}`
    : null;

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard');
    } catch {}
  };

  return (
    <div
      className="alloc-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target.classList.contains('alloc-modal-backdrop')) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Allocation details"
    >
      <div className="alloc-modal">
        <header className="alloc-modal-hd">
          <h3>{record.student_name || 'Student'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <section className="alloc-modal-body">
          <h4>Project</h4>
          <p>
            <strong>{record.project_title || '—'}</strong>
          </p>
          {record.project_description && (
            <p className="muted">{record.project_description}</p>
          )}

          <h4 style={{ marginTop: 16 }}>Proposal (if any)</h4>
          {record.proposal_title || record.proposal_description || fileUrl ? (
            <>
              {record.proposal_title && (
                <p>
                  <strong>{record.proposal_title}</strong>
                </p>
              )}
              {record.proposal_description && (
                <p className="muted">{record.proposal_description}</p>
              )}
              {fileUrl && (
                <p>
                  <a
                    className="btn btn-outline"
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View Attachment
                  </a>
                </p>
              )}
            </>
          ) : (
            <p className="muted">No uploaded proposal file.</p>
          )}

          <h4 style={{ marginTop: 16 }}>Student</h4>
          <p className="muted">{record.student_name || '—'}</p>
          {record.student_email && (
            <p className="muted">
              <a className="alloc-email" href={`mailto:${record.student_email}`}>
                {record.student_email}
              </a>{' '}
              <button className="ppm-chip" onClick={() => copy(record.student_email)}>
                Copy
              </button>
            </p>
          )}
        </section>

        <footer className="alloc-modal-ft">
          {record.student_email && (
            <a className="btn btn-outline" href={`mailto:${record.student_email}`}>
              Email Student
            </a>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
