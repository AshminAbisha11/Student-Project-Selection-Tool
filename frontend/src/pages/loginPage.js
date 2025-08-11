import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './loginPage.css';

const API = 'http://localhost:5000';

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

      // clear any old/stale data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('student'); // legacy key from older versions

      const { data } = await axios.post(`${API}/login`, {
        email: formData.email,
        password: formData.password,
      });

      if (!data?.token || !data?.user) {
        setError('Invalid response from server.');
        return;
      }

      // persist fresh auth
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      setSuccess(data.message || 'Login successful');

      // route by role from backend
      const role = String(data.user.role || '').trim().toLowerCase();
      navigate(role === 'supervisor' ? '/supervisor-dashboard' : '/student-dashboard', {
        replace: true,
      });
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAccount = () => navigate('/register');
  const handleForgotPassword = () => navigate('/forgot-password');

  return (
    <div
      className="login-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <div className="login-box">
        {/* Left Panel */}
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
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="current-password"
              disabled={submitting}
            />

            <p className="forgot-password" onClick={handleForgotPassword}>
              Forgot password?
            </p>

            <button type="submit" className="login-button" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Login'}
            </button>
          </form>

          {error && <p className="error-msg">{error}</p>}
          {success && <p className="success-msg">{success}</p>}
        </div>

        {/* Right Panel */}
        <div className="login-right">
          <h3>New to the Project Portal?</h3>
          <p>
            Create your account to browse projects, submit your preferences, or propose your own!
          </p>
          <button className="login-button" onClick={handleCreateAccount} disabled={submitting}>
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
}
