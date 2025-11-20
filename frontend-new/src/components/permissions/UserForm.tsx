import { useState, useEffect } from 'react';
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
  getCompanies, 
  getDepartments, 
  getRoles,
  type UserProfile 
} from '../../api/permissions';

const ROLE_NAME_MAPPING: Record<string, string> = {
  'SYSTEM_ADMIN': 'Системный администратор',
  'COMPANY_ADMIN': 'Администратор компании',
  'DEPARTMENT_MANAGER': 'Руководитель отдела',
  'MANAGER': 'Менеджер',
  'VIEWER': 'Наблюдатель',
};

interface UserFormProps {
  userProfile?: UserProfile | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function UserForm({ userProfile, onSuccess, onCancel }: UserFormProps) {
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
          throw new Error('ID пользователя не найден');
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
        || `Ошибка при ${isCreating ? 'создании' : 'сохранении'} пользователя`;
      setError(errorMessage);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Валидация для создания
    if (isCreating) {
      if (!formData.username.trim()) {
        setError('Имя пользователя обязательно');
        return;
      }
      if (!formData.password.trim()) {
        setError('Пароль обязателен');
        return;
      }
      if (formData.password.length < 8) {
        setError('Пароль должен содержать минимум 8 символов');
        return;
      }
    }
    
    mutation.mutate(formData);
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}

        {isCreating ? (
          <>
            {/* Поля для создания нового пользователя */}
            <Typography variant="h6" gutterBottom>
              Данные пользователя
            </Typography>

            <TextField
              label="Имя пользователя (Username)"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              fullWidth
              helperText="Используется для входа в систему"
            />

            <TextField
              label="Пароль"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              fullWidth
              helperText="Минимум 8 символов"
            />

            <TextField
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              fullWidth
            />

            <TextField
              label="Имя"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              fullWidth
            />

            <TextField
              label="Фамилия"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              fullWidth
            />

            <Divider />

            <Typography variant="h6" gutterBottom>
              Данные профиля
            </Typography>
          </>
        ) : (
          <>
            {/* Информация о существующем пользователе */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Пользователь
              </Typography>
              <Typography variant="h6">{userProfile?.user_username}</Typography>
              {userProfile?.user_full_name && (
                <Typography variant="body2" color="text.secondary">
                  {userProfile.user_full_name}
                </Typography>
              )}
            </Box>

            <Divider />
          </>
        )}

        {/* Компания */}
        <FormControl fullWidth>
          <InputLabel>Компания</InputLabel>
          <Select
            value={formData.company || ''}
            onChange={(e) => setFormData({ ...formData, company: e.target.value ? Number(e.target.value) : null })}
            label="Компания"
          >
            <MenuItem value="">Не назначена</MenuItem>
            {companies?.map((company) => (
              <MenuItem key={company.id} value={company.id}>
                {company.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Отдел */}
        <FormControl fullWidth disabled={!formData.company}>
          <InputLabel>Отдел</InputLabel>
          <Select
            value={formData.department || ''}
            onChange={(e) => setFormData({ ...formData, department: e.target.value ? Number(e.target.value) : null })}
            label="Отдел"
          >
            <MenuItem value="">Не назначен</MenuItem>
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
          getOptionLabel={(option) => option.name || ROLE_NAME_MAPPING[option.code] || option.code}
          value={roles?.filter(r => formData.roles.includes(r.id)) || []}
          onChange={(_, newValue) => {
            setFormData({ ...formData, roles: newValue.map(r => r.id) });
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Роли"
              placeholder="Выберите роли"
            />
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => {
              const displayName = option.name || ROLE_NAME_MAPPING[option.code] || option.code;
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
          label="Должность"
          value={formData.position}
          onChange={(e) => setFormData({ ...formData, position: e.target.value })}
          fullWidth
        />

        {/* Телефон */}
        <TextField
          label="Телефон"
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
                <Typography variant="body2">Системный администратор</Typography>
                <Typography variant="caption" color="text.secondary">
                  Полный доступ ко всем функциям системы
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
            label="Активный пользователь"
          />
        </Box>

        {/* Кнопки */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button onClick={onCancel} disabled={mutation.isPending}>
            Отмена
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
