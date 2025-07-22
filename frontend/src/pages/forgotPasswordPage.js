import React, { useState } from 'react';
import axios from 'axios';
import './forgotPasswordPage.css';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (!email) {
      setError('Please enter your Aston email.');
      return;
    }

    try {
      const res = await axios.post('http://localhost:5000/forgot-password', { email });
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.');
    }
  };

  return (
     <div
      className="forgot-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
     >
      <div className="forgot-box">
        <h2>Forgot Password</h2>
        <p>Please enter your Aston University email to receive a password reset link.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="you@aston.ac.uk"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit">Send Reset Link</button>
        </form>

        {message && <p className="success-msg">{message}</p>}
        {error && <p className="error-msg">{error}</p>}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
