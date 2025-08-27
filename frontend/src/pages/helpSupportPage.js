import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './helpSupportPage.css';
import axios from 'axios';

const HelpSupportPage = () => {
  const navigate = useNavigate();

  const [feedback, setFeedback] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const goBack = () => {
    // Prefer going back if we have history; else go to the student dashboard
    if (window.history && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/student-dashboard');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim()) {
      setMessage('Please enter a valid message.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await axios.post('http://localhost:5000/feedback', {
        message: feedback.trim(),
      });
      setMessage(res.data?.message || 'Thank you for your feedback!');
      setFeedback('');
    } catch (error) {
      setMessage('Failed to submit feedback. Please try again later.');
      console.error('Feedback submission error:', error);
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
            {/* simple arrow, feel free to swap with an icon */}
            <span aria-hidden="true">←</span> Back
          </button>
          <h2 className="help-title">Help &amp; Support</h2>
          {/* spacer to balance flex; keeps title centered */}
          <span style={{ width: 72 }} aria-hidden="true" />
        </div>

        <section className="help-section">
          <h3>Frequently Asked Questions</h3>
          <ul className="help-list">
            <li>
              <strong>1. How do I reset my password?</strong><br />
              Go to the <em>Forgot Password</em> page and enter your university email.
            </li>
            <li>
              <strong>2. How can I update my preferences?</strong><br />
              Use the <em>My Preferences</em> section on the dashboard.
            </li>
            <li>
              <strong>3. What if a project I want is already full?</strong><br />
              You can still select it in your preferences. Allocation is based on quota and timing.
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

export default HelpSupportPage;
