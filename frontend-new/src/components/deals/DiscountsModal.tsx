import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getAvailableDiscounts } from '../../api/deals';
import type { Discount } from '../../api/discounts';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem,
  ListItemText, Checkbox, CircularProgress, Alert, FormControlLabel, Switch
} from '@mui/material';

interface DiscountsModalProps {
  open: boolean;
  dealId: number;
  basePrice: number; // Начальная цена для расчета
  appliedDiscountIds: number[];
  onClose: () => void;
  // Возвращаем и новую цену, и ID скидок
  onSave: (newPrice: number, selectedIds: number[]) => void;
}

export default function DiscountsModal({ open, dealId, basePrice, appliedDiscountIds, onClose, onSave }: DiscountsModalProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<number[]>(appliedDiscountIds);
  const [shouldRound, setShouldRound] = useState(false); // Состояние для округления

  // Сбрасываем состояние при каждом открытии
  useEffect(() => {
    if (open) {
      setSelectedIds(appliedDiscountIds);
      setShouldRound(false);
    }
  }, [open, appliedDiscountIds]);

  const { data: availableDiscounts, isLoading, isError } = useQuery({
    queryKey: ['availableDiscounts', dealId],
    queryFn: () => getAvailableDiscounts(dealId),
    enabled: open,
  });

  const handleToggle = (id: number) => {
    const newChecked = selectedIds.includes(id)
      ? selectedIds.filter(i => i !== id)
      : [...selectedIds, id];
    setSelectedIds(newChecked);
  };

  const handleSave = () => {
    if (!availableDiscounts) return;

    // 1. Находим полные объекты выбранных скидок
    const selectedDiscounts = availableDiscounts.filter(d => selectedIds.includes(d.id));

    // 2. Суммируем их проценты
    const totalDiscountPercent = selectedDiscounts.reduce(
      (sum, d) => sum + parseFloat(d.percentage_value),
      0
    );

    // 3. Рассчитываем итоговую цену
    let finalPrice = basePrice * (1 - totalDiscountPercent / 100);

    // 4. Округляем, если нужно
    if (shouldRound) {
      finalPrice = Math.round(finalPrice);
    }

    onSave(finalPrice, selectedIds);
  };


  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('pages.discounts.apply_discounts')}</DialogTitle>
      <DialogContent>
        {isLoading && <CircularProgress />}
        {isError && <Alert severity="error">{t('pages.discounts.load_error')}</Alert>}
        {availableDiscounts && (
          <>
            <List>
              {availableDiscounts.map((discount) => (
                <ListItem key={discount.id} dense button onClick={() => handleToggle(discount.id)}>
                  <Checkbox
                    edge="start"
                    checked={selectedIds.includes(discount.id)}
                    tabIndex={-1}
                    disableRipple
                  />
                  <ListItemText
                    primary={`${discount.name} (${discount.percentage_value}%)`}
                    secondary={discount.comment}
                  />
                </ListItem>
              ))}
            </List>
            <FormControlLabel
              control={
                <Switch
                  checked={shouldRound}
                  onChange={(e) => setShouldRound(e.target.checked)}
                />
              }
              label={t('pages.discounts.round_result')}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={handleSave} variant="contained">{t('common.apply')}</Button>
      </DialogActions>
    </Dialog>
  );
}