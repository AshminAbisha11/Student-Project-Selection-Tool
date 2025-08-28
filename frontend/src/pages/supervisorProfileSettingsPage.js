import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import SupervisorNav from '../components/supervisorNav';
import ProfileDropdown from '../components/profileDropdown';
import './supervisorProfileSettingsPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function parseJwt(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

export default function ProfileSettingsPage() {
  const navigate = useNavigate();

  // token + auth header (memoized)
  const token = useMemo(() => localStorage.getItem('token'), []);
  const auth = useMemo(() => token ? { Authorization: `Bearer ${token}` } : {}, [token]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [savedAt, setSavedAt] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    department: '',
    phone: '',
    office: '',
    bio: '',
  });
  const [initial, setInitial] = useState(form);

  // ---------- Load profile ----------
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError('');

        if (!token) {
          setError('Not authenticated. Please log in again.');
          navigate('/login', { replace: true });
          return;
        }

        const { data } = await axios.get(`${API}/users/me`, {
          headers: auth,
          signal: controller.signal,
        });

        if (!alive) return;

        const next = {
          name:        data?.name ?? '',
          email:       data?.email ?? (parseJwt(token)?.email || ''),
          department:  data?.department ?? '',
          phone:       data?.phone ?? '',
          office:      data?.office ?? '',
          bio:         data?.bio ?? '',
        };

        setForm(next);
        setInitial(next);
      } catch (e) {
        if (!alive) return;
        const msg = e?.response?.data?.message
          || (e?.response?.status === 401 ? 'Session expired. Please log in again.' : 'Failed to load profile');
        setError(msg);
        if (e?.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login', { replace: true });
        } else {
          // Fall back to token payload so user can still see their name/email
          const payload = parseJwt(token);
          const fallback = {
            name: payload?.name || '',
            email: payload?.email || '',
            department: '',
            phone: '',
            office: '',
            bio: '',
          };
          setForm(fallback);
          setInitial(fallback);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate]);

  // ---------- Derived state ----------
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initial),
    [form, initial]
  );

  // ---------- Handlers ----------
  const onChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!form.name.trim()) return 'Name is required';
    if (form.phone && !/^[\d+\-\s()]{6,20}$/.test(form.phone)) return 'Phone looks invalid';
    return '';
  };

  const buildPayload = () => {
    // send only changed fields, but always include name (backend often requires it)
    const payload = {};
    ['name','department','phone','office','bio'].forEach(k => {
      if (form[k] !== initial[k]) payload[k] = form[k] || null;
    });
    if (!('name' in payload)) payload.name = form.name; // ensure name is present
    return payload;
  };

  const onSave = async () => {
    const v = validate();
    if (v) { setError(v); return; }

    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      const { data } = await axios.put(`${API}/users/me`, payload, {
        headers: { ...auth, 'Content-Type': 'application/json' },
      });

      // Prefer the server’s echo for canonical values (trims, etc.)
      const next = {
        name:        data?.name ?? form.name,
        email:       data?.email ?? form.email,
        department:  data?.department ?? form.department,
        phone:       data?.phone ?? form.phone,
        office:      data?.office ?? form.office,
        bio:         data?.bio ?? form.bio,
      };

      setForm(next);
      setInitial(next);
      setSavedAt(new Date().toISOString());
    } catch (e) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => setForm(initial);

  // ---------- UI ----------
  return (
    <div
      className="dashboard-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <SupervisorNav />
      <main className="dashboard-main">
        <header className="dashboard-header">
          <h2>Profile Settings</h2>
          <ProfileDropdown />
        </header>

        {loading ? (
          <div className="ps-skel">Loading profile…</div>
        ) : (
          <div className="ps-wrap">
            {error && <div className="ps-alert">{error}</div>}
            {savedAt && !error && (
              <div className="ps-success">
                Saved • {new Date(savedAt).toLocaleString()}
              </div>
            )}

            <div className="ps-grid">
              <div className="ps-card">
                <h4>Basic Info</h4>

                <div className="ps-field">
                  <label htmlFor="name">Full Name</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={onChange}
                    placeholder="Your full name"
                  />
                </div>

                <div className="ps-field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={form.email}
                    readOnly
                    className="read-only"
                    title="Email is managed by the university"
                  />
                  <small className="muted">Email is read-only.</small>
                </div>

                <div className="ps-field">
                  <label htmlFor="department">Department</label>
                  <input
                    id="department"
                    name="department"
                    type="text"
                    value={form.department}
                    onChange={onChange}
                    placeholder="e.g., Computer Science"
                  />
                </div>
              </div>

              <div className="ps-card">
                <h4>Contact & Office</h4>

                <div className="ps-field">
                  <label htmlFor="phone">Phone</label>
                  <input
                    id="phone"
                    name="phone"
                    type="text"
                    value={form.phone}
                    onChange={onChange}
                    placeholder="+44 1234 567890"
                  />
                </div>

                <div className="ps-field">
                  <label htmlFor="office">Office Location</label>
                  <input
                    id="office"
                    name="office"
                    type="text"
                    value={form.office}
                    onChange={onChange}
                    placeholder="Main Building, Room 3.12"
                  />
                </div>

                <div className="ps-field">
                  <label htmlFor="bio">Bio / Notes</label>
                  <textarea
                    id="bio"
                    name="bio"
                    rows={5}
                    value={form.bio}
                    onChange={onChange}
                    placeholder="Brief profile or supervision interests…"
                  />
                </div>
              </div>
            </div>

            <div className="ps-actions">
              <button
                className="btn btn-outline"
                onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/supervisor-dashboard'))}
                title="Go back"
              >
                ← Back
              </button>

              <button
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={!dirty || saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={onSave}
                disabled={!dirty || saving}
                title={!dirty ? 'No changes to save' : 'Save changes'}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
