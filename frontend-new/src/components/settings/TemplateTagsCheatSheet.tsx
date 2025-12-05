// real_estate_crm/frontend-new/src/components/settings/TemplateTagsCheatSheet.tsx

import { Box, Paper, Typography, List, ListItem, ListItemText, Divider } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function TemplateTagsCheatSheet() {
  const { t } = useTranslation();

  const tags = {
    [t('template_tags.client')]: [
      { tag: '{{client.full_name}}', desc: t('template_tags.client_full_name') },
      { tag: '{{client.phone_number}}', desc: t('template_tags.client_phone') },
      { tag: '{{client.email}}', desc: t('template_tags.client_email') },
      { tag: '{{client.passport_series}}', desc: t('template_tags.client_passport_series') },
      { tag: '{{client.passport_number}}', desc: t('template_tags.client_passport_number') },
    ],
    [t('template_tags.deal')]: [
      { tag: '{{deal.id}}', desc: t('template_tags.deal_id') },
      { tag: '{{deal.contract_number}}', desc: t('template_tags.deal_contract_number') },
      { tag: '{{deal.contract_date}}', desc: t('template_tags.deal_contract_date') },
      { tag: '{{deal.contract_price}}', desc: t('template_tags.deal_contract_price') },
      { tag: '{{deal.booking_end_date}}', desc: t('template_tags.deal_booking_end') },
    ],
    [t('template_tags.property')]: [
      { tag: '{{property.unit_number}}', desc: t('template_tags.property_number') },
      { tag: '{{property.floor}}', desc: t('template_tags.property_floor') },
      { tag: '{{property.area}}', desc: t('template_tags.property_area') },
      { tag: '{{property.price}}', desc: t('template_tags.property_price') },
    ],
    [t('template_tags.building_project')]: [
      { tag: '{{building.name}}', desc: t('template_tags.building_name') },
      { tag: '{{project.name}}', desc: t('template_tags.project_name') },
    ]
  };

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
                <ListItemText primary={item.tag} secondary={item.desc} />
              </ListItem>
            ))}
            <Divider />
          </div>
        ))}
      </List>
    </Paper>
  );
}