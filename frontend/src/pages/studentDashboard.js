import React, { useEffect, useState } from 'react';
import './studentDashboard.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/sideBar';
import ProfileDropdown from '../components/profileDropdown';

const StudentDashboard = () => {
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState({
    stats: {
      preferencesSubmitted: 0,
      proposalsSent: 0,
      applicationStatus: 'Pending',
    },
  });

  const [showPrefModal, setShowPrefModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [preferences, setPreferences] = useState([]);
  const [proposals, setProposals] = useState([]);

  const student = JSON.parse(localStorage.getItem('student'));
  const token = localStorage.getItem('token');
  const studentId = student?.user_id;
  const studentName = student?.name || 'Student';

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!studentId || !token) {
        navigate('/login');
        return;
      }

      try {
        const res = await axios.get(`http://localhost:5000/dashboard/${studentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDashboardData(res.data);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        if (err.response?.status === 401 || err.response?.status === 403) {
          alert('Session expired. Please log in again.');
          localStorage.clear();
          navigate('/login');
        }
      }
    };

    fetchDashboard();
  }, [studentId, token, navigate]);

  const handleShowPreferences = async () => {
    try {
      const res = await axios.get('http://localhost:5000/preferences', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPreferences(res.data);
      setShowPrefModal(true);
    } catch (err) {
      console.error('Error fetching preferences:', err);
      alert('Failed to load preferences.');
    }
  };

  const handleShowProposals = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/proposals/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProposals(res.data);
      setShowProposalModal(true);
    } catch (err) {
      console.error('Error fetching proposals:', err);
      alert('Failed to load proposals.');
    }
  };

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
          <div className="dashboard-card" onClick={handleShowPreferences} style={{ cursor: 'pointer' }}>
            <h4>{dashboardData.stats.preferencesSubmitted}</h4>
            <p>Preferred Projects</p>
          </div>
          <div className="dashboard-card" onClick={handleShowProposals} style={{ cursor: 'pointer' }}>
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
          <button onClick={() => navigate('/help')}>Help & Support</button>
        </div>
      </div>

      {/* Preferences Modal */}
      {showPrefModal && (
        <div className="modal-overlay">
          <div className="modal-content styled-card-modal">
            <button className="modal-close" onClick={() => setShowPrefModal(false)}>✕</button>
            <h3 className="modal-title">Preferred Projects</h3>
            <div className="project-card-container">
              {preferences.map((pref, index) => (
                <div className="project-card" key={pref.preference_id}>
                  <h4>{index + 1}. {pref.title}</h4>
                  <p className="project-description">{pref.description}</p>
                  <p className="supervisor-name">Supervisor: {pref.supervisor_name}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Proposals Modal */}
      {showProposalModal && (
        <div className="modal-overlay">
          <div className="modal-content styled-card-modal">
            <button className="modal-close" onClick={() => setShowProposalModal(false)}>✕</button>
            <h3 className="modal-title">Proposals Sent</h3>
            <div className="project-card-container">
              {proposals.map((proposal, index) => (
                <div className="project-card" key={proposal.proposal_id || index}>
                  <h4>{index + 1}. {proposal.title}</h4>
                  <p className="project-description">{proposal.description}</p>
                  {proposal.status && (
                    <p className="supervisor-name">Status: {proposal.status}</p>
                  )}
                  {proposal.file_path && (
                    <a
                      className="download-link"
                      href={`http://localhost:5000/uploads/${proposal.file_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      📎 View Attachment
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
