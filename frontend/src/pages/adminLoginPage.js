import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './adminLoginPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const ADMIN_LOGIN_PATH =
  process.env.REACT_APP_ADMIN_LOGIN_PATH || '/login';

export default function AdminLoginPage() {
  const navigate = useNavigate();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const eMail = email.trim();
    if (!eMail || !password) {
      setError('Please enter email and password.');
      return;
    }

    try {
      setLoading(true);

      // clear stale session
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');

      const res = await fetch(`${API}${ADMIN_LOGIN_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: eMail, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Login failed');

      if (!data?.token || !data?.user) {
        throw new Error('Invalid response from server.');
      }

      const role    = String(data.user.role || '').toLowerCase();
      const isAdmin = role === 'admin' || data.user.is_admin === true;
      if (!isAdmin) throw new Error('This account is not an admin.');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('role', 'admin');

      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="ad-root"
      /* background from PUBLIC: public/assets/login_background.png */
      style={{ '--bg-img': "url('/assets/login_background.png')" }}
    >
      <div className="ad-card">
        {/* LEFT: brand + form (kept identical rhythm to student page) */}
        <div className="ad-left">
          <div className="ad-left-inner">
            <div className="ad-brand">
              <img src="/assets/aston_logo.png" alt="Aston University" className="ad-logo" />
              <h1 className="ad-portal-title">Student Project Selection Tool</h1>
            </div>

            <h2 className="ad-h2">Admin Login</h2>

            {error && (
              <div className="ad-alert" role="alert" aria-live="polite">
                {error}
              </div>
            )}

            <form className="ad-form" onSubmit={onSubmit} noValidate>
              <label htmlFor="ad-email" className="sr-only">Email</label>
              <input
                id="ad-email"
                type="email"
                placeholder="you@aston.ac.uk"
                value={email}
                onChange={(e) => {
                  setError('');
                  setEmail(e.target.value);
                }}
                autoComplete="email"
                disabled={loading}
                required
              />

              <label htmlFor="ad-password" className="sr-only">Password</label>
              <div className="ad-passwrap">
                <input
                  id="ad-password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setError('');
                    setPassword(e.target.value);
                  }}
                  autoComplete="current-password"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="ad-show"
                  onClick={() => setShowPw((s) => !s)}
                  disabled={loading || !password}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>

              <div className="ad-links-row">
                <Link to="/forgot-password" className="ad-link">Forgot password?</Link>
              </div>

              <button
                type="submit"
                className={`ad-btn${loading ? ' ad-btn--loading' : ''}`}
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Login'}
              </button>

              <div className="ad-under">
                <Link to="/login" className="ad-link">Back to user login →</Link>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT: CTA panel */}
        <aside className="ad-right" aria-label="Create admin account">
          <h3 className="ad-right-title">New to the Admin Portal?</h3>
          <p className="ad-right-text">
            Create an admin account to manage cycles, projects, and allocations.
          </p>
          <Link to="/admin-signup" className="ad-cta">
            Create Admin Account
          </Link>
        </aside>
      </div>
    </div>
  );
}
