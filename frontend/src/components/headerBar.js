import React, { useState } from 'react';
import './headerBar.css';

const HeaderBar = ({ onSearch }) => {
  const [q, setQ] = useState('');

  const run = () => {
    const term = q.trim();
    if (!term) return;
    onSearch?.(term);
  };

  return (
    <header className="header-bar">
      <div className="logo-section">
        <img src="/assets/aston_logo.png" alt="Aston Logo" className="logo" />
        <h1 className="portal-title">Student Project Selection Portal</h1>
      </div>

      <div className="search-section">
        <input
          type="text"
          placeholder="Search here"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          aria-label="Search projects"
        />
        <button className="search-btn btn-purple" onClick={run} aria-label="Search">🔍</button>
        <div className="profile-icon">👤<span className="caret">▾</span></div>
      </div>
    </header>
  );
};

export default HeaderBar;
