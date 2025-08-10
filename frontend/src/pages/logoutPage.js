import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './logoutPage.css';

const LogoutPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const logoutUser = async () => {
      const token = localStorage.getItem('token');

      try {
        await fetch('http://localhost:5000/logout', {
          method: 'POST',
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
          },
        });
      } catch (err) {
        console.error('Logout failed (network):', err);
      } finally {
        // Clear client state and go to login
        localStorage.clear(); // clears token, student, etc.
        navigate('/login', { replace: true });
      }
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
