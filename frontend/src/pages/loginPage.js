// loginPage.jsx (final, single call)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './loginPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
// If you later change your server to /auth/login, just flip this:
const LOGIN_PATH = process.env.REACT_APP_LOGIN_PATH || '/login'; // or '/auth/login'

export default function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setError('');
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const safeNavigate = (to) => {
    requestAnimationFrame(() => {
      try { navigate(to, { replace: true }); }
      catch { window.location.assign(to); }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.email || !formData.password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setSubmitting(true);

      // clear stale keys
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');

      const { data } = await axios.post(
        `${API}${LOGIN_PATH}`,
        { email: formData.email, password: formData.password },
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (!data?.token || !data?.user) {
        setError('Invalid response from server.');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('role', String(data.user.role || '').toLowerCase());

      setSuccess(data.message || 'Login successful');

      const role = String(data.user.role || '').trim().toLowerCase();
      const target = role === 'supervisor' ? '/supervisor-dashboard' : '/student-dashboard';
      safeNavigate(target);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Login failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container" style={{ backgroundImage: "url('/assets/login_background.png')" }}>
      <div className="login-box">
        <div className="login-left">
          <div className="header-title">
            <img src="/assets/aston_logo.png" alt="Aston University Logo" className="logo" />
            <h1 className="tool-title">Student Project Selection Portal</h1>
          </div>

          <h2 className="login-heading">Log in to your account</h2>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
            <input
              type="email"
              name="email"
              placeholder="you@aston.ac.uk"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              disabled={submitting}
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
              disabled={submitting}
              required
            />
            <p className="forgot-password" onClick={() => navigate('/forgot-password')}>
              Forgot password?
            </p>
            <button type="submit" className="login-button" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Login'}
            </button>
          </form>

          {error && <p className="error-msg">{error}</p>}
          {success && <p className="success-msg">{success}</p>}
        </div>

        <div className="login-right">
          <h3>New to the Project Portal?</h3>
          <p>Create your account to browse projects, submit your preferences, or propose your own!</p>
          <button className="login-button" onClick={() => navigate('/register')} disabled={submitting}>
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}
