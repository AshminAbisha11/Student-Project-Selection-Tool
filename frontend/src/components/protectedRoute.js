import React from 'react';
import { Navigate } from 'react-router-dom';
import { isTokenValid, getUser, logoutClient } from '../utils/auth';

export default function ProtectedRoute({ roles, children }) {
  const token = localStorage.getItem('token');
  if (!token || !isTokenValid(token)) {
    logoutClient();
    return <Navigate to="/login" replace />;
  }
  const user = getUser();
  if (roles && !roles.includes(user?.role?.toLowerCase())) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
