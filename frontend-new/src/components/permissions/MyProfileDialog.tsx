import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { changeMyPassword, getCurrentUserProfile, updateMyName } from '../../api/permissions';
import { setAccessToken } from '../../api/tokenStore';
import { useAuthStore } from '../../store/authStore';
import { extractApiError } from '../../utils/apiError';

interface MyProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

const EMPTY_PASSWORDS = { current: '', next: '', confirm: '' };

/**
 * «Мой профиль» из меню пользователя: сотрудник сам меняет имя и пароль.
 * Логин, e-mail, роли и компанию меняет администратор в «Настройки → Пользователи»
 */
export default function MyProfileDialog({ open, onClose }: MyProfileDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((state) => state.refreshUser);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['myProfile'],
    queryFn: getCurrentUserProfile,
    enabled: open,
    // Иначе возврат на вкладку перезагрузил бы данные и стёр набранное имя
    refetchOnWindowFocus: false,
  });
  const account = profile && typeof profile.user === 'object' ? profile.user : null;

  const [name, setName] = useState({ first_name: '', last_name: '' });
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [nameMessage, setNameMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // При каждом открытии — свежие данные и пустые поля пароля
  useEffect(() => {
    if (open && account) {
      setName({ first_name: account.first_name || '', last_name: account.last_name || '' });
    }
  }, [open, account]);
  useEffect(() => {
    if (!open) {
      setPasswords(EMPTY_PASSWORDS);
      setNameMessage(null);
      setPasswordMessage(null);
    }
  }, [open]);

  const nameMutation = useMutation({
    mutationFn: () => updateMyName({ first_name: name.first_name.trim(), last_name: name.last_name.trim() }),
    onSuccess: async () => {
      setNameMessage({ ok: true, text: t('profile.name_saved') });
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
      // Имя в шапке и в списках сотрудников
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => setNameMessage({ ok: false, text: extractApiError(error, t('profile.save_error')) }),
  });

  const passwordMutation = useMutation({
    mutationFn: () => changeMyPassword({
      current_password: passwords.current,
      new_password: passwords.next,
      confirm_password: passwords.confirm,
    }),
    onSuccess: (data) => {
      // Прежние токены отозваны — дальше работаем с новым
      setAccessToken(data.access);
      setPasswords(EMPTY_PASSWORDS);
      setPasswordMessage({ ok: true, text: t('pages.settings.permissions.password_changed') });
    },
    onError: (error) => setPasswordMessage({
      ok: false, text: extractApiError(error, t('errors.password_change_error')),
    }),
  });

  const nameValid = name.first_name.trim() !== '' && name.last_name.trim() !== '';
  const nameChanged = !!account && (
    name.first_name.trim() !== (account.first_name || '') || name.last_name.trim() !== (account.last_name || '')
  );
  const passwordsMismatch = passwords.confirm !== '' && passwords.next !== passwords.confirm;
  const canChangePassword = passwords.current !== '' && passwords.next.length >= 8 && !passwordsMismatch
    && passwords.confirm !== '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('nav.my_profile')}</DialogTitle>
      <DialogContent>
        {isLoading || !account ? (
          <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={28} /></Stack>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="subtitle1">{t('profile.personal_data')}</Typography>
            <TextField
              label={t('pages.settings.permissions.last_name')}
              value={name.last_name}
              onChange={(e) => setName({ ...name, last_name: e.target.value })}
              error={name.last_name.trim() === ''}
              size="small"
              fullWidth
            />
            <TextField
              label={t('pages.settings.permissions.first_name')}
              value={name.first_name}
              onChange={(e) => setName({ ...name, first_name: e.target.value })}
              error={name.first_name.trim() === ''}
              helperText={!nameValid ? t('profile.name_required') : undefined}
              size="small"
              fullWidth
            />
            <Typography variant="body2" color="text.secondary">
              {account.username}{account.email ? ` · ${account.email}` : ''} — {t('profile.email_hint')}
            </Typography>
            {nameMessage && <Alert severity={nameMessage.ok ? 'success' : 'error'}>{nameMessage.text}</Alert>}
            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="contained"
                onClick={() => { setNameMessage(null); nameMutation.mutate(); }}
                disabled={!nameValid || !nameChanged || nameMutation.isPending}
              >
                {nameMutation.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </Stack>

            <Divider />

            <Typography variant="subtitle1">{t('pages.settings.permissions.change_password')}</Typography>
            <TextField
              label={t('profile.current_password')}
              type="password"
              autoComplete="current-password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              size="small"
              fullWidth
            />
            <TextField
              label={t('pages.settings.permissions.new_password')}
              type="password"
              autoComplete="new-password"
              value={passwords.next}
              onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
              helperText={t('pages.settings.permissions.password_help')}
              size="small"
              fullWidth
            />
            <TextField
              label={t('pages.settings.permissions.confirm_password')}
              type="password"
              autoComplete="new-password"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              error={passwordsMismatch}
              helperText={passwordsMismatch ? t('validation.passwords_not_match') : undefined}
              size="small"
              fullWidth
            />
            <Typography variant="body2" color="text.secondary">{t('profile.other_devices_hint')}</Typography>
            {passwordMessage && (
              <Alert severity={passwordMessage.ok ? 'success' : 'error'}>{passwordMessage.text}</Alert>
            )}
            <Stack direction="row" justifyContent="flex-end">
              <Button
                variant="contained"
                onClick={() => { setPasswordMessage(null); passwordMutation.mutate(); }}
                disabled={!canChangePassword || passwordMutation.isPending}
              >
                {passwordMutation.isPending ? t('common.saving') : t('pages.settings.permissions.save_password')}
              </Button>
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
