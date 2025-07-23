import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './registerPage.css';

const RegisterPage = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    programme: '',
    role: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(`Changed ${name}:`, value); // Log each change
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log('Form data before submission:', formData); // Log entire form data

    // Validate password match
    if (formData.password !== formData.confirmPassword) {
      alert("Passwords do not match");
      console.warn("Password mismatch");
      return;
    }

    try {
      const response = await axios.post('http://localhost:5000/signup', formData);
      console.log('Registration successful:', response.data);

      // Navigate based on role
      if (formData.role === 'student') {
        navigate('/student-dashboard');
      } else if (formData.role === 'supervisor') {
        navigate('/supervisor-dashboard');
      } else {
        navigate('/login'); // fallback
      }
    } catch (error) {
      console.error('Registration failed:', error.response?.data || error.message);
      alert(error.response?.data?.message || "Registration failed");
    }
  };

  const handleSignInClick = () => {
    console.log("Navigating to login");
    navigate('/login');
  };

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
          <form onSubmit={handleSubmit}>
            <label htmlFor="name">Full Name:</label>
            <input
              type="text"
              name="name"
              placeholder="Full Name"
              onChange={handleChange}
              required
            />

            <label htmlFor="email">Email:</label>
            <input
              type="email"
              name="email"
              placeholder="Email"
              onChange={handleChange}
              required
            />

            <label htmlFor="password">Password:</label>
            <input
              type="password"
              name="password"
              placeholder="Password"
              onChange={handleChange}
              required
            />

            <label htmlFor="confirmPassword">Confirm Password:</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              onChange={handleChange}
              required
            />

            <label htmlFor="programme">Programme:</label>
            <select name="programme" onChange={handleChange} required>
              <option value="">Select Programme</option>
              <option value="MSc Computer Science">MSc Computer Science</option>
              <option value="MSc Artificial Intelligence">MSc Artificial Intelligence</option>
              <option value="MSc Data Science">MSc Data Science</option>
              <option value="AI with Business Strategy">AI with Business Strategy</option>
            </select>

            <label htmlFor="role">Role:</label>
            <select name="role" onChange={handleChange} required>
              <option value="">Select Role</option>
              <option value="student">Student</option>
              <option value="supervisor">Supervisor</option>
            </select>

            <div className="button-group">
              <button type="submit" className="register-btn">Register</button>
              <button type="button" className="admin-btn">Admin Sign up</button>
            </div>
          </form>
        </div>

        <div className="register-right">
          <h3>Already have an account?</h3>
          <p>Welcome back! You can sign into your account and discover the projects!</p>
          <button className="signin-btn" onClick={handleSignInClick}>Sign In</button>
          <img src="/assets/login_illustration.png" alt="Illustration" className="right-image" />
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
