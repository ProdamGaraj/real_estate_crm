import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { replaceDealScan } from '../../api/deals';
import { extractApiError } from '../../utils/apiError';

interface ScanReplaceButtonProps {
  dealId: number;
  kind: 'signed' | 'termination';
  /** Скан уже есть — кнопка заменяет его (с подтверждением), иначе загружает первый */
  hasScan: boolean;
}

/**
 * Замена скана без правки сделки. Работает и у закрытой или расторгнутой
 * сделки, карточка которой доступна только для чтения: раньше ошибочно
 * загруженный скан там было не заменить
 */
export default function ScanReplaceButton({ dealId, kind, hasScan }: ScanReplaceButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => replaceDealScan({ dealId, kind, file }),
    onSuccess: (deal) => {
      queryClient.setQueryData(['deal', String(dealId)], deal);
      alert(t(hasScan ? 'pages.deals.scan_replaced' : 'pages.deals.scan_uploaded'));
    },
    onError: (error) => alert(extractApiError(error, t('errors.update_error'))),
  });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Сброс, чтобы тот же файл можно было выбрать ещё раз после отказа
    event.target.value = '';
    if (!file) return;
    if (hasScan && !window.confirm(t('pages.deals.confirm_replace_scan', { name: file.name }))) return;
    mutation.mutate(file);
  };

  return (
    <>
      <Button
        size="small"
        color="inherit"
        variant="outlined"
        startIcon={<UploadFileIcon />}
        onClick={() => inputRef.current?.click()}
        disabled={mutation.isPending}
      >
        {mutation.isPending
          ? t('common.uploading')
          : t(hasScan ? 'pages.deals.replace_scan' : 'pages.deals.upload_scan')}
      </Button>
      <input ref={inputRef} type="file" hidden onChange={handleChange} />
    </>
  );
}
