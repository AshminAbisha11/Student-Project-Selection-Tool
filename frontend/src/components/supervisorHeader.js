import React from 'react';
import './supervisorHeader.css';

export default function SupervisorHeader() {
  return (
    <header className="sv-header">
      <div className="sv-header__left">
        {/* Logo in the header */}
        <img
          className="sv-header__logo"
          src="/assets/aston_logo.png"
          alt="Aston University"
        />
        <h1 className="sv-header__title">Supervisor Project Management</h1>
      </div>

      <div className="sv-header__right">
        <input
          type="text"
          className="sv-search"
          placeholder="Search here"
          aria-label="Search"
        />
        <button className="sv-search-btn" aria-label="Search">
          <i className="fas fa-search" />
        </button>
        <button className="sv-profile-btn" aria-label="Profile">
          <i className="fas fa-user" />
        </button>
      </div>
    </header>
  );
}
