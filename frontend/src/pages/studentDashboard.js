import React, { useEffect, useState, useCallback } from 'react';
import './studentDashboard.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/sideBar';
import ProfileDropdown from '../components/profileDropdown';
import StudentProposalModal from '../components/studentProposalModal';   // <-- add this

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function StudentDashboard() {
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState({
    stats: { preferencesSubmitted: 0, proposalsSent: 0, applicationStatus: 'Pending' },
  });

  const token = localStorage.getItem('token');
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  })();
  const userId = user?.user_id;
  const studentName = user?.name || 'Student';

  const [showPrefModal, setShowPrefModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);

  // data for preferences modal (we keep this one inline)
  const [preferences, setPreferences] = useState([]);
  const [prefLoading, setPrefLoading] = useState(false);
  const [prefErr, setPrefErr] = useState('');

  /* Auth gate */
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (String(user.role).toLowerCase() !== 'student') {
      navigate('/supervisor-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

  /* Dashboard stats */
  useEffect(() => {
    if (!userId || !token) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/dashboard/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setDashboardData(res.data);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          alert('Session expired. Please log in again.');
          localStorage.clear();
          navigate('/login', { replace: true });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [userId, token, navigate]);

  /* ESC to close either modal */
  const onEscToClose = useCallback((e) => {
    if (e.key === 'Escape') {
      setShowPrefModal(false);
      setShowProposalModal(false);
    }
  }, []);
  useEffect(() => {
    if (showPrefModal || showProposalModal) {
      document.addEventListener('keydown', onEscToClose);
      return () => document.removeEventListener('keydown', onEscToClose);
    }
  }, [showPrefModal, showProposalModal, onEscToClose]);

  /* Preferences modal loader */
  const handleShowPreferences = async () => {
    setPrefErr('');
    setPrefLoading(true);
    try {
      const res = await axios.get(`${API}/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPreferences(Array.isArray(res.data) ? res.data : []);
      setShowPrefModal(true);
    } catch {
      setPrefErr('Failed to load preferences.');
    } finally {
      setPrefLoading(false);
    }
  };

  /* Proposals modal (fetch inside the modal component) */
  const handleShowProposals = () => setShowProposalModal(true);

  return (
    <div className="dashboard-container" style={{ backgroundImage: "url('/assets/login_background.png')" }}>
      <Sidebar />

      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Student Project Selection Portal</h2>
          <ProfileDropdown />
        </header>

        <div className="dashboard-welcome">
          <h3>Welcome, {studentName}!</h3>
          <p>Here’s a quick overview of your project journey</p>
        </div>

        <div className="dashboard-cards">
          <div
            className="dashboard-card"
            onClick={handleShowPreferences}
            style={{ cursor: 'pointer' }}
            role="button"
            aria-haspopup="dialog"
            aria-label="View Preferred Projects"
          >
            <h4>{dashboardData.stats.preferencesSubmitted}</h4>
            <p>Preferred Projects</p>
          </div>

          <div
            className="dashboard-card"
            onClick={handleShowProposals}
            style={{ cursor: 'pointer' }}
            role="button"
            aria-haspopup="dialog"
            aria-label="View Proposals Sent"
          >
            <h4>{dashboardData.stats.proposalsSent}</h4>
            <p>Proposals Sent</p>
          </div>

          <div className="dashboard-card">
            <h4>{dashboardData.stats.applicationStatus}</h4>
            <p>Application Status</p>
          </div>
        </div>

        <div className="dashboard-actions">
          <h4>Account Tools</h4>
          <button onClick={() => navigate('/change-password')}>Change Password</button>
          <button onClick={() => navigate('/profile')}>View Profile</button>
          <button onClick={() => navigate('/notifications')}>Notification Settings</button>
          <button onClick={() => navigate('/help-support')}>Help & Support</button>
        </div>
      </div>

      {/* Preferences Modal (inline) */}
      {showPrefModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowPrefModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-content styled-card-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowPrefModal(false)} aria-label="Close">✕</button>
            <h3 className="modal-title">Preferred Projects</h3>

            {prefLoading ? (
              <p>Loading…</p>
            ) : prefErr ? (
              <p style={{ color: '#b00' }}>{prefErr}</p>
            ) : preferences.length === 0 ? (
              <p>You haven’t added any preferences yet.</p>
            ) : (
              <div className="project-card-container">
                {preferences.map((pref, index) => (
                  <div className="project-card" key={pref.preference_id ?? `${pref.project_id}-${index}`}>
                    <h4>{index + 1}. {pref.title}</h4>
                    {pref.description && <p className="project-description">{pref.description}</p>}
                    {pref.supervisor_name && <p className="supervisor-name">Supervisor: {pref.supervisor_name}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Proposals Modal (separate component) */}
      <StudentProposalModal
        isOpen={showProposalModal}
        onClose={() => setShowProposalModal(false)}
        userId={userId}
        token={token}
      />
    </div>
  );
}
