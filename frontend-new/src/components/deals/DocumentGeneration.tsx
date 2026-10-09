// real_estate_crm/frontend-new/src/components/deals/DocumentGeneration.tsx

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getAvailableTemplates } from '../../api/templates';
import { Button, CircularProgress, Alert, List, ListItem, ListItemText, ListItemIcon } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import apiClient from '../../api/axios';
import type { Deal } from '../../api/deals';
import { extractApiError } from '../../utils/apiError';

interface DocumentGenerationProps {
  deal: Deal;
}

export default function DocumentGeneration({ deal }: DocumentGenerationProps) {
  const { t } = useTranslation();

  const { data: templates, isLoading } = useQuery({
    queryKey: ['availableTemplates', deal.id],
    queryFn: () => getAvailableTemplates(deal.id),
  });

  const handleGenerate = async (templateId: number) => {
    try {
        const url = `/deals/${deal.id}/generate-document/${templateId}/`;
        const response = await apiClient.get(url, { responseType: 'blob' });

        const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', `document_deal_${deal.id}_template_${templateId}.docx`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        // Ответ запрашивался как файл, поэтому причина отказа (ошибка в метках
        // шаблона, отменённая сделка) приходит Blob-ом — читаем её как JSON
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

  if (isLoading) return <CircularProgress />;

  if (!templates || templates.length === 0) {
    return <Alert severity="info">{t('documents.no_templates')}</Alert>;
  }

  return (
    <List>
      {templates.map(template => (
        <ListItem key={template.id} secondaryAction={
          <Button variant="contained" onClick={() => handleGenerate(template.id)}>
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