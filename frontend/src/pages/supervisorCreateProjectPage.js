// src/pages/SupervisorCreateProjectPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SupervisorHeader from '../components/supervisorHeader';
import SupervisorNav from '../components/supervisorNav';
import './supervisorCreateProjectPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const STUDENT_IDEA_TOPIC = 'Student Proposal Ideas';

const initialForm = {
  title: '',
  topic: '',
  description: '',
  full_description: '',
  prerequisites: '',
  quota: '',
};

/* ---------- tiny util ---------- */
const isStudentPoolTopic = (t) =>
  String(t || '').trim().toLowerCase() === STUDENT_IDEA_TOPIC.toLowerCase();

/* Fixed, full-bleed background rendered in JS */
function SupervisorBg({ src = '/assets/login_background.png' }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        background:
          'radial-gradient(1200px 800px at -10% -10%, rgba(123,44,191,.16), transparent 60%),' +
          'radial-gradient(1000px 700px at 110% 110%, rgba(106,76,255,.14), transparent 55%),' +
          `url("${src}") center / cover no-repeat,` +
          'linear-gradient(180deg, #f7f3ff 0%, #faf9ff 100%)',
      }}
    />
  );
}

/** Unified API helper with auth + 401/403 handling */
async function apiFetch(path, opts = {}, navigate) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    try { navigate('/login', { replace: true }); } catch {}
    let data = {};
    try { data = await res.json(); } catch {}
    throw new Error(data?.message || 'Your session has expired. Please log in again.');
  }

  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.message || 'Request failed');
  return data;
}

export default function SupervisorCreateProjectPage() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const user  = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null'); }
    catch { return null; }
  }, []);

  // Gate: must be logged in and be a supervisor
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (String(user.role || '').toLowerCase() !== 'supervisor') {
      navigate('/student-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setError('');
    setForm((f) => ({ ...f, [name]: value }));
  };

  // Auto-suggest title if Student Proposal pool is selected and title is blank
  useEffect(() => {
    if (isStudentPoolTopic(form.topic) && !form.title.trim()) {
      setForm((f) => ({ ...f, title: 'Student Proposed Ideas' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.topic]);

  const validate = () => {
    if (!form.title.trim()) return 'Title is required.';
    if (!form.topic.trim()) return 'Topic is required.';
    if (!form.description.trim()) return 'Short description is required.';
    if (!form.full_description.trim()) return 'Full description is required.';
    const q = Number(form.quota);
    if (!Number.isInteger(q) || q < 1) return 'Quota must be a whole number ≥ 1.';
    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const msg = validate();
    if (msg) return setError(msg);

    try {
      setSubmitting(true);

      // POST /projects/create-project (backend will attach to active cycle if present; otherwise create a draft)
      const payload = {
        title: form.title.trim(),
        topic: form.topic.trim(),   // backend toggles student-idea pool via topic
        description: form.description.trim(),
        full_description: form.full_description.trim(),
        prerequisites: form.prerequisites.trim(),
        quota: Number(form.quota),
      };

      const data = await apiFetch('/projects/create-project', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, navigate);

      // The backend sends a helpful message about draft vs active
      alert(data?.message || 'Project created successfully.');
      navigate('/supervisor/my-projects');
    } catch (err) {
      // If no active cycle and topic is student-pool, show clearer guidance
      const isPool = isStudentPoolTopic(form.topic);
      const friendly =
        isPool && /no active|active cycle|cycle/i.test(err.message || '')
          ? 'No active allocation cycle. Ask the admin to open a cycle before enabling Student Proposal Ideas.'
          : err.message || 'Failed to create project';
      setError(friendly);
    } finally {
      setSubmitting(false);
    }
  };

  const isStudentIdea = isStudentPoolTopic(form.topic);

  return (
    <div className="sv-layout">
      {/* JS background layer */}
      <SupervisorBg src="/assets/login_background.png" />

      {/* Fixed sidebar + header from your components */}
      <SupervisorNav />
      <SupervisorHeader />

      <main className="sv-main">
        <section className="createproj-panel">
          <div className="createproj-inner">
            <div className="createproj-header">
              <h2>Create a New Project</h2>
            </div>

            {error && <div className="cp-alert">{error}</div>}

            <form className="cp-form" onSubmit={onSubmit} noValidate>
              <div className="cp-row">
                <div className="cp-field">
                  <label>
                    Title <span>*</span>
                  </label>
                  <input
                    name="title"
                    value={form.title}
                    onChange={onChange}
                    placeholder="e.g., NLP for Healthcare Notes"
                    disabled={submitting}
                  />
                </div>

                <div className="cp-field">
                  <label>
                    Topic <span>*</span>
                  </label>
                  <select
                    name="topic"
                    value={form.topic}
                    onChange={onChange}
                    disabled={submitting}
                  >
                    <option value="">Select topic</option>
                    <option>{STUDENT_IDEA_TOPIC}</option>
                    <option>Artificial Intelligence</option>
                    <option>Data Science</option>
                    <option>Cybersecurity</option>
                    <option>Human-Computer Interaction</option>
                    <option>Software Engineering</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              {/* Guidance panel when Student Proposal Ideas is selected */}
              {isStudentIdea && (
                <div
                  className="cp-note"
                  style={{
                    background: '#f5f7ff',
                    border: '1px solid #dfe4ff',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginTop: 8,
                    color: '#2a2d55',
                  }}
                >
                  <strong>Student Proposal Ideas</strong> is an opt-in pool. Your <em>Quota</em>{' '}
                  below is the number of student ideas you’re willing to take this cycle.
                  An active allocation cycle is required for this to be visible to students.
                </div>
              )}

              <div className="cp-field">
                <label>
                  Short Description <span>*</span>
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={onChange}
                  rows={3}
                  placeholder="One paragraph overview shown in listings"
                  disabled={submitting}
                />
              </div>

              <div className="cp-field">
                <label>
                  Full Description <span>*</span>
                </label>
                <textarea
                  name="full_description"
                  value={form.full_description}
                  onChange={onChange}
                  rows={6}
                  placeholder="Detailed description that appears in the modal"
                  disabled={submitting}
                />
              </div>

              <div className="cp-row">
                <div className="cp-field">
                  <label>Prerequisites</label>
                  <textarea
                    name="prerequisites"
                    value={form.prerequisites}
                    onChange={onChange}
                    rows={3}
                    placeholder="e.g., Python, ML basics"
                    disabled={submitting}
                  />
                </div>

                <div className="cp-field">
                  <label>
                    Quota <span>*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    name="quota"
                    value={form.quota}
                    onChange={onChange}
                    placeholder="e.g., 2"
                    disabled={submitting}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="cp-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setForm(initialForm)}
                  disabled={submitting}
                >
                  Clear
                </button>

                <button
                  type="button"
                  className="btn btn-archive"
                  onClick={() => navigate('/supervisor/my-projects')}
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
