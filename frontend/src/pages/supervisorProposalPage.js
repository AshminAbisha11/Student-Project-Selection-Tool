import React, { useEffect, useState } from 'react';
import ProfileDropdown from '../components/profileDropdown';
import SupervisorNav from '../components/supervisorNav';
import SupervisorProposalModal from '../components/supervisorProposalModal';
import './supervisorProposalPage.css';
import './supervisorDashboardPage.css'; 

const API = 'http://localhost:5000';

export default function SupervisorProposalsPage() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/supervisor-list/proposals`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal
        });
        if (!res.ok) throw new Error((await res.text()) || `Failed: ${res.status}`);
        const data = await res.json();
        setProposals(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [token]);

  // Optimistic update when the modal reports a decision
  function handleUpdated(id, updated) {
    setProposals(prev =>
      prev.map(p => (p.proposal_id === id ? { ...p, status: updated.status } : p))
    );
  }

  return (
    <div
      className="dashboard-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      {/* LEFT: Supervisor sidebar */}
      <SupervisorNav />

      {/* RIGHT: Main content */}
      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Received Proposals</h2>
          <ProfileDropdown />
        </header>

        <div className="sv-proposals-body">
          {loading && <div className="sv-proposals-skel">Loading proposals…</div>}
          {!!error && <div className="sv-proposals-error">⚠ {error}</div>}
          {!loading && !error && proposals.length === 0 && (
            <div className="sv-proposals-empty">No proposals yet.</div>
          )}

          {!loading && !error && proposals.length > 0 && (
            <ul className="sv-proposals-list">
              {proposals.map((p) => (
                <li
                  key={p.proposal_id}
                  className="sv-prop-card"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    // If the click came from a button/link inside actions, don't open modal
                    if (e.target.closest('.sv-prop-actions')) return;
                    setActive(p);
                  }}
                >
                  <div className="sv-prop-top">
                    <h3 className="sv-prop-title">
                      {p.display_title || p.proposal_title || p.project_title || 'Untitled'}
                    </h3>
                    <div className="sv-prop-chips">
                      <span className={`sv-chip sv-chip--status sv-chip--${(p.status || 'submitted').toLowerCase()}`}>
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
                    <span><strong>Submitted:</strong> {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</span>
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
              ))}
            </ul>
          )}
        </div>

        {/* Modal */}
        <SupervisorProposalModal
          open={!!active}
          proposal={active}
          onClose={() => setActive(null)}
          onUpdated={handleUpdated}
        />
      </div>
    </div>
  );
}
