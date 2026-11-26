// real_estate_crm/frontend-new/src/components/deals/BookingDocumentGeneration.tsx

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, CircularProgress, List, ListItem, ListItemIcon, ListItemText } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import apiClient from '../../api/axios';
import { getBookingTemplates } from '../../api/templates';
import { extractApiError } from '../../utils/apiError';

interface Props {
  bookingId: number;
  /** Снятая бронь: документы по ней больше не формируются */
  disabled?: boolean;
}

/**
 * Договор брони по шаблону.
 *
 * Список свой, а не общий со сделкой: в договоре брони нет графика
 * платежей, зато есть срок брони, цена на момент брони и взнос. Пока
 * шаблоны смешивались, в брони печатался договор долевого участия.
 */
export default function BookingDocumentGeneration({ bookingId, disabled }: Props) {
  const { t } = useTranslation();

  const { data: templates, isLoading, isError, error } = useQuery({
    queryKey: ['bookingTemplates', bookingId],
    queryFn: () => getBookingTemplates(bookingId),
  });

  const handleGenerate = async (templateId: number) => {
    try {
      const response = await apiClient.get(
        `/bookings/${bookingId}/generate-document/${templateId}/`, { responseType: 'blob' }
      );
      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `booking_${bookingId}_template_${templateId}.docx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      // Ответ запрашивался как файл, поэтому причина отказа (ошибка в метках
      // шаблона, снятая бронь) приходит Blob-ом — читаем её как JSON
      let reason: unknown = error;
      const data = (error as { response?: { data?: unknown } })?.response?.data;
      if (data instanceof Blob) {
        try {
          reason = { response: { data: JSON.parse(await data.text()) } };
        } catch {
          // Не JSON — остаётся общее сообщение
        }
      }
      alert(extractApiError(reason, t('documents.generation_failed')));
    }
  };

  if (isLoading) return <CircularProgress size={24} />;
  // Отказ в доступе выглядел так же, как пустой список
  if (isError) {
    return <Alert severity="error">{extractApiError(error, t('documents.templates_failed'))}</Alert>;
  }
  if (!templates || templates.length === 0) {
    return <Alert severity="info">{t('documents.no_booking_templates')}</Alert>;
  }

  return (
    <List dense>
      {templates.map((template) => (
        <ListItem key={template.id} secondaryAction={
          <Button size="small" variant="contained" disabled={disabled}
                  onClick={() => handleGenerate(template.id)}>
            {t('documents.generate')}
          </Button>
        }>
          <ListItemIcon><DescriptionIcon /></ListItemIcon>
          <ListItemText primary={template.name} />
        </ListItem>
      ))}
    </List>
  );
}
