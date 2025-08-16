import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import './studentProposalModal.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function StudentProposalModal({ isOpen, onClose, userId, token }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  // Close on ESC
  const onEsc = useCallback((e) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', onEsc);
    document.body.classList.add('modal-open');   // prevent page scroll
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, onEsc]);

  // Fetch proposals when opened
  useEffect(() => {
    if (!isOpen || !userId || !token) return;

    let cancel = false;
    (async () => {
      setError('');
      setLoading(true);
      try {
        const res = await axios.get(`${API}/proposals/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { _ts: Date.now() }, // cache-buster
          validateStatus: s => (s >= 200 && s < 300) || s === 304,
        });
        if (!cancel && res.status !== 304 && Array.isArray(res.data)) {
          setProposals(res.data);
        }
      } catch {
        if (!cancel) setError('Failed to load proposals.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [isOpen, userId, token]);

  if (!isOpen) return null;

  // Render OUTSIDE the dashboard stacking context
  return createPortal(
    <div className="spm-overlay" role="dialog" aria-modal="true" aria-label="Proposals Sent" onClick={onClose}>
      <div className="spm-panel" onClick={(e) => e.stopPropagation()}>
        <button className="spm-close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="spm-title">Proposals Sent</h3>

        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p style={{ color: '#b00' }}>{error}</p>
        ) : proposals.length === 0 ? (
          <p>You haven’t submitted any proposals yet.</p>
        ) : (
          <div className="spm-list">
            {proposals.map((p, i) => (
              <div className="spm-card" key={p.proposal_id ?? `p-${i}`}>
                <h4>{i + 1}. {p.title}</h4>
                {p.description && <p>{p.description}</p>}
                <p className="spm-meta">
                  {p.supervisor_name ? <>Supervisor: {p.supervisor_name}</> : <>Supervisor: —</>}
                  {p.submitted_at && <> • Submitted: {new Date(p.submitted_at).toLocaleString()}</>}
                  {p.status && <> • Status: <strong>{p.status}</strong></>}
                </p>
                {p.file_path && (
                  <a
                    className="spm-attachment"
                    href={`${API}/uploads/${encodeURIComponent(p.file_path)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    📎 View Attachment
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
