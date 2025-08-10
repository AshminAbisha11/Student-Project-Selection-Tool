import React, { useEffect, useState } from 'react';
import './editOrderModal.css';

const EditOrderModal = ({ open, pref, max, onClose, onSave }) => {
  const [value, setValue] = useState(pref?.preference_order ?? 1);

  useEffect(() => {
    if (pref) setValue(pref.preference_order);
  }, [pref]);

  if (!open || !pref) return null;

  return (
    <div className="order-modal-backdrop" onClick={onClose}>
      <div className="order-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Change Preference Order</h3>
        <p className="sub">Project: <strong>{pref.title}</strong></p>

        <label className="field">
          New position
          <select value={value} onChange={(e) => setValue(Number(e.target.value))}>
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <div className="actions">
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(value)}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default EditOrderModal;
