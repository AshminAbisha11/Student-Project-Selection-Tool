import React, { useEffect, useMemo, useState } from 'react';
import SupervisorHeader from '../components/supervisorHeader';
import SupervisorNav from '../components/supervisorNav';
import './supervisorAllocatedStudentsPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function formatDate(input) {
  if (!input) return '—';
  try {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return '—';
  }
}

export default function SupervisorAllocatedStudentsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);

  const token = localStorage.getItem('token');
  const authHeaders = useMemo(
    () => ({ Authorization: token ? `Bearer ${token}` : '' }),
    [token]
  );

  const fetchList = async () => {
    if (!token) {
      setErr('Please log in as a supervisor.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`${API}/allocations/supervisor`, {
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load allocations');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDeallocate = async (allocation_id) => {
    if (!window.confirm('Remove this allocation? This frees 1 slot.')) return;
    try {
      const res = await fetch(`${API}/allocations/${allocation_id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to deallocate');
      setRows((prev) => prev.filter((r) => r.allocation_id !== allocation_id));
    } catch (e) {
      alert(e.message);
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
                    <h3 className="alloc-title">{r.student_name}</h3>
                    <span
                      className={`alloc-chip ${
                        r.allocation_status === 'allocated' ? 'ok' : ''
                      }`}
                    >
                      {r.allocation_status}
                    </span>
                  </header>

                  <dl className="alloc-kv">
                    <dt>Project</dt>
                    <dd>{r.project_title}</dd>

                    <dt>Topic</dt>
                    <dd>{r.project_topic_text || '—'}</dd>

                    <dt>Student Email</dt>
                    <dd>
                      <a href={`mailto:${r.student_email}`}>{r.student_email}</a>
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
  const fileUrl = record.proposal_file_path
    ? `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/uploads/${record.proposal_file_path}`
    : null;

  return (
    <div
      className="alloc-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target.classList.contains('alloc-modal-backdrop')) onClose();
      }}
    >
      <div className="alloc-modal">
        <header className="alloc-modal-hd">
          <h3>{record.student_name}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <section className="alloc-modal-body">
          <h4>Project</h4>
          <p>
            <strong>{record.project_title}</strong>
          </p>
          <p className="muted">{record.project_description}</p>

          <h4 style={{ marginTop: 16 }}>Proposal (if any)</h4>
          {record.proposal_title ? (
            <>
              <p>
                <strong>{record.proposal_title}</strong>
              </p>
              <p className="muted">{record.proposal_description}</p>
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
        </section>

        <footer className="alloc-modal-ft">
          <a className="btn btn-outline" href={`mailto:${record.student_email}`}>
            Email Student
          </a>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
