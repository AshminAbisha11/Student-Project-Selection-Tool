import React, { useState } from 'react';
import './changePasswordPage.css';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const ChangePassword = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(
        'http://localhost:5000/change-password',
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage(res.data.message + ' Redirecting to login...');
      setCurrentPassword('');
      setNewPassword('');
      setSuccess(true);

      setTimeout(() => {
        localStorage.clear();
        navigate('/login');
      }, 3000);
    } catch (err) {
      setMessage((err.response?.data?.message || 'Failed to change password'));
      setSuccess(false);
    }
  };

  return (
    <div
      className="auth-page-container"
      style={{ backgroundImage: "url('/assets/login_background.png')" }}
    >
      <div className="auth-card">
        <h2>Change Password</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Current Password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="New Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button type="submit">Update Password</button>
        </form>
        {message && (
          <p className={`auth-message ${success ? 'success' : 'error'}`}>{message}</p>
        )}
      </div>
    </div>
  );
};

export default ChangePassword;
