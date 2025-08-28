// src/components/supervisorHeader.jsx
import React, { useLayoutEffect, useState } from 'react';
import './supervisorHeader.css';

/**
 * Auto-align header to the fixed sidebar.
 * - fallbackSidebarWidth is used only if the sidebar can't be measured.
 * - sidebarSelector points to your sidebar element (defaults to ".sv-sidebar").
 */
export default function SupervisorHeader({
  fallbackSidebarWidth = 280,
  sidebarSelector = '.sv-sidebar',
}) {
  const [sidebarW, setSidebarW] = useState(fallbackSidebarWidth);

  useLayoutEffect(() => {
    const getWidth = () => {
      const el = document.querySelector(sidebarSelector);
      return el ? Math.round(el.getBoundingClientRect().width) : fallbackSidebarWidth;
    };

    const update = () => setSidebarW(getWidth());
    update(); // initial

    const el = document.querySelector(sidebarSelector);
    const ro = el ? new ResizeObserver(update) : null;
    if (ro && el) ro.observe(el);

    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      if (ro) ro.disconnect();
    };
  }, [sidebarSelector, fallbackSidebarWidth]);

  return (
    <header
      className="sv-header"
      /* Pin the bar exactly from the sidebar’s right edge */
      style={{
        left: `${sidebarW}px`,
        width: `calc(100vw - ${sidebarW}px)`,
      }}
      role="banner"
      aria-label="Supervisor header"
    >
      <div className="sv-header__left">
      
        <h1 className="sv-header__title">Supervisor Project Management</h1>
      </div>

      <div className="sv-header__right">
        <div className="sv-search-wrap">
          <input
            type="text"
            className="sv-search"
            placeholder="Search here"
            aria-label="Search"
          />
          <button className="sv-search-btn" aria-label="Search">
            <i className="fas fa-search" />
          </button>
        </div>

        <button className="sv-profile-btn" aria-label="Profile">
          <i className="fas fa-user" />
        </button>
      </div>
    </header>
  );
}
