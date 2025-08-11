import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function useRequireRole(requiredRole) {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (requiredRole && user.role !== requiredRole) {
      const fallback = user.role === 'supervisor' ? '/supervisor-dashboard' : '/student-dashboard';
      navigate(fallback, { replace: true });
    }
  }, [navigate, requiredRole]);
}
