import { Typography, Box, List, ListItem, ListItemText } from '@mui/material';
import { useTranslation } from 'react-i18next';

// Тип для лога (универсальный)
interface Log {
    action: string;
}

interface HumanizedLogProps {
    log: Log;
}

export default function HumanizedLog({ log }: HumanizedLogProps) {
    const { t } = useTranslation();
    const { action } = log;

    // Словарь для перевода технических имен полей в человекочитаемые
    const fieldNameMap: Record<string, string> = {
        full_name: t('logs.fields.full_name'),
        phone_number: t('logs.fields.phone_number'),
        email: t('logs.fields.email'),
        status: t('logs.fields.status'),
        comment: t('logs.fields.comment'),
        notes: t('logs.fields.notes'),
        contract_price: t('logs.fields.contract_price'),
        rejection_reason: t('logs.fields.rejection_reason'),
        name: t('logs.fields.name'),
        percentage_value: t('logs.fields.percentage_value'),
        property_type: t('logs.fields.property_type'),
        start_date: t('logs.fields.start_date'),
        end_date: t('logs.fields.end_date'),
        // Добавляйте другие поля по мере необходимости
    };

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
            from: from === 'пусто' ? <em>({t('logs.empty')})</em> : `'${from}'`,
            to: to === 'пусто' ? <em>({t('logs.empty')})</em> : `'${to}'`,
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