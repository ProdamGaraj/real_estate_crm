// src/pages/LoginPage.tsx
import { useForm } from 'react-hook-form';
import type { SubmitHandler } from 'react-hook-form';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { loginUser } from '../api/auth';
import { setAuthTokens } from '../store/authSlice';
import { Container, Box, TextField, Button, Typography, Alert } from '@mui/material';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<LoginPayload>();

  const mutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      dispatch(setAuthTokens(data));
      navigate('/'); // Перенаправляем на дашборд после успеха
    },
  });

  const onSubmit: SubmitHandler<LoginPayload> = (data) => {
    mutation.mutate(data);
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h5">Вход в систему</Typography>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 1 }}>
          <TextField margin="normal" required fullWidth label="Username" {...register('username')} />
          <TextField margin="normal" required fullWidth label="Password" type="password" {...register('password')} />
          {mutation.isError && <Alert severity="error">Неверный логин или пароль</Alert>}
          <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>Войти</Button>
        </Box>
      </Box>
    </Container>
  );
}