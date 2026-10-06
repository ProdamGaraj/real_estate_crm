import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getAvailableDiscounts } from '../../api/deals';
import { discountFitsPlan, type Discount } from '../../api/discounts';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemButton,
  ListItemText, Checkbox, CircularProgress, Alert, FormControlLabel, Switch
} from '@mui/material';

interface DiscountsModalProps {
  open: boolean;
  dealId: number;
  basePrice: number; // Начальная цена для расчета
  appliedDiscountIds: number[];
  /** План оплаты сделки: скидки «только для планов» применимы лишь при подходящем плане */
  dealPlanId?: number | null;
  onClose: () => void;
  // Возвращаем и новую цену, и ID скидок
  onSave: (newPrice: number, selectedIds: number[]) => void;
}

export default function DiscountsModal({ open, dealId, basePrice, appliedDiscountIds, dealPlanId, onClose, onSave }: DiscountsModalProps) {
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
    let finalPrice = Math.round(basePrice * (100 - totalDiscountPercent)) / 100;

    // 4. Округляем, если нужно — вниз: цену больше, чем со скидками, сервер не примет
    if (shouldRound) {
      finalPrice = Math.floor(finalPrice);
    }

    onSave(finalPrice, selectedIds);
  };


  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('pages.discounts.applying_discounts')}</DialogTitle>
      <DialogContent>
        {isLoading && <CircularProgress />}
        {isError && <Alert severity="error">{t('errors.load_discounts_error')}</Alert>}
        {availableDiscounts && (
          <>
            <List>
              {availableDiscounts.map((discount) => {
                // Скидку «только для планов» при другом плане отметить нельзя; снять — можно
                const fits = discountFitsPlan(discount, dealPlanId);
                const checked = selectedIds.includes(discount.id);
                const restriction = discount.payment_plans?.length
                  ? t('pages.discounts.only_for_plans', { plans: discount.payment_plans_info.join(', ') })
                  : '';
                return (
                  <ListItem key={discount.id} disablePadding>
                    <ListItemButton dense disabled={!fits && !checked} onClick={() => handleToggle(discount.id)}>
                      <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                      <ListItemText
                        primary={`${discount.name} (${discount.percentage_value}%)`}
                        secondary={[discount.comment, restriction, !fits ? t('pages.discounts.choose_plan_first') : '']
                          .filter(Boolean).join(' · ')}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
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