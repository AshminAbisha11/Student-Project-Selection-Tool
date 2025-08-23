import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import './adminLoginPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
// Make sure this matches your backend route (e.g. '/auth/admin-login' or '/admin-login')
const ADMIN_LOGIN_PATH = process.env.REACT_APP_ADMIN_LOGIN_PATH || '/admin-login';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (k) => (e) => {
    setErr('');
    setForm((v) => ({ ...v, [k]: e.target.value }));
  };

  const mapError = (e) => {
    const status = e?.response?.status;
    const msgRaw = e?.response?.data?.message || '';
    const msg = String(msgRaw).toLowerCase();

    // Not an admin (preferred UX)
    if (status === 403 || msg.includes('not an admin')) {
      return 'This account is not an admin. Please use the Student/Supervisor login.';
    }
    // Endpoint not found (wrong path / route not mounted)
    if (status === 404) {
      return 'Admin login endpoint not found. Please check your server route or ADMIN_LOGIN_PATH.';
    }
    // Common auth messages
    if (status === 400 && msg.includes('user not found')) {
      return 'We couldn’t find an account with that email. If you are a student or supervisor, use the regular login.';
    }
    if (status === 400 && (msg.includes('password') || msg.includes('does not match'))) {
      return 'Incorrect email or password.';
    }
    // Network / fallback
    if (e?.message === 'Network Error') {
      return 'Unable to reach the server. Please check your connection and try again.';
    }
    return msgRaw || 'Login failed. Please try again.';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setErr('Please fill in both fields.');
      return;
    }

    try {
      setSubmitting(true);

      // Clear any stale auth
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');

      const { data } = await axios.post(
        `${API}${ADMIN_LOGIN_PATH}`,
        { email: form.email.trim().toLowerCase(), password: form.password },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!data?.token || !data?.user) {
        setErr('Invalid response from server.');
        return;
      }

      // Belt & braces: ensure role is admin
      const role = String(data.user.role || '').toLowerCase();
      if (role !== 'admin') {
        setErr('This account is not an admin. Please use the Student/Supervisor login.');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('role', role);

      navigate('/admin', { replace: true });
    } catch (e2) {
      setErr(mapError(e2));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="al-root"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <div className="al-card">
        <h1 className="al-title">Admin Login</h1>
        <p className="al-sub">Use your admin email and password.</p>

        {err && (
          <div className="al-alert al-alert--error" role="alert" aria-live="polite">
            {err}
          </div>
        )}

        <form className="al-form" onSubmit={submit} noValidate>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@aston.ac.uk or you@gmail.com"
              autoComplete="email"
              disabled={submitting}
              required
            />
          </label>

          <label>
            Password
            <div className="al-input-wrap">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={update('password')}
                placeholder="Password"
                autoComplete="current-password"
                disabled={submitting}
                required
              />
              <button
                type="button"
                className="al-eye"
                onClick={() => setShowPw((s) => !s)}
                disabled={submitting}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <button className={`al-btn ${submitting ? 'al-btn--loading' : ''}`} type="submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <div className="al-foot">
          <Link to="/admin-signup" className="al-link">Need to create an admin account?</Link>
          <Link to="/login" className="al-link">Back to user login</Link>
        </div>
      </div>
    </div>
  );
}
