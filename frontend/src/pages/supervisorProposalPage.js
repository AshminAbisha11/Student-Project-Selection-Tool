import React, { useEffect, useState } from 'react';
import HeaderBar from '../components/headerBar';
import './supervisorProposalPage.css';

const API = 'http://localhost:5000';

export default function SupervisorProposalsPage() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = localStorage.getItem('token');

  useEffect(() => {
    const ac = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`${API}/supervisor-list/proposals`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `Failed: ${res.status}`);
        }
        const data = await res.json();
        setProposals(Array.isArray(data) ? data : []);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => ac.abort();
  }, [token]);

  return (
    <div className="sv-proposals-page">
      <HeaderBar title="Received Proposals" />

      <div className="sv-proposals-body">
        {loading && <div className="sv-proposals-skel">Loading proposals…</div>}
        {!!error && <div className="sv-proposals-error">⚠ {error}</div>}

        {!loading && !error && proposals.length === 0 && (
          <div className="sv-proposals-empty">No proposals yet.</div>
        )}

        {!loading && !error && proposals.length > 0 && (
          <ul className="sv-proposals-list">
            {proposals.map((p) => (
              <li key={p.proposal_id} className="sv-prop-card">
                <div className="sv-prop-top">
                  <h3 className="sv-prop-title">{p.display_title || p.proposal_title || p.project_title || 'Untitled'}</h3>

                  <div className="sv-prop-chips">
                    <span className={`sv-chip sv-chip--status sv-chip--${(p.status || 'pending').toLowerCase()}`}>
                      {p.status || 'pending'}
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
                    // TODO: if your backend serves uploads from a different path, adjust this href
                    <a
                      className="sv-btn sv-btn--ghost"
                      href={`${API}/uploads/${encodeURIComponent(p.file_path)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Attachment
                    </a>
                  )}

                  {/* Accept/Reject can be wired later */}
                  {/* <button className="sv-btn sv-btn--ok">Accept</button>
                  <button className="sv-btn sv-btn--warn">Reject</button> */}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
