import React, { useMemo, useState } from 'react';
import './supervisorProposalModal.css';

export default function SupervisorProposalModal({ open, proposal, onClose, onUpdated }) {
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  const token = localStorage.getItem('token');
  const API = 'http://localhost:5000';

  const title = useMemo(
    () => proposal?.display_title || proposal?.proposal_title || proposal?.project_title || 'Untitled',
    [proposal]
  );

  if (!open || !proposal) return null;

  const mailtoHref = (() => {
    const subject = `Regarding your proposal: ${title}`;
    const body = `Hi ${proposal.student_name},

I’m reviewing your proposal "${title}".

[Write your message here]

Thanks,
`;
    return `mailto:${proposal.student_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  })();

  async function submitDecision(status) {
    if (submitting) return;
    if (status === 'rejected' && reason.trim().length < 5) {
      alert('Please provide a brief reason (min 5 characters) for rejection.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await fetch(`${API}/supervisor-list/proposals/${proposal.proposal_id}/decision`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, reason })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      onUpdated?.(proposal.proposal_id, updated);
      onClose?.();
    } catch (e) {
      alert(e.message || 'Failed to update');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="spm-backdrop" onClick={onClose}>
      <div className="spm-card" onClick={(e) => e.stopPropagation()}>
        <div className="spm-head">
          <h3>{title}</h3>
          <button className="spm-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="spm-meta">
          <div><strong>Student:</strong> {proposal.student_name}</div>
          <div><strong>Email:</strong> {proposal.student_email}</div>
          <div><strong>Submitted:</strong> {proposal.created_at ? new Date(proposal.created_at).toLocaleString() : '—'}</div>
          {proposal.project_id && <div><strong>Project ID:</strong> {proposal.project_id}</div>}
          <div><strong>Status:</strong> {proposal.status}</div>
        </div>

        {proposal.message && (
          <>
            <div className="spm-label">Proposal Description</div>
            <p className="spm-msg">{proposal.message}</p>
          </>
        )}

        {proposal.file_path && (
          <a className="spm-btn spm-btn--ghost" href={`${API}/uploads/${encodeURIComponent(proposal.file_path)}`} target="_blank" rel="noreferrer">
            View Attachment
          </a>
        )}

        <div className="spm-divider" />

        <div className="spm-actions">
          <a className="spm-btn spm-btn--ghost" href={mailtoHref}>Contact via Email</a>
          <div className="spm-spacer" />
          <button className="spm-btn spm-btn--ok" disabled={submitting} onClick={() => submitDecision('accepted')}>Accept</button>
          <button className="spm-btn spm-btn--warn" disabled={submitting} onClick={() => submitDecision('rejected')}>Reject</button>
        </div>

        <div className="spm-reason">
          <label htmlFor="rej-reason"><strong>Reason (required for rejection)</strong></label>
          <textarea
            id="rej-reason"
            rows={3}
            placeholder="Briefly explain the reason..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
