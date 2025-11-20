import { Typography, Box, List, ListItem, ListItemText } from '@mui/material';

// Словарь для перевода технических имен полей в человекочитаемые
const fieldNameMap: Record<string, string> = {
    full_name: 'ФИО',
    phone_number: 'Номер телефона',
    email: 'Email',
    status: 'Статус',
    comment: 'Комментарий',
    notes: 'Заметки',
    contract_price: 'Стоимость по договору',
    rejection_reason: 'Причина отказа',
    name: 'Название',
    percentage_value: 'Процент',
    property_type: 'Тип недвижимости',
    start_date: 'Дата начала',
    end_date: 'Дата окончания',
    // Добавляйте другие поля по мере необходимости
};

// Тип для лога (универсальный)
interface Log {
    action: string;
}

interface HumanizedLogProps {
    log: Log;
}

export default function HumanizedLog({ log }: HumanizedLogProps) {
    const { action } = log;

    // Разбиваем строку на основное действие и детали
    const parts = action.split('. ');
    const mainAction = parts[0];
    const details = parts.length > 1 ? parts[1] : '';

    // Если деталей нет, просто выводим основное действие
    if (!details) {
        return <Typography>{mainAction}</Typography>;
    }

    // Разбираем детали на отдельные изменения
    const changes = details.split('; ').map(change => {
        const match = change.match(/Поле '(.+)' изменено с '(.+)' на '(.+)'/);
        if (!match) return null;

        const [, field, from, to] = match;
        return {
            field: fieldNameMap[field] || field, // Используем словарь или оставляем как есть
            from: from === 'пусто' ? <em>(пусто)</em> : `'${from}'`,
            to: to === 'пусто' ? <em>(пусто)</em> : `'${to}'`,
        };
    }).filter(Boolean); // Убираем null, если что-то не распарсилось

    return (
        <Box>
            <Typography fontWeight="bold">{mainAction}</Typography>
            {changes.length > 0 && (
                <List dense sx={{ pl: 2 }}>
                    {changes.map((change, index) => (
                        <ListItem key={index} disableGutters sx={{ p: 0 }}>
                            <ListItemText
                                primary={
                                    <Typography variant="body2">
                                        • <strong>{change.field}:</strong> {change.from} → {change.to}
                                    </Typography>
                                }
                            />
                        </ListItem>
                    ))}
                </List>
            )}
        </Box>
    );
}