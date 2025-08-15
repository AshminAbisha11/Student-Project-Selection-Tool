import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function ProposalsModal({ open, onClose }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const token = localStorage.getItem('token');
  const authHeaders = useMemo(
    () => ({ Authorization: token ? `Bearer ${token}` : '' }),
    [token]
  );
  const student = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  })();
  const studentId = student?.user_id;

  useEffect(() => {
    if (!open) return;
    if (!studentId) {
      setErr('No student found in session.');
      return;
    }
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const { data } = await axios.get(`${API}/proposals/${studentId}`, {
          headers: authHeaders,
        });
        setProposals(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setErr('Could not load your proposals.');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, studentId, authHeaders]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">📄</div>
        <h3 className="modal-title">Proposals you sent</h3>

        {loading ? (
          <p className="modal-text">Loading…</p>
        ) : err ? (
          <p className="modal-text" style={{ color: '#b00' }}>{err}</p>
        ) : proposals.length === 0 ? (
          <p className="modal-text">You haven’t submitted any proposals yet.</p>
        ) : (
          <ul className="proposal-list">
            {proposals.map((p) => (
              <li key={p.proposal_id} className="proposal-item">
                <div className="proposal-title">{p.title}</div>
                {p.description && (
                  <div className="proposal-desc">{p.description}</div>
                )}
                <div className="proposal-meta">
                  {p.supervisor_name && <span>Supervisor: <strong>{p.supervisor_name}</strong></span>}
                  {p.submitted_at && (
                    <span> • Submitted: {new Date(p.submitted_at).toLocaleString()}</span>
                  )}
                </div>
                {p.file_path && (
                  <a
                    className="proposal-download"
                    href={`${API}/uploads/${encodeURIComponent(p.file_path)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download file
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
