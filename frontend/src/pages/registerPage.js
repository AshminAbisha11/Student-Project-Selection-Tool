import React, { useState } from 'react';
import axios from 'axios';
import './registerPage.css';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    programme: '',
    role: ''
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
  
    try {
      const response = await axios.post("http://localhost:5000/signup", formData);
      console.log("Registration successful:", response.data);
    } catch (error) {
      console.error("Registration failed:", error.response?.data || error.message);
    }
  };
  
  return (
    <div className="register-container">
      <div className="register-form">
        <h2>Create an account</h2>
        <form onSubmit={handleSubmit}>
          <input type="text" name="fullName" placeholder="Full Name" onChange={handleChange} />
          <input type="email" name="email" placeholder="Email" onChange={handleChange} />
          <input type="password" name="password" placeholder="Password" onChange={handleChange} />
          <input type="password" name="confirmPassword" placeholder="Confirm Password" onChange={handleChange} />
          <input type="text" name="programme" placeholder="Programme" onChange={handleChange} />
          <select name="role" onChange={handleChange}>
            <option value="">Select Role</option>
            <option value="student">Student</option>
            <option value="supervisor">Supervisor</option>
          </select>
          <button type="submit">Register</button>
        </form>
      </div>

      <div className="register-side">
        <h3>Already have an account?</h3>
        <p>Welcome back! You can sign into your account and discover the projects.</p>
        <button className="signin-btn">Sign In</button>
      </div>
    </div>
  );
};

export default RegisterPage;
