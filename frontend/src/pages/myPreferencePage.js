import React, { useEffect, useState } from 'react';
import './myPreferencePage.css';
import SideBar from '../components/sideBar';
import HeaderBar from '../components/headerBar';

const MAX_PREFERENCES = 5;
const API = 'http://localhost:5000';

const MyPreferencesPage = () => {
  const [preferences, setPreferences] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');

  const fetchPreferences = async () => {
    try {
      const res = await fetch(`${API}/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPreferences(Array.isArray(data) ? data : []);
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

  const renderPreferenceCard = (pref, index) => (
    <div key={pref.preference_id} className="pref-card">
      <span className="badge">Preference {index + 1}</span>

      <div className="pref-card__content">
        <h4 className="pref-title">{pref.title}</h4>
        <p><strong>Supervisor:</strong> {pref.supervisor_name}</p>
        <p className="description">{pref.description}</p>
      </div>

      <div className="actions">
        <button className="btn btn-outline">Edit</button>
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
      <div className="pref-card__content">
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
            {/* Header row (title + actions like the dashboard) */}
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
                {preferences.map((pref, idx) => renderPreferenceCard(pref, idx))}
                {Array.from({ length: emptySlots }).map((_, i) =>
                  renderEmptyCard(filled + i)
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyPreferencesPage;
