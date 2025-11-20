import { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  CircularProgress,
} from '@mui/material';
import { MailOutline, ArrowBack } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { passwordResetRequest } from '../../api/auth';

export default function PasswordResetRequestPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Введите email');
      return;
    }

    // Простая валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Введите корректный email');
      return;
    }

    setIsLoading(true);

    try {
      await passwordResetRequest({ email });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка при отправке запроса');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--gradient-auth)',
          padding: 2,
        }}
      >
        <Paper
          elevation={24}
          sx={{
            padding: 4,
            maxWidth: 450,
            width: '100%',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          <MailOutline sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Письмо отправлено
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Инструкции по восстановлению пароля отправлены на указанный email.
            Проверьте почту и следуйте инструкциям в письме.
          </Typography>
          <Button
            component={RouterLink}
            to="/login"
            variant="contained"
            startIcon={<ArrowBack />}
          >
            Вернуться к входу
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gradient-auth)',
        padding: 2,
      }}
    >
      <Paper
        elevation={24}
        sx={{
          padding: 4,
          maxWidth: 450,
          width: '100%',
          borderRadius: 2,
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <MailOutline sx={{ fontSize: 60, color: 'primary.main', mb: 1 }} />
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Восстановление пароля
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Введите email, указанный при регистрации
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            label="Email"
            fullWidth
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            margin="normal"
            autoComplete="email"
            autoFocus
            disabled={isLoading}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={isLoading}
            sx={{ mt: 3, mb: 2, py: 1.5 }}
          >
            {isLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Отправить инструкции'
            )}
          </Button>

          <Box sx={{ textAlign: 'center' }}>
            <Link
              component={RouterLink}
              to="/login"
              variant="body2"
              sx={{ textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}
            >
              <ArrowBack fontSize="small" />
              Вернуться к входу
            </Link>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
