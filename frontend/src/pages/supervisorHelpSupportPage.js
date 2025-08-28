// src/pages/supervisorHelpSupportPage.jsx
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './helpSupportPage.css'; // Reuse the SAME CSS as the student page

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const SupervisorHelpSupportPage = () => {
  const navigate = useNavigate();

  const token = useMemo(() => localStorage.getItem('token'), []);
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const [feedback, setFeedback] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goBack = () => {
    if (window.history && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/supervisor-dashboard');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = feedback.trim();
    if (!body) {
      setMessage('Please enter a valid message.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    try {
      const res = await axios.post(
        `${API}/feedback`,
        { message: body, role: 'supervisor' }, // role is optional; include if your BE stores it
        { headers: { 'Content-Type': 'application/json', ...authHeaders } }
      );
      setMessage(res.data?.message || 'Thank you for your feedback!');
      setFeedback('');
    } catch (error) {
      // Graceful fallback to email if API not available
      window.location.href =
        `mailto:support@aston.ac.uk?subject=Supervisor%20Portal%20Feedback&body=${encodeURIComponent(body)}`;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="help-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <div className="help-card">
        <div className="help-header">
          <button className="help-back" onClick={goBack} aria-label="Back to dashboard">
            <span aria-hidden="true">←</span> Back
          </button>
          <h2 className="help-title">Help &amp; Support (Supervisors)</h2>
          {/* spacer to balance flex; keeps title centered */}
          <span style={{ width: 72 }} aria-hidden="true" />
        </div>

        <section className="help-section">
          <h3>Frequently Asked Questions</h3>
          <ul className="help-list">
            <li>
              <strong>1. How do I create a new project?</strong><br />
              Go to <em>My Projects</em> → <em>Add New Project</em>. Fill in title, short/long descriptions,
              expected skills, and quota. Projects may require admin approval before students can see them.
            </li>
            <li>
              <strong>2. Why is my project not visible to students?</strong><br />
              Projects that are <em>pending approval</em> or <em>archived</em> won’t appear in Browse Projects.
              Check the project’s status in <em>My Projects</em>.
            </li>
            <li>
              <strong>3. How do quotas and seats work?</strong><br />
              Each project has a <em>quota</em>. The system prevents allocations beyond the quota.
              You can update the quota in <em>My Projects</em> while the cycle is open.
            </li>
            <li>
              <strong>4. How do I review student proposals?</strong><br />
              Open <em>Received Proposals</em> from the sidebar. You can mark proposals as
              <em>accepted</em>, <em>under review</em>, or <em>rejected</em>. Accepting a student idea may allocate
              them into your student-idea pool project (if configured).
            </li>
            <li>
              <strong>5. Can I edit or archive projects?</strong><br />
              Yes. In <em>My Projects</em> choose a project → <em>Edit</em> or <em>Archive</em>.
              Archiving hides it from students but keeps historical records.
            </li>
            <li>
              <strong>6. What is an allocation cycle?</strong><br />
              Cycles define submission windows and timelines. The dashboard shows whether a cycle is
              <em>open</em> or <em>closed</em>. Some actions are only available while open.
            </li>
            <li>
              <strong>7. Where do I see my allocated students?</strong><br />
              Go to <em>Allocated Students</em> for confirmed allocations, contact details, and current status.
            </li>
            <li>
              <strong>8. Can I export my projects/allocations?</strong><br />
              Use the export button in <em>My Projects</em> or <em>Allocated Students</em> if available.
              For custom reports, contact support.
            </li>
            <li>
              <strong>9. Data &amp; privacy</strong><br />
              Please avoid uploading sensitive information. Handle student data in line with university policies.
            </li>
          </ul>
        </section>

        <section className="help-section">
          <h3>Contact Information</h3>
          <p>If you need further assistance, please contact us:</p>
          <ul className="help-contact">
            <li>
              <strong>Email:</strong>{' '}
              <a href="mailto:support@aston.ac.uk">support@aston.ac.uk</a>
            </li>
            <li><strong>Phone:</strong> +44 121 204 3000</li>
            <li><strong>Office Hours:</strong> Mon–Fri, 9:00 AM – 5:00 PM</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>Send us Feedback</h3>
          <form className="feedback-form" onSubmit={handleSubmit}>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Your message or feedback..."
              rows={4}
              required
            />
            <div className="feedback-actions">
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Submit'}
              </button>
              {message && <p className="feedback-status">{message}</p>}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default SupervisorHelpSupportPage;
