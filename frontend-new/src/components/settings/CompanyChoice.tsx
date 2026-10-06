// real_estate_crm/frontend-new/src/components/settings/CompanyChoice.tsx

/**
 * Выбор компании новой записи справочника — только для системного администратора.
 *
 * Без выбора запись администратора попадала в его служебную компанию
 * («СИСТЕМА») и была не видна рабочим компаниям. Пустое значение — общая
 * запись для всех компаний.
 */

import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getCompanies } from '../../api/permissions';

interface CompanyChoiceProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export default function CompanyChoice({ value, onChange }: CompanyChoiceProps) {
  const { t } = useTranslation();
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: () => getCompanies() });
  return (
    <FormControl size="small" fullWidth>
      <InputLabel shrink>{t('common.company')}</InputLabel>
      <Select
        label={t('common.company')}
        displayEmpty
        notched
        value={value ?? ''}
        onChange={(e) => {
          const next = e.target.value as number | '';
          onChange(next === '' ? null : Number(next));
        }}
      >
        <MenuItem value="">{t('pages.settings.finance_refs.shared')}</MenuItem>
        {companies?.map(company => <MenuItem key={company.id} value={company.id}>{company.name}</MenuItem>)}
      </Select>
    </FormControl>
  );
}
