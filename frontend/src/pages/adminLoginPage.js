// src/pages/adminLoginPage.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import './adminLoginPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
// Set this to your actual backend route. If your server mounts under /auth, set it to '/auth/admin-login'
const ADMIN_LOGIN_PATH =
  process.env.REACT_APP_ADMIN_LOGIN_PATH || '/admin-login';

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

  const safeNavigate = (to) => {
    // avoids “Cannot update a component while rendering a different component” in rare cases
    requestAnimationFrame(() => {
      try {
        navigate(to, { replace: true });
      } catch {
        window.location.assign(to);
      }
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const email = form.email.trim();
    const password = form.password;

    if (!email || !password) {
      setErr('Please fill in both email and password.');
      return;
    }

    try {
      setSubmitting(true);

      // Clear any stale session
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');

      const { data } = await axios.post(
        `${API}${ADMIN_LOGIN_PATH}`,
        { email, password },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!data?.token || !data?.user) {
        setErr('Invalid response from server.');
        return;
      }

      const role = String(data.user.role || '').toLowerCase();
      if (role !== 'admin') {
        setErr('This account is not an admin.');
        return;
      }

      // Persist session
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('role', role);

      safeNavigate('/admin');
    } catch (e2) {
      const msg =
        e2?.response?.data?.message ||
        (e2?.response?.status === 404
          ? 'Login endpoint not found. Check ADMIN_LOGIN_PATH.'
          : e2?.message) ||
        'Login failed';
      setErr(msg);
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
        <p className="al-sub">
          Use your admin email and password
        </p>

        {err && <div className="al-alert">{err}</div>}

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
                disabled={submitting || !form.password}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <button className="al-btn" type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Login'}
          </button>
        </form>

        <div className="al-foot">
          <Link to="/admin-signup" className="al-link">
            Need to create an admin account?
          </Link>
          <Link to="/login" className="al-link">
            Back to user login
          </Link>
        </div>
      </div>
    </div>
  );
}
