import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Deal, DealCancellationPayload } from '../../api/deals';
import { cancelOrTerminateDeal } from '../../api/deals';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Stack, Alert
} from '@mui/material';
import LocalizedDateField from '../common/LocalizedDateField';

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
  const { t } = useTranslation();
  const { register, handleSubmit, control, formState: { errors } } = useForm<FormInputs>();

  // Определяем, какой сценарий использовать
  // Для CLOSED_WON всегда используется расторжение (termination)
  const hasPaidPayments = deal.payments.some(p => p.payment_date);
  const isSigned = !!deal.client_signature_date;
  const isClosedWon = deal.status === 'CLOSED_WON';
  const isTermination = isClosedWon || hasPaidPayments || isSigned;

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
      // FileList из input type="file"
      const fileList = data.document;
      if (fileList && fileList.length > 0) {
        payload.termination_document_scan = fileList[0];
      }
      // Отладка - проверим что данные есть
      console.log('Termination payload:', { date: payload.termination_date, hasFile: !!payload.termination_document_scan });
    } else {
      payload.cancellation_reason = data.reason;
    }
    mutation.mutate(payload);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isTermination ? t('deal_cancellation.termination_title') : t('deal_cancellation.cancellation_title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {isTermination ? (
              <>
                <Alert severity="warning">{t('deal_cancellation.termination_warning')}</Alert>
                <Controller
                  name="date"
                  control={control}
                  rules={{ required: true }}
                  render={({ field }) => (
                    <LocalizedDateField
                      label={t('deal_cancellation.termination_date')}
                      value={field.value || null}
                      onChange={(date) => field.onChange(date || '')}
                    />
                  )}
                />
                <TextField
                  label={t('deal_cancellation.document_scan')}
                  type="file"
                  required
                  InputLabelProps={{ shrink: true }}
                  {...register('document', { required: true })}
                />
              </>
            ) : (
              <>
                <Alert severity="info">{t('deal_cancellation.simple_cancellation_info')}</Alert>
                <TextField
                  label={t('deal_cancellation.cancellation_reason')}
                  multiline
                  rows={4}
                  required
                  fullWidth
                  {...register('reason', { required: true })}
                  error={!!errors.reason}
                  helperText={errors.reason ? t('common.required_field') : ''}
                />
              </>
            )}
             {mutation.isError && <Alert severity="error">{(mutation.error as Error).message}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button type="submit" variant="contained" color="error" disabled={mutation.isPending}>
            {mutation.isPending ? t('common.processing') : (isTermination ? t('deal_cancellation.terminate') : t('deal_cancellation.cancel_deal'))}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}