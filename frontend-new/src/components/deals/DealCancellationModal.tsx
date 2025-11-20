import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import type { Deal, DealCancellationPayload } from '../../api/deals';
import { cancelOrTerminateDeal } from '../../api/deals';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Stack, Typography, Alert
} from '@mui/material';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (data: Deal) => void;
  deal: Deal;
}

type FormInputs = {
  reason: string;
  document: FileList | null;
  date: string;
}

export default function DealCancellationModal({ open, onClose, onSuccess, deal }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormInputs>();

  // Определяем, какой сценарий использовать
  const hasPaidPayments = deal.payments.some(p => p.payment_date);
  const isSigned = !!deal.client_signature_date;
  const isTermination = hasPaidPayments || isSigned;

  const mutation = useMutation({
    mutationFn: (payload: DealCancellationPayload) => cancelOrTerminateDeal({ dealId: deal.id, payload }),
    onSuccess: (data) => {
      onSuccess(data);
    },
  });

  const onSubmit = (data: FormInputs) => {
    const payload: DealCancellationPayload = {};
    if (isTermination) {
      payload.termination_date = data.date;
      if (data.document && data.document.length > 0) {
        payload.termination_document_scan = data.document[0];
      }
    } else {
      payload.cancellation_reason = data.reason;
    }
    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isTermination ? 'Расторжение сделки' : 'Отмена сделки'}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {isTermination ? (
              <>
                <Alert severity="warning">В сделке есть проведенные платежи или подпись клиента. Необходимо расторжение с прикреплением документа.</Alert>
                <TextField
                  label="Дата расторжения"
                  type="date"
                  required
                  InputLabelProps={{ shrink: true }}
                  {...register('date', { required: true })}
                />
                <TextField
                  label="Скан документа-основания"
                  type="file"
                  required
                  InputLabelProps={{ shrink: true }}
                  {...register('document', { required: true })}
                />
              </>
            ) : (
              <>
                <Alert severity="info">В сделке нет проведенных платежей. Будет выполнена простая отмена.</Alert>
                <TextField
                  label="Причина отмены"
                  multiline
                  rows={4}
                  required
                  fullWidth
                  {...register('reason', { required: true })}
                  error={!!errors.reason}
                  helperText={errors.reason ? 'Это поле обязательно' : ''}
                />
              </>
            )}
             {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Закрыть</Button>
          <Button type="submit" variant="contained" color="error" disabled={mutation.isPending}>
            {mutation.isPending ? 'Обработка...' : (isTermination ? 'Расторгнуть' : 'Отменить сделку')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}