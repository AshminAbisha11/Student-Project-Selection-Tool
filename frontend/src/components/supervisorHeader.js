import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './supervisorHeader.css';

function getUserInfo() {
  try {
    const saved = JSON.parse(localStorage.getItem('user') || 'null');
    if (saved?.name || saved?.email || saved?.avatarUrl) return saved;
  } catch {}
  const token = localStorage.getItem('token');
  if (!token) return {};
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { name: payload?.name, email: payload?.email };
  } catch {
    return {};
  }
}
function getInitials(name, email) {
  const src = (name || email || '').trim();
  if (!src) return 'U';
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map(p => (p[0] || '').toUpperCase()).join('') || 'U';
}

export default function SupervisorHeader({
  fallbackSidebarWidth = 280,
  sidebarSelector = '.sv-sidebar',
}) {
  const navigate = useNavigate();
  const [sidebarW, setSidebarW] = useState(fallbackSidebarWidth);
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(getUserInfo());
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    const getWidth = () => {
      const el = document.querySelector(sidebarSelector);
      return el ? Math.round(el.getBoundingClientRect().width) : fallbackSidebarWidth;
    };
    const update = () => setSidebarW(getWidth());
    update();

    const el = document.querySelector(sidebarSelector);
    const ro = el ? new ResizeObserver(update) : null;
    if (ro && el) ro.observe(el);

    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      if (ro) ro.disconnect();
    };
  }, [sidebarSelector, fallbackSidebarWidth]);

  useEffect(() => {
    const onClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onEsc = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const initials = getInitials(user?.name, user?.email);

  return (
    <header
      className="sv-header"
      style={{ left: `${sidebarW}px`, width: `calc(100vw - ${sidebarW}px)` }}
      role="banner"
      aria-label="Supervisor header"
    >
      <div className="sv-header__left">
        <h1 className="sv-header__title">Supervisor Project Management</h1>
      </div>

      <div className="sv-header__right">
        <div className="sv-search-wrap">
          <input className="sv-search" type="text" placeholder="Search here" aria-label="Search" />
        </div>

        {/* Avatar + chevron dropdown */}
        <div className="sv-user" ref={menuRef}>
          <div
            className="sv-avatar"
            title={user?.name || user?.email || 'User'}
            aria-hidden="true"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <button
            className="sv-caret"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Open user menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {menuOpen && (
            <div className="sv-menu-panel" role="menu">
              <button className="sv-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); navigate('/supervisor-dashboard'); }}>
                Dashboard
              </button>
              <button className="sv-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); navigate('/logout'); }}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
