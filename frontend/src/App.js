import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import RegisterPage from './pages/registerPage';
import LoginPage from './pages/loginPage';
import StudentDashboard from './pages/studentDashboard';
import BrowseProjectsPage from './pages/browseProjectsPage';
import MyPreferencesPage from './pages/myPreferencePage';
import MyProposalPage from './pages/myProposalPage';
import ForgotPasswordPage from './pages/forgotPasswordPage';
import ResetPasswordPage from './pages/resetPasswordPage'; 

function App() {
  return (
    <Router>
      <Routes>
        {/* Default redirect to login */}
        <Route path="/" element={<Navigate to="/login" />} />

        {/* Authentication */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        {/* Student Features */}
        <Route path="/student-dashboard" element={<StudentDashboard />} />
        <Route path="/browse-projects" element={<BrowseProjectsPage />} />
        <Route path="/my-preferences" element={<MyPreferencesPage />} />
        <Route path="/my-proposals" element={<MyProposalPage />} />
      </Routes>
    </Router>
  );
}

export default App;
