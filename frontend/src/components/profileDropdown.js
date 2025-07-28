import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserCircle } from 'react-icons/fa';
import './profileDropdown.css';

const ProfileDropdown = () => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    navigate('/logout');
  };

  const handleDashboard = () => {
    navigate('/student-dashboard');
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="profile-dropdown-container" ref={dropdownRef}>
      <FaUserCircle
        className="profile-dropdown-icon"
        onClick={() => setOpen(!open)}
      />
      {open && (
        <div className="profile-dropdown-menu">
          <div className="dropdown-item" onClick={handleDashboard}>
            My Dashboard
          </div>
          <div className="dropdown-item" onClick={handleLogout}>
            Logout
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileDropdown;
