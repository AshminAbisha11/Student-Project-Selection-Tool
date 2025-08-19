import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HeaderBar from '../components/headerBar';
import SideBar from '../components/sideBar';
import './supervisorCreateProjectPage.css';

const API = 'http://localhost:5000';
const STUDENT_IDEA_TOPIC = 'Student Proposal Ideas';

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

  // If they pick "Student Proposal Ideas" and the title is blank, auto-suggest a sensible title
  useEffect(() => {
    if (form.topic === STUDENT_IDEA_TOPIC && !form.title.trim()) {
      setForm((f) => ({ ...f, title: 'Student Proposed Ideas' }));
    }
  }, [form.topic]); // eslint-disable-line react-hooks/exhaustive-deps

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
          topic: form.topic.trim(), // backend uses this to toggle is_student_pool/cycle_id
          description: form.description.trim(),
          full_description: form.full_description.trim(),
          prerequisites: form.prerequisites.trim(),
          quota: Number(form.quota),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Friendly message when there is no active allocation cycle
        if (res.status === 409) {
          throw new Error(
            data.message ||
              'No active allocation cycle. Ask the admin to open a cycle before enabling Student Proposal Ideas.'
          );
        }
        throw new Error(data.message || 'Failed to create project');
      }

      alert('Project created successfully!');
      navigate('/supervisor-dashboard'); // or /supervisor/my-projects
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isStudentIdea = form.topic === STUDENT_IDEA_TOPIC;

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
                <strong>Student Proposal Ideas</strong> is an opt-in pool. Your{' '}
                <em>Quota</em> below is the number of student ideas you’re willing to take
                this cycle. An active allocation cycle is required.
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
