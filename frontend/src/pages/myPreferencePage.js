import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './myPreferencePage.css';
import SideBar from '../components/sideBar';
import HeaderBar from '../components/headerBar';
import EditOrderModal from '../components/editOrderModal';

const MAX_PREFERENCES = 5;
const API = 'http://localhost:5000';

/* Tiny modal used locally */
function SubmitModal({ open, onClose, deadline, alreadySubmitted }) {
  if (!open) return null;
  const title = alreadySubmitted ? 'Submission updated ✅' : 'Preferences submitted ✅';
  const note  = alreadySubmitted
    ? 'We’ve updated your previously submitted preferences.'
    : 'We’ve saved your current order.';
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.4)',
      display: 'grid', placeItems: 'center'
    }}>
      <div style={{
        width: 'min(520px, 92vw)', background: '#fff', color: '#222',
        borderRadius: 14, padding: '20px 22px', boxShadow: '0 18px 50px rgba(0,0,0,.18)'
      }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <p style={{ marginTop: 8, lineHeight: 1.45 }}>
          {note} You can still change your preferences and submit again{' '}
          <strong>before the deadline</strong>
          {deadline ? ` (${new Date(deadline).toLocaleString()})` : ''}.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={onClose}
            style={{ border: 0, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MyPreferencesPage() {
  const [preferences, setPreferences] = useState([]);
  const [loading, setLoading] = useState(true);

  // editing
  const [editingPref, setEditingPref] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  // cycle status
  const [cycle, setCycle] = useState(null);
  const [isSubmissionOpen, setIsSubmissionOpen] = useState(false);
  const [hasActiveCycle, setHasActiveCycle] = useState(false);
  const [cycleLoading, setCycleLoading] = useState(true);

  // submission state + modal
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const fetchCycleStatus = async () => {
    try {
      const res = await fetch(`${API}/cycle/status`, { headers: authHeaders });
      const data = await res.json();
      setHasActiveCycle(Boolean(data?.hasActiveCycle));
      setIsSubmissionOpen(Boolean(data?.isSubmissionOpen));
      setCycle(data?.cycle || null);
    } catch (e) {
      console.error('Error fetching cycle status:', e);
    } finally {
      setCycleLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const res = await fetch(`${API}/preferences`, { headers: authHeaders });
      const data = await res.json();
      const list = Array.isArray(data)
        ? data.slice().sort((a, b) => a.preference_order - b.preference_order)
        : [];
      setPreferences(list);
    } catch (err) {
      console.error('Error fetching preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  // NEW: check if already submitted (uses backend GET /preferences/submitted)
  const fetchSubmissionStatus = async () => {
    try {
      const res = await fetch(`${API}/preferences/submitted`, { headers: authHeaders });
      if (!res.ok) return; // silently ignore if endpoint not present
      const data = await res.json();
      setAlreadySubmitted(Boolean(data?.submitted));
      setSubmittedAt(data?.submitted_at || null);
    } catch (e) {
      // ignore – we’ll just assume not submitted
    }
  };

  const deletePreference = async (preferenceId) => {
    try {
      const res = await fetch(`${API}/preferences/${preferenceId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (res.ok) {
        await fetchPreferences();
      } else {
        const t = await res.text();
        alert(`Delete failed: ${res.status} ${t}`);
      }
    } catch (err) {
      console.error('Error deleting preference:', err);
    }
  };

  const updateContactedSupervisor = async (preferenceId, value) => {
    // optimistic update
    setPreferences(prev =>
      prev.map(p => p.preference_id === preferenceId ? { ...p, contacted_supervisor: value } : p)
    );

    try {
      const res = await fetch(`${API}/preferences/contacted`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ preference_id: preferenceId, contacted_supervisor: value }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Failed: ${res.status} ${t}`);
      }
    } catch (err) {
      console.error(err);
      await fetchPreferences(); // revert
      alert('Could not update contacted flag.');
    }
  };

  // Submit – allows re-submit; modal copy changes if alreadySubmitted is true
  const submitPreferences = async () => {
    if (!isSubmissionOpen) return alert('Submission window is closed.');
    if (preferences.length === 0) return alert('Please add at least one preference.');
    const incomplete = preferences.some(p => !p.contacted_supervisor || p.contacted_supervisor === '');
    if (incomplete) return alert('Please choose Yes/No for all preferences.');

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/preferences/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
      });
      const txt = await res.text();
      let payload; try { payload = JSON.parse(txt); } catch { payload = { message: txt || '' }; }
      if (!res.ok) throw new Error(payload?.message || `Submit failed: ${res.status}`);

      // mark as submitted/updated and show modal
      setAlreadySubmitted(true);
      setSubmittedAt(new Date().toISOString());
      setShowSubmitModal(true);

      await fetchPreferences();
    } catch (e) {
      console.error('Submit error:', e);
      alert(e.message || 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    Promise.all([fetchCycleStatus(), fetchPreferences(), fetchSubmissionStatus()]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Reorder helpers (backend PUT /preferences) ---
  const setOrder = (preference_id, preference_order) =>
    fetch(`${API}/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ preference_id, preference_order: Number(preference_order) }),
    });

  const handleSaveOrder = async (newOrder) => {
    if (!editingPref) return;
    if (Number(newOrder) === Number(editingPref.preference_order)) {
      setEditingPref(null);
      return;
    }
    if (!isSubmissionOpen) {
      alert('Submission window is closed.');
      return;
    }

    setSavingOrder(true);
    try {
      const swapWith = preferences.find(p => p.preference_order === Number(newOrder));
      const r1 = await setOrder(editingPref.preference_id, Number(newOrder));
      if (!r1.ok) throw new Error('Failed to update order');

      if (swapWith) {
        const r2 = await setOrder(swapWith.preference_id, Number(editingPref.preference_order));
        if (!r2.ok) throw new Error('Failed to swap order');
      }

      await fetchPreferences();
      setEditingPref(null);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Reorder failed');
    } finally {
      setSavingOrder(false);
    }
  };

  const renderPreferenceCard = (pref) => (
    <div key={pref.preference_id} className="pref-card">
      <span className="badge">Preference {pref.preference_order}</span>

      <div className="pref-card__content">
        <h4 className="pref-title">{pref.title}</h4>
        <p><strong>Supervisor:</strong> {pref.supervisor_name}</p>
        <p className="description">{pref.description}</p>

        <div className="contacted-field">
          <label>Have you contacted the supervisor?</label>
          <select
            value={pref.contacted_supervisor || ''}
            onChange={(e) => updateContactedSupervisor(pref.preference_id, e.target.value)}
            required
            disabled={!isSubmissionOpen}
          >
            <option value="">Select</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
          {!isSubmissionOpen && <small style={{ color: '#888' }}>Window closed</small>}
        </div>
      </div>

      <div className="actions">
        <button
          className="btn btn-outline"
          onClick={() => setEditingPref(pref)}
          disabled={!isSubmissionOpen}
          title={!isSubmissionOpen ? 'Window closed' : 'Edit order'}
        >
          Edit
        </button>
        <button
          className="btn btn-danger"
          onClick={() => deletePreference(pref.preference_id)}
          disabled={!isSubmissionOpen}
          title={!isSubmissionOpen ? 'Window closed' : 'Delete'}
        >
          Delete
        </button>
      </div>
    </div>
  );

  const renderEmptyCard = (index) => (
    <div key={`empty-${index}`} className="pref-card empty">
      <span className="badge">Preference {index + 1}</span>
      <div className="pref-card__content empty-content">
        <button
          type="button"
          className="add-project-btn"
          aria-label="Browse projects to add"
          onClick={() => navigate('/browse-projects')}
          disabled={!isSubmissionOpen}
          title={!isSubmissionOpen ? 'Window closed' : 'Add project'}
        >
          +
        </button>
        <p className="placeholder">Add a project</p>
      </div>
    </div>
  );

  const filled = preferences.length;
  const emptySlots = Math.max(0, MAX_PREFERENCES - filled);
  const allContactedSet = preferences.every(p => p.contacted_supervisor && p.contacted_supervisor !== '');

  return (
    <div className="preferences-page">
      <div className="page-container">
        <SideBar />
        <div className="content-area">
          <HeaderBar />

          <div className="page-inner">
            {/* banner for cycle state */}
            {!cycleLoading && (
              <div
                style={{
                  padding: '10px 14px', borderRadius: 10, marginBottom: 12,
                  background: isSubmissionOpen ? '#e9f7ef' : '#fdecea',
                  color: isSubmissionOpen ? '#1e4620' : '#611a15',
                  border: `1px solid ${isSubmissionOpen ? '#b7e0c7' : '#f5c6cb'}`,
                }}
              >
                {hasActiveCycle ? (
                  isSubmissionOpen ? (
                    <>
                      <strong>Submission window is OPEN.</strong>{' '}
                      {cycle?.submission_close_at
                        ? `Closes: ${new Date(cycle.submission_close_at).toLocaleString()}`
                        : ''}
                    </>
                  ) : (
                    <>
                      <strong>Submission window is CLOSED.</strong>{' '}
                      {cycle?.submission_close_at
                        ? `Closed: ${new Date(cycle.submission_close_at).toLocaleString()}`
                        : ''}
                    </>
                  )
                ) : (
                  <strong>No active allocation cycle.</strong>
                )}
              </div>
            )}

            <div className="preferences-wrapper">
              <div className="prefs-header">
                <h2>My Preferences</h2>
                <div className="pref-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="pref-count">Preferences: {filled}/{MAX_PREFERENCES}</span>

                  {/* tiny pill that says "Submitted" if we already have a record */}
                  {alreadySubmitted && (
                    <span style={{
                      background: '#eef2ff', color: '#1e2a78', border: '1px solid #c7d2fe',
                      padding: '6px 10px', borderRadius: 999, fontSize: 12
                    }}>
                      Submitted{submittedAt ? ` • ${new Date(submittedAt).toLocaleString()}` : ''}
                    </span>
                  )}

                  <button
                    className="btn btn-primary"
                    onClick={submitPreferences}
                    disabled={submitting || filled === 0 || !allContactedSet || !isSubmissionOpen}
                    title={
                      !isSubmissionOpen ? 'Window closed'
                      : !allContactedSet ? 'Select Yes/No for all items'
                      : alreadySubmitted ? 'Update submission' : 'Submit preferences'
                    }
                  >
                    {submitting ? 'Submitting…' : (alreadySubmitted ? 'Re-submit' : 'Submit Preferences')}
                  </button>
                </div>
              </div>

              {loading ? (
                <p>Loading...</p>
              ) : (
                <div className="preferences-grid">
                  {preferences.map((pref) => renderPreferenceCard(pref))}
                  {Array.from({ length: emptySlots }).map((_, i) => renderEmptyCard(filled + i))}
                </div>
              )}
            </div>
          </div>
        </div>

        <EditOrderModal
          open={!!editingPref}
          pref={editingPref}
          max={Math.max(1, filled)}
          onClose={() => !savingOrder && setEditingPref(null)}
          onSave={handleSaveOrder}
        />
      </div>

      {/* Submit success popup (copy changes if was already submitted) */}
      <SubmitModal
        open={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        deadline={cycle?.submission_close_at}
        alreadySubmitted={alreadySubmitted}
      />
    </div>
  );
}
