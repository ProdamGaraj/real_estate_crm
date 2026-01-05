import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Stack,
  Alert,
  Typography,
  Divider,
  Chip,
  Autocomplete,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { 
  updateUserProfile,
  createUserProfile,
  changeUserPassword,
  getCompanies, 
  getDepartments, 
  getRoles,
  type UserProfile 
} from '../../api/permissions';

interface UserFormProps {
  userProfile?: UserProfile | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function UserForm({ userProfile, onSuccess, onCancel }: UserFormProps) {
  const { t } = useTranslation();
  const isCreating = !userProfile;
  
  const [formData, setFormData] = useState({
    // Поля для создания пользователя
    username: '',
    password: '',
    email: '',
    first_name: '',
    last_name: '',
    // Поля профиля
    company: userProfile?.company || null,
    department: userProfile?.department || null,
    roles: userProfile?.roles?.map(r => r.id) || [],
    position: userProfile?.position || '',
    phone: userProfile?.phone || '',
    is_system_admin: userProfile?.is_system_admin || false,
    is_active: userProfile?.is_active ?? true,
  });

  // Поля для смены пароля (только при редактировании)
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Загрузка компаний
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => getCompanies(),
  });

  // Загрузка отделов для выбранной компании
  const { data: departments } = useQuery({
    queryKey: ['departments', formData.company],
    queryFn: () => getDepartments({ company: formData.company || undefined }),
    enabled: !!formData.company,
  });

  // Загрузка ролей
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => getRoles(),
  });

  // Сброс отдела при смене компании
  useEffect(() => {
    if (formData.company !== userProfile?.company) {
      setFormData(prev => ({ ...prev, department: null }));
    }
  }, [formData.company, userProfile?.company]);

  // Мутация для смены пароля
  const passwordMutation = useMutation({
    mutationFn: () => {
      if (!userProfile?.id) {
        throw new Error(t('errors.user_not_found'));
      }
      return changeUserPassword(
        userProfile.id,
        passwordData.newPassword,
        passwordData.confirmPassword
      );
    },
    onSuccess: (data) => {
      setPasswordSuccess(data.message || t('pages.settings.permissions.password_changed'));
      setPasswordData({ newPassword: '', confirmPassword: '' });
      setShowPasswordSection(false);
      // Очищаем сообщение об успехе через 5 секунд
      setTimeout(() => setPasswordSuccess(null), 5000);
    },
    onError: (err: any) => {
      console.error('Password change error:', err.response?.data);
      const errorMessage = err.response?.data?.confirm_password?.[0] 
        || err.response?.data?.new_password?.[0]
        || err.response?.data?.detail
        || err.message
        || t('errors.password_change_error');
      setError(errorMessage);
    },
  });

  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isCreating) {
        // Создание нового пользователя
        const payload: any = {
          username: data.username,
          password: data.password,
          is_system_admin: data.is_system_admin,
          is_active: data.is_active,
          role_ids: data.roles || [],
        };
        
        // Добавляем опциональные поля только если они заполнены
        if (data.email?.trim()) payload.email = data.email.trim();
        if (data.first_name?.trim()) payload.first_name = data.first_name.trim();
        if (data.last_name?.trim()) payload.last_name = data.last_name.trim();
        if (data.company) payload.company_id = Number(data.company);
        if (data.department) payload.department_id = Number(data.department);
        if (data.position?.trim()) payload.position = data.position.trim();
        if (data.phone?.trim()) payload.phone = data.phone.trim();
        
        console.log('Creating user with payload:', payload);
        return createUserProfile(payload);
      } else {
        // Обновление существующего профиля
        if (!userProfile?.id) {
          throw new Error(t('errors.user_not_found'));
        }
        
        const payload: any = {
          role_ids: data.roles || [],
          is_system_admin: data.is_system_admin,
          is_active: data.is_active,
        };
        
        // Добавляем опциональные поля только если они заполнены
        if (data.company) {
          payload.company_id = Number(data.company);
        }
        if (data.department) {
          payload.department_id = Number(data.department);
        }
        if (data.position?.trim()) {
          payload.position = data.position.trim();
        }
        if (data.phone?.trim()) {
          payload.phone = data.phone.trim();
        }
        
        return updateUserProfile(userProfile.id, payload);
      }
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (err: any) => {
      console.error('User form error:', err.response?.data);
      
      // Собираем все ошибки валидации
      if (err.response?.data && typeof err.response.data === 'object') {
        const errors = err.response.data;
        const errorMessages: string[] = [];
        
        // Проверяем каждое поле на ошибки
        Object.keys(errors).forEach(field => {
          const fieldErrors = errors[field];
          if (Array.isArray(fieldErrors)) {
            errorMessages.push(...fieldErrors);
          } else if (typeof fieldErrors === 'string') {
            errorMessages.push(fieldErrors);
          }
        });
        
        if (errorMessages.length > 0) {
          setError(errorMessages.join('. '));
          return;
        }
      }
      
      // Fallback сообщение
      const errorMessage = err.response?.data?.detail 
        || err.message 
        || t(isCreating ? 'errors.create_user_error' : 'errors.save_user_error');
      setError(errorMessage);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Валидация для создания
    if (isCreating) {
      if (!formData.username.trim()) {
        setError(t('validation.username_required'));
        return;
      }
      if (!formData.password.trim()) {
        setError(t('validation.password_required'));
        return;
      }
      if (formData.password.length < 8) {
        setError(t('validation.password_min_length'));
        return;
      }
    }
    
    mutation.mutate(formData);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        {passwordSuccess && <Alert severity="success">{passwordSuccess}</Alert>}

        {isCreating ? (
          <>
            {/* Поля для создания нового пользователя */}
            <Typography variant="h6" gutterBottom>
              {t('pages.settings.permissions.user_data')}
            </Typography>

            <TextField
              label={t('pages.settings.permissions.username')}
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              fullWidth
              helperText={t('pages.settings.permissions.username_help')}
            />

            <TextField
              label={t('pages.settings.permissions.password')}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              fullWidth
              helperText={t('pages.settings.permissions.password_help')}
            />

            <TextField
              label={t('common.email')}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              fullWidth
            />

            <TextField
              label={t('pages.settings.permissions.first_name')}
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              fullWidth
            />

            <TextField
              label={t('pages.settings.permissions.last_name')}
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              fullWidth
            />

            <Divider />

            <Typography variant="h6" gutterBottom>
              {t('pages.settings.permissions.profile_data')}
            </Typography>
          </>
        ) : (
          <>
            {/* Информация о существующем пользователе */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('pages.settings.permissions.user')}
              </Typography>
              <Typography variant="h6">{userProfile?.user_username}</Typography>
              {userProfile?.user_full_name && (
                <Typography variant="body2" color="text.secondary">
                  {userProfile.user_full_name}
                </Typography>
              )}
            </Box>

            <Divider />

            {/* Секция смены пароля */}
            <Box>
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => setShowPasswordSection(!showPasswordSection)}
                sx={{ mb: 2 }}
              >
                {showPasswordSection 
                  ? t('common.cancel') 
                  : t('pages.settings.permissions.change_password')}
              </Button>

              {showPasswordSection && (
                <Stack spacing={2} sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {t('pages.settings.permissions.new_password_section')}
                  </Typography>

                  <TextField
                    label={t('pages.settings.permissions.new_password')}
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    fullWidth
                    helperText={t('pages.settings.permissions.password_help')}
                  />

                  <TextField
                    label={t('pages.settings.permissions.confirm_password')}
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    fullWidth
                    error={passwordData.confirmPassword !== '' && passwordData.newPassword !== passwordData.confirmPassword}
                    helperText={
                      passwordData.confirmPassword !== '' && passwordData.newPassword !== passwordData.confirmPassword
                        ? t('validation.passwords_not_match')
                        : ''
                    }
                  />

                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => passwordMutation.mutate()}
                    disabled={
                      passwordMutation.isPending ||
                      !passwordData.newPassword ||
                      !passwordData.confirmPassword ||
                      passwordData.newPassword !== passwordData.confirmPassword ||
                      passwordData.newPassword.length < 8
                    }
                  >
                    {passwordMutation.isPending 
                      ? t('common.saving') 
                      : t('pages.settings.permissions.save_password')}
                  </Button>
                </Stack>
              )}
            </Box>

            <Divider />
          </>
        )}

        {/* Компания */}
        <FormControl fullWidth>
          <InputLabel>{t('common.company')}</InputLabel>
          <Select
            value={formData.company || ''}
            onChange={(e) => setFormData({ ...formData, company: e.target.value ? Number(e.target.value) : null })}
            label={t('common.company')}
          >
            <MenuItem value="">{t('common.not_assigned')}</MenuItem>
            {companies?.map((company) => (
              <MenuItem key={company.id} value={company.id}>
                {company.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Отдел */}
        <FormControl fullWidth disabled={!formData.company}>
          <InputLabel>{t('pages.settings.permissions.department')}</InputLabel>
          <Select
            value={formData.department || ''}
            onChange={(e) => setFormData({ ...formData, department: e.target.value ? Number(e.target.value) : null })}
            label={t('pages.settings.permissions.department')}
          >
            <MenuItem value="">{t('common.not_assigned')}</MenuItem>
            {departments?.map((dept) => (
              <MenuItem key={dept.id} value={dept.id}>
                {dept.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Роли */}
        <Autocomplete
          multiple
          options={roles || []}
          getOptionLabel={(option) => option.name || option.code}
          value={roles?.filter(r => formData.roles.includes(r.id)) || []}
          onChange={(_, newValue) => {
            setFormData({ ...formData, roles: newValue.map(r => r.id) });
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('pages.settings.permissions.roles')}
              placeholder={t('pages.settings.permissions.select_roles')}
            />
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => {
              const displayName = option.name || option.code;
              const { key, ...chipProps } = getTagProps({ index });
              return (
                <Chip
                  key={key}
                  label={displayName}
                  {...chipProps}
                  color="primary"
                  size="small"
                />
              );
            })
          }
        />

        {/* Должность */}
        <TextField
          label={t('pages.settings.permissions.position')}
          value={formData.position}
          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
          fullWidth
        />

        {/* Телефон */}
        <TextField
          label={t('common.phone')}
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          fullWidth
          placeholder="+7 (___) ___-__-__"
        />

        <Divider />

        {/* Флаги */}
        <Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.is_system_admin}
                onChange={(e) => setFormData({ ...formData, is_system_admin: e.target.checked })}
              />
            }
            label={
              <Box>
                <Typography variant="body2">{t('pages.settings.permissions.system_admin')}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('pages.settings.permissions.system_admin_desc')}
                </Typography>
              </Box>
            }
          />
        </Box>

        <Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
            }
            label={t('pages.settings.permissions.active_user')}
          />
        </Box>

        {/* Кнопки */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={onCancel} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
