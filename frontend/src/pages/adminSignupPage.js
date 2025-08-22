import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './adminSignupPage.css';

const API = 'http://localhost:5000';

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

  const update = (k) => (e) => setForm(v => ({ ...v, [k]: e.target.value }));

  const pwStrength = useMemo(() => {
    const p = form.password;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[a-z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 2) return { label: 'Weak', level: 1 };
    if (score === 3) return { label: 'Okay', level: 2 };
    if (score === 4) return { label: 'Good', level: 3 };
    return { label: 'Strong', level: 4 };
  }, [form.password]);

  const canSubmit = useMemo(() => {
    if (!form.name.trim() || !form.email.trim()) return false;
    if (form.password.length < 8) return false;
    if (form.password !== form.confirm) return false;
    return true;
  }, [form]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setErr('');
    setOkMsg('');
    try {
      const res = await fetch(`${API}/admin-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          inviteCode: form.inviteCode.trim() || null
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
      if (user) {
        localStorage.setItem('user_name', user.name || '');
        localStorage.setItem('user_email', user.email || '');
      }
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
      style={{ backgroundImage: "url('/assets/login_background.png')" }}  // <-- same background
    >
      <div className="adsg-overlay" />
      <div className="adsg-card">
        <h1 className="adsg-title">Create Admin Account</h1>
        <p className="adsg-sub">Use your Aston or Gmail email. Invite code required.</p>

        {err && <div className="adsg-alert adsg-alert--error">{err}</div>}
        {okMsg && <div className="adsg-alert adsg-alert--ok">{okMsg}</div>}

        <form className="adsg-form" onSubmit={submit}>
          <label>Full Name
            <input type="text" value={form.name} onChange={update('name')} placeholder="Jane Admin" autoComplete="name" required />
          </label>

          <label>Email
            <input type="email" value={form.email} onChange={update('email')} placeholder="you@aston.ac.uk or you@gmail.com" autoComplete="email" required />
          </label>

          <div className="adsg-row">
            <label>Password
              <div className="adsg-input-wrap">
                <input type={showPw ? 'text' : 'password'} value={form.password} onChange={update('password')} placeholder="Minimum 8 characters" autoComplete="new-password" required />
                <button type="button" className="adsg-eye" onClick={() => setShowPw(s => !s)}>{showPw ? 'Hide' : 'Show'}</button>
              </div>
              <div className={`adsg-meter adsg-meter--${pwStrength.level}`}><span>{pwStrength.label}</span></div>
            </label>

            <label>Confirm Password
              <div className="adsg-input-wrap">
                <input type={showPw2 ? 'text' : 'password'} value={form.confirm} onChange={update('confirm')} placeholder="Repeat password" autoComplete="new-password" required />
                <button type="button" className="adsg-eye" onClick={() => setShowPw2(s => !s)}>{showPw2 ? 'Hide' : 'Show'}</button>
              </div>
              {form.confirm && form.confirm !== form.password && (<small className="adsg-warn">Passwords do not match</small>)}
            </label>
          </div>

          <label>Invite code (if provided)
            <input type="text" value={form.inviteCode} onChange={update('inviteCode')} placeholder="e.g. ASTON-ADMIN-ABCD-EFGH-IJKL" spellCheck="false" />
          </label>

          <button className="adsg-btn" type="submit" disabled={loading || !canSubmit}>
            {loading ? 'Creating…' : 'Create admin account'}
          </button>
        </form>

        <div className="adsg-foot">
          <Link to="/login" className="adsg-link">Already have an account? Login</Link>
          <Link to="/register" className="adsg-link">Back to student/supervisor sign up</Link>
        </div>
      </div>
    </div>
  );
}
