import React, { useEffect, useState } from 'react';
import './studentDashboard.css';
import axios from 'axios';

const StudentDashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    preferencesCount: 0,
    proposalsSent: 0,
    applicationStatus: 'Pending',
  });

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const studentId = 1;
        const res = await axios.get(`http://localhost:5000/dashboard/${studentId}`);
        setDashboardData(res.data);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      }
    };

    fetchDashboard();
  }, []);

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <div className="sidebar">
        <img src="/assets/aston_logo.png" alt="Aston Logo" className="sidebar-logo" />
        <ul>
          <li>Browse Projects</li>
          <li>My Preferences</li>
          <li>My Proposals</li>
          <li>Logout</li>
        </ul>
      </div>

      {/* Main Panel */}
      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Aston Project Portal</h2>
          <div className="profile-icon">👤</div>
        </header>

        <div className="dashboard-welcome">
          <h3>Welcome, Ashmin!</h3>
          <p>Here’s a quick overview of your project journey</p>
        </div>

        {/* Info Boxes */}
        <div className="dashboard-cards">
          <div className="dashboard-card">
            <h4>{dashboardData.preferencesCount}</h4>
            <p>Preferences Submitted</p>
          </div>
          <div className="dashboard-card">
            <h4>{dashboardData.proposalsSent}</h4>
            <p>Proposals Sent</p>
          </div>
          <div className="dashboard-card">
            <h4>{dashboardData.applicationStatus}</h4>
            <p>Application Status</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="dashboard-actions">
          <h4>Quick Actions Card</h4>
          <button>Browse Projects</button>
          <button>Submit Proposal</button>
          <button>Edit Preferences</button>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
