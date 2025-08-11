import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './registerPage.css';

const API_BASE = 'http://localhost:5000'; // change if needed

const RegisterPage = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    programme: '',
    role: '', // "student" | "supervisor"
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isStudent = formData.role?.toLowerCase() === 'student';
  const isSupervisor = formData.role?.toLowerCase() === 'supervisor';

  // client-side helpers
  const emailOk = (email) =>
    /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());

  const passwordStrong = (pw) =>
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#\$%\^&\*]).{8,}$/.test(pw);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setErrorMsg('');
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (e) => {
    const value = e.target.value;
    setErrorMsg('');
    setFormData((prev) => ({
      ...prev,
      role: value,
      programme: value.toLowerCase() === 'supervisor' ? '' : prev.programme, // clear programme if supervisor
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return; // guard against rapid double-clicks
    setErrorMsg('');

    const payload = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      role: formData.role.trim(),
      programme: isStudent ? formData.programme : null, // only for students
    };

    // basic validations (server will re-validate)
    if (!payload.name || !payload.email || !payload.password || !payload.confirmPassword || !payload.role) {
      setErrorMsg('Please fill out all required fields.');
      return;
    }
    if (!emailOk(payload.email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!passwordStrong(payload.password)) {
      setErrorMsg(
        'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
      );
      return;
    }
    if (payload.password !== payload.confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (isStudent && !payload.programme) {
      setErrorMsg('Please select your programme.');
      return;
    }

    try {
      setSubmitting(true);
      await axios.post(`${API_BASE}/signup`, payload);

      // Navigate by role (or to /login if you prefer)
      const role = payload.role.toLowerCase();
      if (role === 'student') navigate('/student-dashboard');
      else if (role === 'supervisor') navigate('/supervisor-dashboard');
      else navigate('/login');
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed. Please try again.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignInClick = () => navigate('/login');
  const goAdminSignup = () => navigate('/admin-signup'); // if you have this route

  return (
    <div
      className="register-container"
      style={{
        backgroundImage: "url('/assets/login_background.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="register-box">
        <div className="register-left">
          <div className="header">
            <img src="/assets/aston_logo.png" alt="Aston University" className="aston-logo" />
            <h1 className="portal-title">Aston University Project Portal</h1>
          </div>

          <h2 className="create-title">Create an account</h2>

          {errorMsg && <div className="form-error">{errorMsg}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="name">Full Name:</label>
            <input
              id="name"
              type="text"
              name="name"
              placeholder="Full Name"
              value={formData.name}
              onChange={handleChange}
              required
              autoComplete="name"
              disabled={submitting}
            />

            <label htmlFor="email">Email:</label>
            <input
              id="email"
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              autoComplete="email"
              disabled={submitting}
            />
            <small className="hint">We accept Gmail and aston.ac.uk emails.</small>

            <label htmlFor="password">Password:</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              required
              autoComplete="new-password"
              disabled={submitting}
            />
            <small className="hint">
              Use at least 8 chars with upper, lower, number, and a special character.
            </small>

            <label htmlFor="confirmPassword">Confirm Password:</label>
            <input
              id="confirmPassword"
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              autoComplete="new-password"
              disabled={submitting}
            />

            <label htmlFor="role">Role:</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleRoleChange}
              required
              disabled={submitting}
            >
              <option value="">Select Role</option>
              <option value="student">Student</option>
              <option value="supervisor">Supervisor</option>
            </select>

            {isStudent && (
              <>
                <label htmlFor="programme">Programme:</label>
                <select
                  id="programme"
                  name="programme"
                  value={formData.programme}
                  onChange={handleChange}
                  required
                  disabled={submitting}
                >
                  <option value="">Select Programme</option>
                  <option value="MSc Computer Science">MSc Computer Science</option>
                  <option value="MSc Artificial Intelligence">MSc Artificial Intelligence</option>
                  <option value="MSc Data Science">MSc Data Science</option>
                  <option value="AI with Business Strategy">AI with Business Strategy</option>
                </select>
              </>
            )}

            <div className="button-group">
              <button type="submit" className="register-btn" disabled={submitting}>
                {submitting ? 'Registering…' : 'Register'}
              </button>
              <button type="button" className="admin-btn" onClick={goAdminSignup} disabled={submitting}>
                Admin Sign up
              </button>
            </div>
          </form>
        </div>

        <div className="register-right">
          <h3>Already have an account?</h3>
          <p>Welcome back! You can sign into your account and discover the projects!</p>
          <button className="signin-btn" onClick={handleSignInClick} disabled={submitting}>
            Sign In
          </button>
          <img src="/assets/login_illustration.png" alt="Illustration" className="right-image" />
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
