// real_estate_crm/frontend-new/src/components/settings/TemplateTagsCheatSheet.tsx

/**
 * Шпаргалка по меткам шаблонов договоров.
 *
 * Метки сгруппированы по таблицам, из которых берутся данные (клиент,
 * сделка, объект, дом и проект, менеджер). Фильтр после вертикальной черты
 * форматирует значение: разряды, сумма прописью, дата. Список совпадает
 * с приложением В «Описания информационного обеспечения».
 */

import { Alert, Box, Divider, List, ListItem, ListItemText, Paper, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

const code = { fontFamily: 'monospace', fontSize: '0.9rem' };

export default function TemplateTagsCheatSheet() {
  const { t } = useTranslation();

  const tags: Record<string, { tag: string; desc: string }[]> = {
    [t('template_tags.client')]: [
      { tag: '{{client.full_name}}', desc: t('template_tags.client_full_name') },
      { tag: '{{client.phone_number}}', desc: t('template_tags.client_phone') },
      { tag: '{{client.all_phones}}', desc: t('template_tags.client_all_phones') },
      { tag: '{{client.email}}', desc: t('template_tags.client_email') },
      { tag: '{{client.date_of_birth|date}}', desc: t('template_tags.client_birth_date') },
      { tag: '{{client.passport_series}}', desc: t('template_tags.client_passport_series') },
      { tag: '{{client.passport_number}}', desc: t('template_tags.client_passport_number') },
      { tag: '{{client.passport_issued_by}}', desc: t('template_tags.client_passport_issued_by') },
      { tag: '{{client.passport_issued_date|date}}', desc: t('template_tags.client_passport_issued_date') },
      { tag: '{{client.pinfl}}', desc: t('template_tags.client_pinfl') },
      { tag: '{{client.inn}}', desc: t('template_tags.client_inn') },
      { tag: '{{client.registration_address}}', desc: t('template_tags.client_address') },
    ],
    [t('template_tags.deal')]: [
      { tag: '{{deal.id}}', desc: t('template_tags.deal_id') },
      { tag: '{{deal.contract_number}}', desc: t('template_tags.deal_contract_number') },
      { tag: '{{deal.contract_date|date}}', desc: t('template_tags.deal_contract_date') },
      { tag: '{{deal.contract_price|money}}', desc: t('template_tags.deal_contract_price') },
      { tag: '{{deal.contract_price|amount_words}}', desc: t('template_tags.deal_price_words') },
      { tag: '{{deal.initial_price|money}}', desc: t('template_tags.deal_initial_price') },
      { tag: '{{deal.currency}}', desc: t('template_tags.deal_currency') },
      { tag: '{{deal.payment_plan.name}}', desc: t('template_tags.deal_payment_plan') },
      { tag: '{{deal.booking_end_date|date}}', desc: t('template_tags.deal_booking_end') },
      { tag: '{{first_payment.amount|money}}', desc: t('template_tags.first_payment') },
    ],
    [t('template_tags.property')]: [
      { tag: '{{property.unit_number}}', desc: t('template_tags.property_number') },
      { tag: '{{property.floor}}', desc: t('template_tags.property_floor') },
      { tag: '{{property.entrance}}', desc: t('template_tags.property_entrance') },
      { tag: '{{property.area|number}}', desc: t('template_tags.property_area') },
      { tag: '{{property.price|money}}', desc: t('template_tags.property_price') },
    ],
    [t('template_tags.building_project')]: [
      { tag: '{{building.name}}', desc: t('template_tags.building_name') },
      { tag: '{{building.address_detail}}', desc: t('template_tags.building_address') },
      { tag: '{{building.floors_count}}', desc: t('template_tags.building_floors') },
      { tag: '{{project.name}}', desc: t('template_tags.project_name') },
      { tag: '{{project.address}}', desc: t('template_tags.project_address') },
      { tag: '{{project.developer_details}}', desc: t('template_tags.project_developer') },
    ],
    [t('template_tags.manager')]: [
      { tag: '{{manager.last_name}}', desc: t('template_tags.manager_last_name') },
      { tag: '{{manager.first_name}}', desc: t('template_tags.manager_first_name') },
      { tag: '{{today|date}}', desc: t('template_tags.today') },
    ],
  };

  const filters = [
    { tag: '|money', desc: t('template_tags.filter_money') },
    { tag: '|number', desc: t('template_tags.filter_number') },
    { tag: '|amount_words', desc: t('template_tags.filter_amount_words') },
    { tag: '|words', desc: t('template_tags.filter_words') },
    { tag: '|amount_words_uz', desc: t('template_tags.filter_amount_words_uz') },
    { tag: '|words_uz_cyr', desc: t('template_tags.filter_words_uz_cyr') },
    { tag: '|amount_words_uz_cyr', desc: t('template_tags.filter_amount_words_uz_cyr') },
    { tag: '|date', desc: t('template_tags.filter_date') },
    { tag: '|date_text', desc: t('template_tags.filter_date_text') },
  ];

  return (
    <Paper>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>{t('template_tags.cheatsheet_title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('template_tags.cheatsheet_description')}</Typography>
      </Box>
      <List>
        {Object.entries(tags).map(([category, items]) => (
          <div key={category}>
            <ListItem>
              <ListItemText primary={<Typography variant="subtitle1" fontWeight="bold">{category}</Typography>} />
            </ListItem>
            {items.map(item => (
              <ListItem key={item.tag} sx={{ pl: 4 }}>
                <ListItemText primary={item.tag} secondary={item.desc} slotProps={{ primary: { sx: code } }} />
              </ListItem>
            ))}
            <Divider />
          </div>
        ))}

        <ListItem>
          <ListItemText
            primary={<Typography variant="subtitle1" fontWeight="bold">{t('template_tags.filters_title')}</Typography>}
            secondary={t('template_tags.filters_description', { example: '{{deal.contract_price|amount_words}}' })}
          />
        </ListItem>
        {filters.map(item => (
          <ListItem key={item.tag} sx={{ pl: 4 }}>
            <ListItemText primary={item.tag} secondary={item.desc} slotProps={{ primary: { sx: code } }} />
          </ListItem>
        ))}
        <Divider />

        <ListItem>
          <ListItemText
            primary={<Typography variant="subtitle1" fontWeight="bold">{t('template_tags.table_title')}</Typography>}
            secondary={t('template_tags.table_description')}
          />
        </ListItem>
        <Box sx={{ pl: 4, pr: 2, pb: 2 }}>
          <Typography component="pre" sx={{ ...code, whiteSpace: 'pre-wrap', m: 0 }}>
            {'{%tr for p in payments %}\n'
              + '{{ loop.index }} | {{ p.due_date|date }} | {{ p.amount|money }} | {{ p.payment_type.name }}\n'
              + '{%tr endfor %}'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{t('template_tags.table_rows')}</Typography>
        </Box>
      </List>
      <Box sx={{ px: 2, pb: 2 }}>
        <Alert severity="info">{t('template_tags.quotes_warning')}</Alert>
      </Box>
    </Paper>
  );
}
