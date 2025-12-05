// dieforglory/ai_crm/ai_crm-dc675b046852a3892be2ee583ae8e7595c235597/real_estate_crm/frontend-new/src/components/meetings/MeetingDetailModal.tsx
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { updateMeeting, type Meeting, type MeetingPayload } from '../../api/meetings';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack,
  Typography, TextField, Alert, Grid
} from '@mui/material';

interface Props {
  meeting: Meeting | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

// Форма для основного окна (только для редактирования существующего комментария)
type MainFormInputs = {
  result_comment: string;
};

// Форма для модального окна закрытия встречи
type CloseFormInputs = {
  result_comment: string;
};

export default function MeetingDetailModal({ meeting, open, onClose, onUpdate }: Props) {
  const { t } = useTranslation();
  const { register: registerMain, handleSubmit: handleSubmitMain, reset: resetMain } = useForm<MainFormInputs>();
  const { register: registerClose, handleSubmit: handleSubmitClose, reset: resetClose, formState: { errors: closeErrors } } = useForm<CloseFormInputs>();

  const queryClient = useQueryClient();
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'COMPLETED' | 'CANCELLED' | null>(null);

  useEffect(() => {
    if (meeting) {
      resetMain({ result_comment: meeting.result_comment || '' });
    }
  }, [meeting, resetMain]);

  // Функция для перевода статусов встреч
  const translateMeetingStatus = (status: string, isOverdue: boolean) => {
    if (isOverdue) return t('pages.meetings.overdue');
    return t(`statuses.meeting.${status}`, status);
  };

  const mutation = useMutation({
    mutationFn: updateMeeting,
    onSuccess: () => {
      onUpdate();
      // Закрываем оба окна
      onClose();
      setIsCloseModalOpen(false);
    },
    onError: (error) => alert(`${t('common.error')}: ${error.message}`)
  });

  if (!meeting) return null;

  // Открывает второе модальное окно для ввода результата
  const handleOpenCloseModal = (status: 'COMPLETED' | 'CANCELLED') => {
    resetClose(); // Сбрасываем форму
    setTargetStatus(status);
    setIsCloseModalOpen(true);
  };

  // Сохраняет результат из основного окна (если встреча уже была завершена)
  const handleResultSubmit = (data: MainFormInputs) => {
     mutation.mutate({ id: meeting.id, payload: { result_comment: data.result_comment } });
  };

  // Сохраняет результат и закрывает встречу из второго окна
  const handleCloseSubmit = (data: CloseFormInputs) => {
    if (!targetStatus) return;

    const payload: Partial<MeetingPayload> = {
        status: targetStatus,
        result_comment: data.result_comment
    };
    if (targetStatus === 'COMPLETED') {
      payload.actual_date = new Date().toISOString();
    }
    mutation.mutate({ id: meeting.id, payload });
  };


  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle>{t('pages.meetings.meeting_number', { id: meeting.id })}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                  <Stack spacing={2}>
                      <Typography variant="h6">{t('pages.meetings.meeting_details')}</Typography>
                      <Typography><strong>{t('pages.meetings.client')}:</strong> {meeting.client.full_name}</Typography>
                      <Typography><strong>{t('forms.status')}:</strong> {translateMeetingStatus(meeting.status, meeting.is_overdue)}</Typography>
                      <Typography><strong>{t('pages.meetings.planned_date')}:</strong> {new Date(meeting.planned_date).toLocaleString()}</Typography>
                      <Typography><strong>{t('forms.executor')}:</strong> {meeting.executor}</Typography>
                      <Typography><strong>{t('table.creator')}:</strong> {meeting.creator || t('common.system')}</Typography>
                      {meeting.interested_building && <Typography><strong>{t('pages.meetings.interest')}:</strong> {meeting.interested_building.name}</Typography>}
                      {meeting.comment && <Typography><strong>{t('forms.comment')}:</strong> {meeting.comment}</Typography>}
                  </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                  <Stack spacing={2}>
                      <Typography variant="h6">{t('pages.meetings.result')}</Typography>
                      {/* Показываем форму редактирования, только если встреча уже закрыта */}
                      {meeting.status !== 'NEW' ? (
                           <form onSubmit={handleSubmitMain(handleResultSubmit)}>
                              <Stack spacing={2}>
                                  <TextField
                                      label={t('pages.meetings.result_comment')}
                                      multiline
                                      rows={4}
                                      fullWidth
                                      defaultValue={meeting.result_comment}
                                      {...registerMain('result_comment')}
                                  />
                                  <Button type="submit" variant="contained" disabled={mutation.isPending}>{t('pages.meetings.save_result')}</Button>
                              </Stack>
                           </form>
                      ) : (
                          <Alert severity="info">{t('pages.meetings.fill_result_after')}</Alert>
                      )}
                  </Stack>
              </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.close')}</Button>
          {/* Кнопки видны только для новых встреч */}
          {meeting.status === 'NEW' && (
              <>
                  <Button onClick={() => handleOpenCloseModal('CANCELLED')} color="warning" disabled={mutation.isPending}>{t('pages.meetings.not_completed')}</Button>
                  <Button onClick={() => handleOpenCloseModal('COMPLETED')} color="success" variant="contained" disabled={mutation.isPending}>{t('pages.meetings.completed')}</Button>
              </>
          )}
        </DialogActions>
      </Dialog>

      {/* Второе модальное окно для ввода результата */}
      <Dialog open={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)}>
         <form onSubmit={handleSubmitClose(handleCloseSubmit)}>
            <DialogTitle>{t('pages.meetings.meeting_report')}</DialogTitle>
            <DialogContent>
              <TextField
                  label={t('pages.meetings.result_comment')}
                  multiline
                  rows={4}
                  fullWidth
                  autoFocus
                  required
                  sx={{ mt: 1 }}
                  {...registerClose('result_comment', { required: t('common.required_field') })}
                  error={!!closeErrors.result_comment}
                  helperText={closeErrors.result_comment?.message}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsCloseModalOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" variant="contained" disabled={mutation.isPending}>
                {mutation.isPending ? t('common.saving') : t('common.confirm')}
              </Button>
            </DialogActions>
         </form>
      </Dialog>
    </>
  );
}