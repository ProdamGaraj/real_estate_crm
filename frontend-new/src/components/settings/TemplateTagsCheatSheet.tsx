// real_estate_crm/frontend-new/src/components/settings/TemplateTagsCheatSheet.tsx

import { Box, Paper, Typography, List, ListItem, ListItemText, Divider } from '@mui/material';

const tags = {
  "Клиент": [
    { tag: '{{client.full_name}}', desc: 'ФИО клиента' },
    { tag: '{{client.phone_number}}', desc: 'Основной номер телефона' },
    { tag: '{{client.email}}', desc: 'Email' },
    { tag: '{{client.passport_series}}', desc: 'Серия паспорта' },
    { tag: '{{client.passport_number}}', desc: 'Номер паспорта' },
  ],
  "Сделка": [
    { tag: '{{deal.id}}', desc: 'ID сделки' },
    { tag: '{{deal.contract_number}}', desc: 'Номер договора' },
    { tag: '{{deal.contract_date}}', desc: 'Дата договора' },
    { tag: '{{deal.contract_price}}', desc: 'Стоимость по договору' },
    { tag: '{{deal.booking_end_date}}', desc: 'Дата окончания брони' },
  ],
  "Объект": [
    { tag: '{{property.unit_number}}', desc: 'Номер объекта' },
    { tag: '{{property.floor}}', desc: 'Этаж' },
    { tag: '{{property.area}}', desc: 'Площадь' },
    { tag: '{{property.price}}', desc: 'Стоимость (начальная)' },
  ],
  "Дом и Проект": [
    { tag: '{{building.name}}', desc: 'Название дома/корпуса' },
    { tag: '{{project.name}}', desc: 'Название ЖК' },
  ]
};

export default function TemplateTagsCheatSheet() {
  return (
    <Paper>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Шпаргалка по меткам</Typography>
        <Typography variant="body2" color="text.secondary">Используйте эти метки в .docx файле. Они будут автоматически заменены на реальные данные при генерации документа.</Typography>
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