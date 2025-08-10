import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';               // ⬅️ NEW
import './myPreferencePage.css';
import SideBar from '../components/sideBar';
import HeaderBar from '../components/headerBar';
import EditOrderModal from '../components/editOrderModal';

const MAX_PREFERENCES = 5;
const API = 'http://localhost:5000';

const MyPreferencesPage = () => {
  const [preferences, setPreferences] = useState([]);
  const [loading, setLoading] = useState(true);

  // modal state
  const [editingPref, setEditingPref] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const navigate = useNavigate();                              // ⬅️ NEW
  const token = localStorage.getItem('token');

  const fetchPreferences = async () => {
    try {
      const res = await fetch(`${API}/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  const deletePreference = async (preferenceId) => {
    try {
      const res = await fetch(`${API}/preferences/${preferenceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) await fetchPreferences();
    } catch (err) {
      console.error('Error deleting preference:', err);
    }
  };

  const submitPreferences = async () => {
    try {
      // await fetch(`${API}/preferences/submit`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }}); 
      alert('Preferences submitted!');
    } catch (e) {
      console.error(e);
      alert('Failed to submit preferences.');
    }
  };

  useEffect(() => {
    fetchPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Reorder helpers (backend PUT /preferences) ---
  const setOrder = (preference_id, preference_order) =>
    fetch(`${API}/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        preference_id,
        preference_order: Number(preference_order),
      }),
    });

  const handleSaveOrder = async (newOrder) => {
    if (!editingPref) return;
    if (Number(newOrder) === Number(editingPref.preference_order)) {
      setEditingPref(null);
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
      </div>

      <div className="actions">
        <button className="btn btn-outline" onClick={() => setEditingPref(pref)}>Edit</button>
        <button
          className="btn btn-danger"
          onClick={() => deletePreference(pref.preference_id)}
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
          onClick={() => navigate('/browse-projects')}       // ⬅️ adjust route if needed
        >
          +
        </button>
        <p className="placeholder">Add a project</p>
      </div>
    </div>
  );

  const filled = preferences.length;
  const emptySlots = Math.max(0, MAX_PREFERENCES - filled);

  return (
    <div className="page-container">
      <SideBar />

      <div className="content-area">
        <HeaderBar />

        <div className="page-inner">
          <div className="preferences-wrapper">
            <div className="prefs-header">
              <h2>My Preferences</h2>

              <div className="pref-actions">
                <span className="pref-count">Preferences: {filled}/{MAX_PREFERENCES}</span>
                <button
                  className="btn btn-primary"
                  onClick={submitPreferences}
                  disabled={filled === 0}
                >
                  Submit Preferences
                </button>
              </div>
            </div>

            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="preferences-grid">
                {preferences.map((pref) => renderPreferenceCard(pref))}
                {Array.from({ length: emptySlots }).map((_, i) =>
                  renderEmptyCard(filled + i)
                )}
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
  );
};

export default MyPreferencesPage;
