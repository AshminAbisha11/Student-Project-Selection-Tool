// components/Sidebar.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './sideBar.css';

const Sidebar = () => {
  const navigate = useNavigate();

  return (
    <div className="sidebar">
      <img src="/assets/aston_logo.png" alt="Aston Logo" className="sidebar-logo" />
      <ul>
        <li onClick={() => navigate('/browse-projects')}>Browse Projects</li>
        <li onClick={() => navigate('/my-preferences')}>My Preferences</li>
        <li onClick={() => navigate('/my-proposals')}>My Proposals</li>
        <li onClick={() => navigate('/logout')}>Logout</li>

      </ul>
    </div>
  );
};

export default Sidebar;
