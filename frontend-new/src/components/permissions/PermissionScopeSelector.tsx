import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  FormControlLabel,
  Checkbox,
  FormGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Chip,
  ListItemText,
} from '@mui/material';
import { applyScopeRules } from '../../utils/permissionHierarchy';
import type { PermissionScope } from '../../utils/permissionHierarchy';
import type { Company, Department } from '../../api/permissions';
import type { SelectChangeEvent } from '@mui/material';

interface PermissionScopeSelectorProps {
  scope: PermissionScope;
  companies: Company[];
  departments: Department[];
  onChange: (newScope: PermissionScope) => void;
}

export default function PermissionScopeSelector({
  scope,
  companies,
  departments,
  onChange,
}: PermissionScopeSelectorProps) {
  const { t } = useTranslation();
  
  // Обработчик изменения "Мои"
  const handleOwnChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newScope = applyScopeRules(
      { ...scope, own: e.target.checked },
      'own'
    );
    onChange(newScope);
  }, [scope, onChange]);

  // Обработчик изменения выбора отделов
  const handleDepartmentsChange = useCallback((event: SelectChangeEvent<number[]>) => {
    const value = event.target.value;
    const selectedIds = typeof value === 'string' ? [] : value;
    
    const newScope = applyScopeRules(
      { ...scope, departments: selectedIds },
      'departments'
    );
    onChange(newScope);
  }, [scope, onChange]);

  // Обработчик изменения выбора компаний
  const handleCompaniesChange = useCallback((event: SelectChangeEvent<number[]>) => {
    const value = event.target.value;
    const selectedIds = typeof value === 'string' ? [] : value;
    
    const newScope = applyScopeRules(
      { ...scope, companies: selectedIds },
      'companies'
    );
    onChange(newScope);
  }, [scope, onChange]);

  // Обработчик изменения "Всей системы"
  const handleSystemChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newScope = applyScopeRules(
      { ...scope, system: e.target.checked },
      'system'
    );
    onChange(newScope);
  }, [scope, onChange]);

  return (
    <Box sx={{ pl: 2 }}>
      <FormGroup>
        {/* Мои */}
        <FormControlLabel
          control={
            <Checkbox
              checked={scope.own}
              onChange={handleOwnChange}
              size="small"
            />
          }
          label={t('pages.settings.permissions.scope_own')}
        />

        {/* Отделы - выпадающий список с множественным выбором */}
        {departments.length > 0 && (
          <FormControl fullWidth size="small" sx={{ mt: 1, mb: 1 }}>
            <InputLabel id="departments-select-label">{t('pages.settings.permissions.departments')}</InputLabel>
            <Select
              labelId="departments-select-label"
              multiple
              value={scope.departments}
              onChange={handleDepartmentsChange}
              input={<OutlinedInput label={t('pages.settings.permissions.departments')} />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id) => {
                    const dept = departments.find((d) => d.id === id);
                    return (
                      <Chip
                        key={id}
                        label={dept?.name || id}
                        size="small"
                        sx={{ height: 24 }}
                      />
                    );
                  })}
                </Box>
              )}
            >
              {departments.map((dept) => (
                <MenuItem key={dept.id} value={dept.id}>
                  <Checkbox
                    checked={scope.departments.includes(dept.id)}
                    size="small"
                  />
                  <ListItemText
                    primary={dept.name}
                    secondary={dept.company_name}
                  />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Компании - выпадающий список с множественным выбором */}
        {companies.length > 0 && (
          <FormControl fullWidth size="small" sx={{ mt: 1, mb: 1 }}>
            <InputLabel id="companies-select-label">{t('pages.settings.permissions.companies')}</InputLabel>
            <Select
              labelId="companies-select-label"
              multiple
              value={scope.companies}
              onChange={handleCompaniesChange}
              input={<OutlinedInput label={t('pages.settings.permissions.companies')} />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((id) => {
                    const company = companies.find((c) => c.id === id);
                    return (
                      <Chip
                        key={id}
                        label={company?.name || id}
                        size="small"
                        sx={{ height: 24 }}
                      />
                    );
                  })}
                </Box>
              )}
            >
              {companies.map((company) => (
                <MenuItem key={company.id} value={company.id}>
                  <Checkbox
                    checked={scope.companies.includes(company.id)}
                    size="small"
                  />
                  <ListItemText primary={company.name} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* Всей системы */}
        <FormControlLabel
          control={
            <Checkbox
              checked={scope.system}
              onChange={handleSystemChange}
              size="small"
            />
          }
          label={t('pages.settings.permissions.scope_system')}
        />
      </FormGroup>
    </Box>
  );
}
