// Компонент для управления API-ключами партнёров
import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Autocomplete, FormGroup, FormControlLabel, Checkbox,
  Alert, Tooltip, CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ContentCopy as CopyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  PowerSettingsNew as PowerIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ru } from 'date-fns/locale';
import {
  getPartnerAPIKeys, createPartnerAPIKey, deletePartnerAPIKey,
  regeneratePartnerAPIKey, togglePartnerAPIKey, updatePartnerAPIKey,
  type PartnerAPIKeyPayload, type PartnerAPIKey, type AllowedScope
} from '../../api/partnerApiKeys';
import { getCompanies, type Company } from '../../api/permissions';

// Локализация scopes
const SCOPE_LABELS: Record<AllowedScope, string> = {
  VIEW_PROJECTS: 'Просмотр проектов',
  VIEW_BUILDINGS: 'Просмотр зданий',
  VIEW_LAYOUTS: 'Просмотр планировок',
  CREATE_APPLICATION: 'Создание заявок'
};

interface FormData {
  name: string;
  description: string;
  companies: Company[];
  allowed_scopes: AllowedScope[];
  expires_at: Date | null;
  allowed_ips: string;
  requests_per_minute: number;
  requests_per_day: number;
}

export default function PartnerAPIKeyManager() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<PartnerAPIKey | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Все возможные scopes
  const ALL_SCOPES: AllowedScope[] = ['VIEW_PROJECTS', 'VIEW_BUILDINGS', 'VIEW_LAYOUTS', 'CREATE_APPLICATION'];

  // Загрузка данных
  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['partnerApiKeys'],
    queryFn: getPartnerAPIKeys
  });

  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: () => getCompanies()
  });

  // Форма
  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: '',
      description: '',
      companies: [],
      allowed_scopes: [],
      expires_at: null,
      allowed_ips: '',
      requests_per_minute: 60,
      requests_per_day: 10000
    }
  });

  // Эффект для заполнения формы при редактировании
  useEffect(() => {
    if (editingKey) {
      setValue('name', editingKey.name);
      setValue('description', editingKey.description || '');
      setValue('allowed_scopes', editingKey.allowed_scopes || []);
      setValue('expires_at', editingKey.expires_at ? new Date(editingKey.expires_at) : null);
      setValue('allowed_ips', editingKey.allowed_ips || '');
      setValue('requests_per_minute', editingKey.requests_per_minute);
      setValue('requests_per_day', editingKey.requests_per_day);
      // Устанавливаем компании по ID
      if (companies && editingKey.companies_data) {
        setValue('companies', editingKey.companies_data);
      }
    }
  }, [editingKey, companies, setValue]);

  // Мутации
  const createMutation = useMutation({
    mutationFn: createPartnerAPIKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partnerApiKeys'] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PartnerAPIKeyPayload }) => updatePartnerAPIKey(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partnerApiKeys'] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deletePartnerAPIKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partnerApiKeys'] })
  });

  const regenerateMutation = useMutation({
    mutationFn: regeneratePartnerAPIKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partnerApiKeys'] })
  });

  const toggleMutation = useMutation({
    mutationFn: togglePartnerAPIKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partnerApiKeys'] })
  });

  // Обработчики
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingKey(null);
    reset({
      name: '',
      description: '',
      companies: [],
      allowed_scopes: [],
      expires_at: null,
      allowed_ips: '',
      requests_per_minute: 60,
      requests_per_day: 10000
    });
  };

  const openCreateModal = () => {
    setEditingKey(null);
    setIsModalOpen(true);
  };

  const openEditModal = (apiKey: PartnerAPIKey) => {
    setEditingKey(apiKey);
    setIsModalOpen(true);
  };

  const onSubmit = (data: FormData) => {
    const payload: PartnerAPIKeyPayload = {
      name: data.name,
      description: data.description,
      companies: data.companies.map(c => c.id),
      allowed_scopes: data.allowed_scopes,
      expires_at: data.expires_at ? data.expires_at.toISOString() : null,
      allowed_ips: data.allowed_ips,
      requests_per_minute: data.requests_per_minute,
      requests_per_day: data.requests_per_day
    };
    
    if (editingKey) {
      updateMutation.mutate({ id: editingKey.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleKeyVisibility = (id: number) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const copyToClipboard = async (key: string, id: number) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('ru-RU');
  };

  const maskKey = (key: string) => {
    return key.substring(0, 8) + '••••••••••••••••' + key.substring(key.length - 8);
  };

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">API-ключи партнёров</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateModal}>
          Создать ключ
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        API-ключи используются партнёрами для доступа к публичному API. Передавайте ключ в заголовке <code>X-API-Key</code>.
      </Alert>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Компания</TableCell>
              <TableCell>Разрешения</TableCell>
              <TableCell>API-ключ</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Последнее использование</TableCell>
              <TableCell>Срок действия</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {apiKeys?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">Нет API-ключей</Typography>
                </TableCell>
              </TableRow>
            )}
            {apiKeys?.map((apiKey) => (
              <TableRow key={apiKey.id}>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">{apiKey.name}</Typography>
                  {apiKey.description && (
                    <Typography variant="caption" color="text.secondary">{apiKey.description}</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {apiKey.companies_data?.length > 0 ? (
                      apiKey.companies_data.map(company => (
                        <Chip key={company.id} label={company.name} size="small" variant="outlined" />
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">Все</Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {apiKey.allowed_scopes?.length > 0 ? (
                      apiKey.allowed_scopes.map(scope => (
                        <Chip 
                          key={scope} 
                          label={SCOPE_LABELS[scope] || scope} 
                          size="small" 
                          color="primary"
                          variant="outlined"
                        />
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">Нет доступа</Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {visibleKeys.has(apiKey.id) ? apiKey.key : maskKey(apiKey.key)}
                    </Typography>
                    <Tooltip title={visibleKeys.has(apiKey.id) ? "Скрыть" : "Показать"}>
                      <IconButton size="small" onClick={() => toggleKeyVisibility(apiKey.id)}>
                        {visibleKeys.has(apiKey.id) ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={copiedId === apiKey.id ? "Скопировано!" : "Копировать"}>
                      <IconButton size="small" onClick={() => copyToClipboard(apiKey.key, apiKey.id)}>
                        <CopyIcon fontSize="small" color={copiedId === apiKey.id ? "success" : "inherit"} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell>
                  {apiKey.is_expired ? (
                    <Chip label="Истёк" color="error" size="small" />
                  ) : apiKey.is_active ? (
                    <Chip label="Активен" color="success" size="small" />
                  ) : (
                    <Chip label="Отключен" color="default" size="small" />
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatDate(apiKey.last_used_at)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatDate(apiKey.expires_at)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Редактировать">
                    <IconButton size="small" onClick={() => openEditModal(apiKey)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={apiKey.is_active ? "Отключить" : "Включить"}>
                    <IconButton 
                      size="small" 
                      onClick={() => toggleMutation.mutate(apiKey.id)}
                      color={apiKey.is_active ? "warning" : "success"}
                    >
                      <PowerIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Перегенерировать ключ">
                    <IconButton 
                      size="small" 
                      onClick={() => {
                        if (confirm('Перегенерировать ключ? Старый ключ перестанет работать.')) {
                          regenerateMutation.mutate(apiKey.id);
                        }
                      }}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Удалить">
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => {
                        if (confirm('Удалить API-ключ? Это действие необратимо.')) {
                          deleteMutation.mutate(apiKey.id);
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Модалка создания/редактирования */}
      <Dialog open={isModalOpen} onClose={closeModal} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>{editingKey ? 'Редактировать API-ключ' : 'Создать API-ключ'}</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Обязательное поле' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Название партнёра"
                    fullWidth
                    error={!!errors.name}
                    helperText={errors.name?.message}
                  />
                )}
              />

              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Описание"
                    fullWidth
                    multiline
                    rows={2}
                  />
                )}
              />

              <Controller
                name="companies"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    {...field}
                    multiple
                    options={companies || []}
                    getOptionLabel={(option) => option.name}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    onChange={(_, newValue) => field.onChange(newValue)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Компании (доступ к данным)"
                        placeholder="Выберите компании"
                        helperText="Оставьте пустым, если партнёр должен видеть все компании"
                      />
                    )}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip
                          {...getTagProps({ index })}
                          key={option.id}
                          label={option.name}
                          size="small"
                        />
                      ))
                    }
                  />
                )}
              />

              {/* Выбор разрешений (scopes) */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Разрешённые действия</Typography>
                <Controller
                  name="allowed_scopes"
                  control={control}
                  render={({ field }) => (
                    <FormGroup>
                      {ALL_SCOPES.map(scope => (
                        <FormControlLabel
                          key={scope}
                          control={
                            <Checkbox
                              checked={field.value.includes(scope)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  field.onChange([...field.value, scope]);
                                } else {
                                  field.onChange(field.value.filter(s => s !== scope));
                                }
                              }}
                            />
                          }
                          label={SCOPE_LABELS[scope]}
                        />
                      ))}
                    </FormGroup>
                  )}
                />
                <Typography variant="caption" color="text.secondary">
                  Выберите, какие операции может выполнять партнёр
                </Typography>
              </Box>

              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ru}>
                <Controller
                  name="expires_at"
                  control={control}
                  render={({ field }) => (
                    <DateTimePicker
                      {...field}
                      label="Срок действия (опционально)"
                      slotProps={{ textField: { fullWidth: true } }}
                    />
                  )}
                />
              </LocalizationProvider>

              <Controller
                name="allowed_ips"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Разрешённые IP (через запятую)"
                    fullWidth
                    placeholder="192.168.1.1, 10.0.0.1"
                    helperText="Оставьте пустым для доступа с любых IP"
                  />
                )}
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Controller
                  name="requests_per_minute"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      type="number"
                      label="Запросов в минуту"
                      fullWidth
                    />
                  )}
                />
                <Controller
                  name="requests_per_day"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      type="number"
                      label="Запросов в день"
                      fullWidth
                    />
                  )}
                />
              </Box>

              {editingKey && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Изменение настроек не пересоздаёт API-ключ. Для генерации нового ключа используйте кнопку «Перегенерировать».
                </Alert>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeModal}>Отмена</Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending 
                ? (editingKey ? 'Сохранение...' : 'Создание...') 
                : (editingKey ? 'Сохранить' : 'Создать')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
