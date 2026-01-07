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
import { useTranslation } from 'react-i18next';
import { passwordResetRequest } from '../../api/auth';
import ThemeSwitcher from '../../components/ThemeSwitcher';
import LanguageSwitcher from '../../components/LanguageSwitcher';

export default function PasswordResetRequestPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError(t('auth.password_reset.enter_email_error'));
      return;
    }

    // Простая валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t('auth.password_reset.invalid_email'));
      return;
    }

    setIsLoading(true);

    try {
      await passwordResetRequest({ email });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.password_reset.request_error'));
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
          position: 'relative',
        }}
      >
        {/* Theme and Language Switchers */}
        <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1 }}>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </Box>
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
            {t('auth.password_reset.email_sent_title')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            {t('auth.password_reset.email_sent_message')}
          </Typography>
          <Button
            component={RouterLink}
            to="/login"
            variant="contained"
            startIcon={<ArrowBack />}
          >
            {t('auth.password_reset.back_to_login')}
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
        position: 'relative',
      }}
    >
      {/* Theme and Language Switchers */}
      <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1 }}>
        <ThemeSwitcher />
        <LanguageSwitcher />
      </Box>
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
            {t('auth.password_reset.restoration_title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('auth.password_reset.enter_email_hint')}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            label={t('auth.email')}
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
              t('auth.password_reset.send_instructions')
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
              {t('auth.password_reset.back_to_login')}
            </Link>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
