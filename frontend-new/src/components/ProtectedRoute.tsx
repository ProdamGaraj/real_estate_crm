import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Box, CircularProgress } from '@mui/material';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, refreshUser } = useAuthStore();
  const hasRefreshed = useRef(false);

  // При загрузке приложения обновляем данные пользователя с сервера
  useEffect(() => {
    if (isAuthenticated && !hasRefreshed.current) {
      hasRefreshed.current = true;
      refreshUser();
    }
  }, [isAuthenticated, refreshUser]);
  const location = useLocation();

  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    // Сохраняем путь, на который пользователь пытался попасть
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
