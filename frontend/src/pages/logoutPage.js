import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './logoutPage.css';

const LogoutPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const logoutUser = async () => {
      try {
        await fetch('http://localhost:5000/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });
      } catch (error) {
        console.error('Logout failed:', error);
      }

      // Clear local storage and redirect
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    };

    logoutUser();
  }, [navigate]);

  return (
    <div className="logout-container">
      <div className="logout-message">Logging you out...</div>
    </div>
  );
};

export default LogoutPage;
