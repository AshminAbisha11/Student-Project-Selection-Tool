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

      if (res.data && res.data.user) {
        const { user_id, role } = res.data.user;
        const token = res.data.token;

        localStorage.setItem('studentId', res.data.user.user_id); 
        localStorage.setItem('role', res.data.user.role);
        localStorage.setItem('token', res.data.token);

        setSuccess(res.data.message || 'Login successful');
        console.log('Login success:', res.data);

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

  return (
    <div className="login-container">
      <div className="login-header">
        Aston University Project Portal
      </div>

      <div className="login-body">
        {/* Left */}
        <div className="login-left">
          <img src="/assets/aston_logo.png" alt="Aston University" className="aston-logo" />
          <h2 className="signin-heading">Log in to your account</h2>

          <form onSubmit={handleSubmit}>
            <label>Email Address:</label>
            <input
              type="email"
              name="email"
              placeholder="you@aston.ac.uk"
              value={formData.email}
              onChange={handleChange}
            />

            <label>Password:</label>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
            />

            <p className="forgot-text">Forgot password? click here.</p>

            <div className="button-group">
              <button type="submit" className="login-btn">Login</button>
              <button type="button" className="admin-btn">Admin Sign in</button>
            </div>

            {error && <p className="error-msg">{error}</p>}
            {success && <p className="success-msg">{success}</p>}
          </form>
        </div>

        {/* Right */}
        <div className="login-right">
          <h3>New to the Project Portal?</h3>
          <p>
            Create your account to browse projects, submit your preferences, or propose your own!
          </p>
          <button className="create-account-btn" onClick={handleCreateAccount}>
            Create Account
          </button>
          <img src="/assets/login_illustration.png" alt="Illustration" />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
