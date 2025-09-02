// src/pages/AdminSignupPage.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './adminSignupPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const ADMIN_SIGNUP_PATH =
  process.env.REACT_APP_ADMIN_SIGNUP_PATH || '/admin-signup';

export default function AdminSignupPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    inviteCode: '',
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
          inviteCode: cleanedCode,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(data?.message || 'Sign up failed. Please check your details.');
        return;
      }

      const { token, role = 'admin', user } = data || {};
      if (token) localStorage.setItem('token', token);
      localStorage.setItem('role', role || 'admin');
      if (user) localStorage.setItem('user', JSON.stringify(user));

      setOkMsg('Admin account created. Redirecting…');
      setTimeout(() => navigate('/admin', { replace: true }), 600);
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="adsg-root"
      // Use a PUBLIC asset so bundlers don’t try to import it
      style={{ '--bg-img': "url('/assets/login_background.png')" }}
    >
      <div className="adsg-layout">
        {/* LEFT: brand + form (same spacing as student) */}
        <section className="adsg-left">
          <div className="adsg-brand">
            <img src="/assets/aston_logo.png" alt="Aston University" className="ad-logo" />
            <span className="adsg-brand-title">Student Project Selection Tool</span>
          </div>

          <h1 className="adsg-title">Create Admin Account</h1>

          {err && <div className="adsg-alert adsg-alert--error">{err}</div>}
          {okMsg && <div className="adsg-alert adsg-alert--ok">{okMsg}</div>}

          <form className="adsg-form" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="adsg-name">Full Name</label>
              <input
                id="adsg-name"
                type="text"
                name="name"
                value={form.name}
                onChange={update('name')}
                placeholder="Jane Admin"
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label htmlFor="adsg-email">Email</label>
              <input
                id="adsg-email"
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
            </div>

            <div className="adsg-row">
              <div>
                <label htmlFor="adsg-password">Password</label>
                <div className="adsg-input-wrap">
                  <input
                    id="adsg-password"
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
              </div>

              <div>
                <label htmlFor="adsg-confirm">Confirm Password</label>
                <div className="adsg-input-wrap">
                  <input
                    id="adsg-confirm"
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
              </div>
            </div>

            <div>
              <label htmlFor="adsg-invite">Invite code (if provided)</label>
              <input
                id="adsg-invite"
                type="text"
                name="inviteCode"
                value={form.inviteCode}
                onChange={update('inviteCode')}
                placeholder="e.g. ASTON-ADMIN-ABCD-EFGH-IJKL"
                spellCheck="false"
              />
            </div>

            <button
              className="adsg-btn"
              type="submit"
              disabled={loading || !canSubmit}
              aria-disabled={loading || !canSubmit}
            >
              {loading ? 'Creating…' : 'Create admin account'}
            </button>

            {/* Optional: keep a small back link under the form */}
            <div className="adsg-foot" style={{ marginTop: 12 }}>
              <span className="adsg-spacer" />
              <Link to="/register" className="adsg-link adsg-link--arrow">
                Back to student/supervisor sign up
              </Link>
            </div>
          </form>
        </section>

        {/* RIGHT: CTA panel + illustration (mirrors student page) */}
        <aside className="adsg-right" aria-label="Already have an account">
          <h3 className="adsg-right-title">Already have an account?</h3>
          <p className="adsg-right-text">
            Welcome back! You can sign into your account and discover the projects!
          </p>

          <Link to="/admin-login" className="adsg-cta">
            Sign In
          </Link>

          {/* Illustration is optional; safe if the file doesn't exist */}
          <div className="adsg-illu-wrap">
            <img
              className="adsg-illu"
              src="/assets/create_account_illustration.svg"
              alt=""
              loading="lazy"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
