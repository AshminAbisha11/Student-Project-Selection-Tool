import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './logoutPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function LogoutPage() {
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const ctrl = new AbortController();

    (async () => {
      const token = localStorage.getItem('token');

      try {
        if (token) {
          console.debug('[FE] logout → sending Authorization header');
          const res = await fetch(`${API}/logout`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            // credentials not required unless using cookies
            signal: ctrl.signal,
          });

          // Debug the server response for visibility
          const body = await res.text().catch(() => '');
          console.debug('[FE] logout response:', res.status, body);
        } else {
          console.warn('[FE] logout → no token in localStorage');
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.error('[FE] logout request failed:', e);
      } finally {
        // Clear AFTER the request attempt
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('role');

        // Hard redirect to avoid cached protected pages on back nav
        window.location.replace('/login');
        // or: navigate('/login', { replace: true });
      }
    })();

    return () => ctrl.abort();
  }, [navigate]);

  return (
    <div className="logout-container">
      <div className="logout-message">Logging you out…</div>
    </div>
  );
}
