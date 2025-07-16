import React from 'react';
import './headerBar.css';

const HeaderBar = () => {
  return (
    <header className="header-bar">
      <div className="logo-section">
        <img src="/assets/aston_logo.png" alt="Aston Logo" className="logo" />
        <h1 className="portal-title">Aston Project Portal</h1>
      </div>
      <div className="search-section">
        <input type="text" placeholder="Search here" />
        <button className="search-btn">🔍</button>
        <div className="profile-icon">👤<span className="caret">▾</span></div>
      </div>
    </header>
  );
};

export default HeaderBar;
