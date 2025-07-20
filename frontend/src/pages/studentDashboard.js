import React, { useEffect, useState } from 'react';
import './studentDashboard.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/sideBar'; 

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState({
    preferencesCount: 0,
    proposalsSent: 0,
    applicationStatus: 'Pending',
  });

  const student = JSON.parse(localStorage.getItem('student'));
  const studentId = student?.user_id;

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!studentId) return;
      try {
        const res = await axios.get(`http://localhost:5000/dashboard/${studentId}`);
        setDashboardData(res.data);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      }
    };

    fetchDashboard();
  }, [studentId]);

  return (
    <div className="dashboard-container">
      <Sidebar/> 
      
      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Aston Project Portal</h2>
          <div className="profile-icon">👤</div>
        </header>

        <div className="dashboard-welcome">
          <h3>Welcome, {student?.name || 'Student'}!</h3>
          <p>Here’s a quick overview of your project journey</p>
        </div>

        {/* Info Cards */}
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

        <div className="dashboard-actions">
          <h4>Quick Actions</h4>
          <button onClick={() => navigate('/browse-projects')}>Browse Projects</button>
          <button onClick={() => navigate('/submit-proposal')}>Submit Proposal</button>
          <button onClick={() => navigate('/edit-preferences')}>Edit Preferences</button>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
