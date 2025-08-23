import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './adminSignupPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const ADMIN_SIGNUP_PATH =
  process.env.REACT_APP_ADMIN_SIGNUP_PATH || '/admin-signup'; // or '/auth/admin-signup'

export default function AdminSignupPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    inviteCode: ''
  });
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const update = (k) => (e) => {
    setErr('');
    setForm((v) => ({ ...v, [k]: e.target.value }));
  };

  const canSubmit = useMemo(() => {
    if (!form.name.trim() || !form.email.trim()) return false;
    if (form.password.length < 8) return false;
    if (form.password !== form.confirm) return false;
    return true;
  }, [form]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setErr('');
    setOkMsg('');
    try {
      const cleanedCode =
        (form.inviteCode || '')
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)[0] || null;

      const emailLower = form.email.trim().toLowerCase();

      const res = await fetch(`${API}${ADMIN_SIGNUP_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: emailLower,
          password: form.password,
          inviteCode: cleanedCode
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setErr(data?.message || 'Sign up failed. Please check your details.');
        return;
      }

      const { token, role = 'admin', user } = data;
      localStorage.setItem('token', token);
      localStorage.setItem('role', role);
      if (user) localStorage.setItem('user', JSON.stringify(user));

      setOkMsg('Admin account created. Redirecting…');
      setTimeout(() => navigate('/admin'), 600);
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="adsg-root"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <div className="adsg-overlay" />
      <div className="adsg-card">
        <h1 className="adsg-title">Create Admin Account</h1>
        <p className="adsg-sub">Use your Aston or Gmail email.</p>

        {err && <div className="adsg-alert adsg-alert--error">{err}</div>}
        {okMsg && <div className="adsg-alert adsg-alert--ok">{okMsg}</div>}

        <form className="adsg-form" onSubmit={submit} noValidate>
          <label>Full Name
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={update('name')}
              placeholder="Jane Admin"
              autoComplete="name"
              required
            />
          </label>

          <label>Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={update('email')}
              placeholder="you@aston.ac.uk or you@gmail.com"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck="false"
              required
            />
          </label>

          <div className="adsg-row">
            <label>Password
              <div className="adsg-input-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={update('password')}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="adsg-eye"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  onClick={() => setShowPw((s) => !s)}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label>Confirm Password
              <div className="adsg-input-wrap">
                <input
                  type={showPw2 ? 'text' : 'password'}
                  name="confirmPassword"
                  value={form.confirm}
                  onChange={update('confirm')}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="adsg-eye"
                  aria-label={showPw2 ? 'Hide confirm password' : 'Show confirm password'}
                  aria-pressed={showPw2}
                  onClick={() => setShowPw2((s) => !s)}
                >
                  {showPw2 ? 'Hide' : 'Show'}
                </button>
              </div>
              {form.confirm && form.confirm !== form.password && (
                <small className="adsg-warn">Passwords do not match</small>
              )}
            </label>
          </div>

          <label>Invite code (if provided)
            <input
              type="text"
              name="inviteCode"
              value={form.inviteCode}
              onChange={update('inviteCode')}
              placeholder="e.g. ASTON-ADMIN-ABCD-EFGH-IJKL"
              spellCheck="false"
            />
          </label>

          <button
            className="adsg-btn"
            type="submit"
            disabled={loading || !canSubmit}
            aria-disabled={loading || !canSubmit}
          >
            {loading ? 'Creating…' : 'Create admin account'}
          </button>
        </form>

        {/* Updated footer links */}
        <div className="adsg-foot">
          <Link to="/admin-login" className="adsg-link adsg-link--underline">
            Already have an account? Login
          </Link>
          <span className="adsg-spacer" />
          <Link to="/register" className="adsg-link adsg-link--arrow">
            Back to student/supervisor sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
