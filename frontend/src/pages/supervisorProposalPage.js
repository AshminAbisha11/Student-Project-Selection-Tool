// src/pages/SupervisorProposalsPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SupervisorHeader from '../components/supervisorHeader';
import SupervisorNav from '../components/supervisorNav';
import SupervisorProposalModal from '../components/supervisorProposalModal';
import './supervisorProposalPage.css';
import './supervisorDashboardPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
// If your server is mounted at /supervisor-list, set this to '/supervisor-list'
const SUP_BASE = '/supervisor';

/* ---------- JS-only full-bleed background (waves + soft glows) ---------- */
function BgWaves({ src = '/assets/login_background.png' }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        background:
          'radial-gradient(1200px 800px at -10% -10%, rgba(123,44,191,.16), transparent 60%),' +
          'radial-gradient(1000px 700px at 110% 110%, rgba(106,76,255,.14), transparent 55%),' +
          `url("${src}") center / cover no-repeat,` +
          'linear-gradient(180deg, #f7f3ff 0%, #faf9ff 100%)',
      }}
    />
  );
}

/* ----------------- helpers ----------------- */
const norm = (s) => String(s || '').toLowerCase();

/** Bucket proposals into Submitted / Accepted / Rejected */
function categorize(list) {
  const submittedSet = new Set(['submitted', 'pending', 'allocated', 'under_review']);
  const acceptedSet  = new Set(['accepted']);
  const rejectedSet  = new Set(['rejected']);

  const buckets = { submitted: [], accepted: [], rejected: [] };
  for (const p of list) {
    const s = norm(p.status);
    if (acceptedSet.has(s)) buckets.accepted.push(p);
    else if (rejectedSet.has(s)) buckets.rejected.push(p);
    else if (submittedSet.has(s) || !s) buckets.submitted.push(p);
    else buckets.submitted.push(p);
  }
  return buckets;
}

/* ----------------- small UI pieces ----------------- */
function StatusTabs({ value, counts, onChange }) {
  const Tab = ({ id, label }) => (
    <button
      type="button"
      className={`seg-btn ${value === id ? 'is-active' : ''}`}
      onClick={() => onChange(id)}
    >
      {label} {typeof counts[id] === 'number' ? `(${counts[id]})` : ''}
    </button>
  );
  return (
    <div className="seg-tabs" role="tablist" aria-label="Filter proposals">
      <Tab id="submitted" label="Submitted" />
      <Tab id="accepted"  label="Accepted" />
      <Tab id="rejected"  label="Rejected" />
    </div>
  );
}

function ProposalCard({ p, onOpen }) {
  const status = norm(p.status) || 'submitted';
  return (
    <li
      className="sv-prop-card"
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        if (e.target.closest('.sv-prop-actions')) return;
        onOpen(p);
      }}
    >
      <div className="sv-prop-top">
        <h3 className="sv-prop-title">
          {p.display_title || p.proposal_title || p.project_title || 'Untitled'}
        </h3>
        <div className="sv-prop-chips">
          <span className={`sv-chip sv-chip--status sv-chip--${status}`}>
            {p.status || 'submitted'}
          </span>
          <span className="sv-chip sv-chip--source">
            {p.source_type === 'supervisor_project' ? 'Supervisor Project' : 'Student Proposal'}
          </span>
        </div>
      </div>

      <div className="sv-prop-meta">
        <span><strong>Student:</strong> {p.student_name}</span>
        <span><strong>Email:</strong> {p.student_email}</span>
        <span>
          <strong>Submitted:</strong> {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
        </span>
        {p.project_id && <span><strong>Project ID:</strong> {p.project_id}</span>}
      </div>

      {p.message && <p className="sv-prop-msg">{p.message}</p>}

      <div className="sv-prop-actions">
        {p.file_path && (
          <a
            className="sv-btn sv-btn--ghost"
            href={`${API}/uploads/${encodeURIComponent(p.file_path)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            View Attachment
          </a>
        )}
      </div>
    </li>
  );
}

function ProposalList({ items, onOpen }) {
  if (!items.length) return <div className="sv-proposals-empty">No items.</div>;
  return (
    <ul className="sv-proposals-list" role="list">
      {items.map((p) => (
        <ProposalCard key={p.proposal_id} p={p} onOpen={onOpen} />
      ))}
    </ul>
  );
}

/* ----------------- page ----------------- */
export default function SupervisorProposalsPage() {
  const [proposals, setProposals]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [active, setActive]         = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filter, setFilter]         = useState('submitted'); // default tab

  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const user  = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  })();

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // guard
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (String(user.role || '').toLowerCase() !== 'supervisor') {
      navigate('/student-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

  // Fetch proposals
  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`${API}${SUP_BASE}/proposals`, {
          headers: authHeaders,
          signal: ac.signal,
        });

        // Handle auth expiry
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login', { replace: true });
          return;
        }

        if (!res.ok) throw new Error((await res.text()) || `Failed: ${res.status}`);
        const data = await res.json();

        // sort newest first by created_at if available
        const list = Array.isArray(data) ? data.slice() : [];
        list.sort((a, b) => {
          const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });

        setProposals(list);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message || 'Failed to load proposals');
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [authHeaders, navigate, refreshKey]);

  // Optimistic update from modal
  function handleUpdated(id, updated) {
    setProposals(prev =>
      prev.map(p => (p.proposal_id === id ? { ...p, status: updated.status } : p))
    );
  }

  const buckets = useMemo(() => categorize(proposals), [proposals]);
  const counts  = useMemo(() => ({
    submitted: buckets.submitted.length,
    accepted:  buckets.accepted.length,
    rejected:  buckets.rejected.length,
  }), [buckets]);

  const visible = buckets[filter] || [];

  return (
    <div className="sv-layout">
      <BgWaves src="/assets/login_background.png" />

      <SupervisorNav />
      <SupervisorHeader />

      <main className="sv-main">
        <section className="myproj-panel">
          <div className="page-inner">
            {/* Controls bar */}
            <div className="myproj-controls" style={{ marginBottom: 16 }}>
              <StatusTabs value={filter} counts={counts} onChange={setFilter} />
              <div className="controls-right">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setRefreshKey(k => k + 1)}
                  disabled={loading}
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="sv-proposals-body">
              {loading && <div className="sv-proposals-skel">Loading proposals…</div>}
              {!!error && <div className="sv-proposals-error">⚠ {error}</div>}
              {!loading && !error && <ProposalList items={visible} onOpen={setActive} />}
            </div>

            {/* Modal */}
            <SupervisorProposalModal
              open={!!active}
              proposal={active}
              onClose={() => setActive(null)}
              onUpdated={handleUpdated}
              token={token}
              apiBase={API}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
