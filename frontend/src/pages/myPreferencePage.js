import React, { useEffect, useState } from 'react';
import './myPreferencePage.css';
import SideBar from '../components/sideBar';
import HeaderBar from '../components/headerBar';

const MAX_PREFERENCES = 5;

const MyPreferencesPage = () => {
  const [preferences, setPreferences] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');

  const fetchPreferences = async () => {
    try {
      const res = await fetch('http://localhost:5000/preferences', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setPreferences(data || []);
    } catch (err) {
      console.error('Error fetching preferences:', err);
    }
    setLoading(false);
  };

  const deletePreference = async (preferenceId) => {
    try {
      const res = await fetch(`http://localhost:5000/preferences/${preferenceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchPreferences();
      }
    } catch (err) {
      console.error('Error deleting preference:', err);
    }
  };

  useEffect(() => {
    fetchPreferences();
  }, []);

  const renderPreferenceCard = (pref, index) => (
    <div key={pref.preference_id} className="pref-card">
      <div className="pref-header">Preference {index + 1}</div>
      <h4 className="pref-title">{pref.title}</h4>
      <p><strong>Supervisor:</strong> {pref.supervisor_name}</p>
      <p className="description">{pref.description}</p>
      <div className="actions">
        <button className="edit">Edit</button>
        <button className="delete" onClick={() => deletePreference(pref.preference_id)}>Delete</button>
      </div>
    </div>
  );

  const renderEmptyCard = (index) => (
    <div key={`empty-${index}`} className="pref-card empty">
      <div className="pref-header">Preference {index + 1}</div>
      <p className="placeholder">Add a project</p>
    </div>
  );

  const filled = preferences.length;
  const emptySlots = MAX_PREFERENCES - filled;

  return (
    <div className="page-container">
      <SideBar />
      <div className="content-area">
        <HeaderBar />
        <div className="preferences-wrapper">
          <h2>Preferences</h2>
          {loading ? (
            <p>Loading...</p>
          ) : (
            <div className="preferences-grid">
              {preferences.map((pref, index) => renderPreferenceCard(pref, index))}
              {[...Array(emptySlots)].map((_, i) => renderEmptyCard(filled + i))}
            </div>
          )}
          <div className="submit-wrapper">
            <button className="submit-btn">Submit Preferences</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyPreferencesPage;
