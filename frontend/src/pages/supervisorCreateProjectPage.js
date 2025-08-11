import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HeaderBar from '../components/headerBar';
import SideBar from '../components/sideBar';
import './supervisorCreateProjectPage.css';

const API = 'http://localhost:5000';

const initialForm = {
  title: '',
  topic: '',
  description: '',
  full_description: '',
  prerequisites: '',
  quota: '',
};

export default function SupervisorCreateProjectPage() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const onChange = (e) => {
    const { name, value } = e.target;
    setError('');
    setForm((f) => ({ ...f, [name]: value }));
  };

  const validate = () => {
    if (!form.title.trim()) return 'Title is required.';
    if (!form.topic.trim()) return 'Topic is required.';
    if (!form.description.trim()) return 'Short description is required.';
    if (!form.full_description.trim()) return 'Full description is required.';
    if (!form.quota || isNaN(Number(form.quota)) || Number(form.quota) < 1)
      return 'Quota must be a number ≥ 1.';
    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const msg = validate();
    if (msg) return setError(msg);

    const token = localStorage.getItem('token');
    if (!token) return setError('Please log in as a supervisor.');

    try {
      setSubmitting(true);
      const res = await fetch(`${API}/projects/create-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          topic: form.topic.trim(),
          description: form.description.trim(),
          full_description: form.full_description.trim(),
          prerequisites: form.prerequisites.trim(),
          quota: Number(form.quota),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create project');
      }

      // success UX
      alert('Project created successfully!');
      // go to supervisor dashboard (or a "My Projects" page if you have one)
      navigate('/supervisor-dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="createproj-layout">
      <SideBar />
      <main className="createproj-main">
        <HeaderBar />

        <div className="createproj-inner">
          <div className="createproj-header">
            <h2>Create a New Project</h2>
          </div>

          {error && <div className="cp-alert">{error}</div>}

          <form className="cp-form" onSubmit={onSubmit} noValidate>
            <div className="cp-row">
              <div className="cp-field">
                <label>Title <span>*</span></label>
                <input
                  name="title"
                  value={form.title}
                  onChange={onChange}
                  placeholder="e.g., NLP for Healthcare Notes"
                  disabled={submitting}
                />
              </div>

              <div className="cp-field">
                <label>Topic <span>*</span></label>
                <select
                  name="topic"
                  value={form.topic}
                  onChange={onChange}
                  disabled={submitting}
                >
                  <option value="">Select topic</option>
                  <option>Artificial Intelligence</option>
                  <option>Data Science</option>
                  <option>Cybersecurity</option>
                  <option>Human-Computer Interaction</option>
                  <option>Software Engineering</option>
                  <option>Other</option>
                </select>
              </div>
            </div>

            <div className="cp-field">
              <label>Short Description <span>*</span></label>
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
              <label>Full Description <span>*</span></label>
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
                <label>Quota <span>*</span></label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  name="quota"
                  value={form.quota}
                  onChange={onChange}
                  placeholder="e.g., 2"
                  disabled={submitting}
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

              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
