import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './loginPage.css';
import axios from 'axios';

const LoginPage = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.email || !formData.password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      const res = await axios.post('http://localhost:5000/login', formData);

      if (res.data && res.data.user && res.data.token) {
        const { user, token } = res.data;

        // Store full user info (name, id, email, role)
        localStorage.setItem('student', JSON.stringify(user));
        localStorage.setItem('token', token);

        setSuccess(res.data.message || 'Login successful');
        console.log('Login success:', res.data);

        // ✅ Navigate to dashboard
        navigate('/student-dashboard');
      } else {
        setError('Invalid response from server.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  const handleCreateAccount = () => {
    navigate('/register');
  };

  const handleForgotPassword = () => {
    navigate('/forgot-password');
  };

  return (
    <div
      className="login-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <div className="login-box">
        {/* Left Panel */}
        <div className="login-left">
          <div className="header-title">
            <img src="/assets/aston_logo.png" alt="Aston University Logo" className="logo" />
            <h1 className="tool-title">Student Project Selection Portal</h1>
          </div>

          <h2 className="login-heading">Log in to your account</h2>

          <form onSubmit={handleSubmit} className="login-form">
            <input
              type="email"
              name="email"
              placeholder="you@aston.ac.uk"
              value={formData.email}
              onChange={handleChange}
            />

            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
            />

            <p className="forgot-password" onClick={handleForgotPassword}>
              Forgot password?
            </p>

            <button type="submit" className="login-button">Login</button>
          </form>

          {error && <p className="error-msg">{error}</p>}
          {success && <p className="success-msg">{success}</p>}
        </div>

        {/* Right Panel */}
        <div className="login-right">
          <h3>New to the Project Portal?</h3>
          <p>
            Create your account to browse projects, submit your preferences, or propose your own!
          </p>
          <button className="login-button" onClick={handleCreateAccount}>
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
