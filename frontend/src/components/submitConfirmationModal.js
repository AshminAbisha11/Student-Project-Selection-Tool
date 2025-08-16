import React from 'react';
import './submitModal.css';

export default function SubmitConfirmationModal({ open, onClose, deadline }) {
  if (!open) return null;

  return (
    <div className="sm-backdrop" role="dialog" aria-modal="true">
      <div className="sm-card">
        <h3>Preferences submitted ✅</h3>
        <p style={{ marginTop: 8 }}>
          We’ve saved your current order. You can still change your preferences
          and submit again <strong>until{'\u00A0'}</strong>
          {deadline ? new Date(deadline).toLocaleString() : 'the deadline'}.
        </p>

        <div className="sm-actions">
          <button className="btn btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}
