// dieforglory/ai_crm/ai_crm-dc675b046852a3892be2ee583ae8e7595c235597/real_estate_crm/frontend-new/src/components/meetings/MeetingDetailModal.tsx
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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


  const mutation = useMutation({
    mutationFn: updateMeeting,
    onSuccess: () => {
      onUpdate();
      // Закрываем оба окна
      onClose();
      setIsCloseModalOpen(false);
    },
    onError: (error) => alert(`Ошибка: ${error.message}`)
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
        <DialogTitle>Встреча №{meeting.id}</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                  <Stack spacing={2}>
                      <Typography variant="h6">Детали встречи</Typography>
                      <Typography><strong>Клиент:</strong> {meeting.client.full_name}</Typography>
                      <Typography><strong>Статус:</strong> {meeting.is_overdue ? 'Просрочена' : meeting.status}</Typography>
                      <Typography><strong>План. дата:</strong> {new Date(meeting.planned_date).toLocaleString()}</Typography>
                      <Typography><strong>Исполнитель:</strong> {meeting.executor}</Typography>
                      <Typography><strong>Постановщик:</strong> {meeting.creator || 'Система'}</Typography>
                      {meeting.interested_building && <Typography><strong>Интерес:</strong> {meeting.interested_building.name}</Typography>}
                      {meeting.comment && <Typography><strong>Комментарий:</strong> {meeting.comment}</Typography>}
                  </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                  <Stack spacing={2}>
                      <Typography variant="h6">Результат</Typography>
                      {/* Показываем форму редактирования, только если встреча уже закрыта */}
                      {meeting.status !== 'NEW' ? (
                           <form onSubmit={handleSubmitMain(handleResultSubmit)}>
                              <Stack spacing={2}>
                                  <TextField
                                      label="Комментарий по результатам"
                                      multiline
                                      rows={4}
                                      fullWidth
                                      defaultValue={meeting.result_comment}
                                      {...registerMain('result_comment')}
                                  />
                                  <Button type="submit" variant="contained" disabled={mutation.isPending}>Сохранить результат</Button>
                              </Stack>
                           </form>
                      ) : (
                          <Alert severity="info">Заполните результат после завершения встречи.</Alert>
                      )}
                  </Stack>
              </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Закрыть</Button>
          {/* Кнопки видны только для новых встреч */}
          {meeting.status === 'NEW' && (
              <>
                  <Button onClick={() => handleOpenCloseModal('CANCELLED')} color="warning" disabled={mutation.isPending}>Не состоялась</Button>
                  <Button onClick={() => handleOpenCloseModal('COMPLETED')} color="success" variant="contained" disabled={mutation.isPending}>Состоялась</Button>
              </>
          )}
        </DialogActions>
      </Dialog>

      {/* Второе модальное окно для ввода результата */}
      <Dialog open={isCloseModalOpen} onClose={() => setIsCloseModalOpen(false)}>
         <form onSubmit={handleSubmitClose(handleCloseSubmit)}>
            <DialogTitle>Отчет о встрече</DialogTitle>
            <DialogContent>
              <TextField
                  label="Комментарий по результатам"
                  multiline
                  rows={4}
                  fullWidth
                  autoFocus
                  required
                  sx={{ mt: 1 }}
                  {...registerClose('result_comment', { required: 'Это поле обязательно' })}
                  error={!!closeErrors.result_comment}
                  helperText={closeErrors.result_comment?.message}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsCloseModalOpen(false)}>Отмена</Button>
              <Button type="submit" variant="contained" disabled={mutation.isPending}>
                {mutation.isPending ? 'Сохранение...' : 'Подтвердить'}
              </Button>
            </DialogActions>
         </form>
      </Dialog>
    </>
  );
}