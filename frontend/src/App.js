import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import RegisterPage from './pages/registerPage';
import LoginPage from './pages/loginPage';
import StudentDashboard from './pages/studentDashboard';
import BrowseProjectsPage from './pages/browseProjectsPage';
import MyPreferencesPage from './pages/myPreferencePage'; 

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/student-dashboard" element={<StudentDashboard />} />
        <Route path="/browse-projects" element={<BrowseProjectsPage />} />
        <Route path="/my-preferences" element={<MyPreferencesPage />} /> 
      </Routes>
    </Router>
  );
}

export default App;
