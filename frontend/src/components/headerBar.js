import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './headerBar.css';

const HeaderBar = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const toggleDropdown = () => setDropdownOpen((v) => !v);

  const goToDashboard = () => {
    navigate('/student-dashboard');
    setDropdownOpen(false);
  };

  const handleLogout = () => {
    setDropdownOpen(false);
    navigate('/logout'); 
  };

  // Close dropdown on outside click or Esc
  useEffect(() => {
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <header className="header-bar">
      <div className="logo-section">
        <img src="/assets/aston_logo.png" alt="Aston Logo" className="logo" />
        <h1 className="portal-title">Student Project Selection Portal</h1>
      </div>

      <div className="search-section">
        <input type="text" placeholder="Search here" />
        <button className="search-btn" aria-label="Search">🔍</button>

        <div className="profile-container" ref={dropdownRef}>
          <div className="profile-icon" onClick={toggleDropdown} role="button" tabIndex={0}>
            👤<span className="caret">▾</span>
          </div>

          {dropdownOpen && (
            <div className="profile-dropdown">
              <button className="menu-item" onClick={goToDashboard}>Dashboard</button>
              <button className="menu-item" onClick={handleLogout}>Logout</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
