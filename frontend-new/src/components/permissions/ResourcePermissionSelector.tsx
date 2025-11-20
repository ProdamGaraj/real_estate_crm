import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type {
  ResourcePermissions,
  ScopeLevelPermissions,
  CompanyPermissions,
} from '../../utils/permissionHierarchyV2';
import {
  emptyCrudPermissions,
  applyCompanySelectAll,
  updateCompanyCrud,
  updateDepartmentCrud,
} from '../../utils/permissionHierarchyV2';
import type { Company, Department } from '../../api/permissions';

interface ResourcePermissionSelectorProps {
  resourceName: string;
  resourceLabel: string;
  permissions: ResourcePermissions;
  companies: Company[];
  departments: Department[];
  onChange: (newPermissions: ResourcePermissions) => void;
  // Ограничение для админа компании (может давать только разрешения своей компании)
  userCompanyId?: number;
}

// Компонент для чекбоксов CRUD операций
interface CrudCheckboxesProps {
  permissions: ScopeLevelPermissions;
  onChange: (action: keyof ScopeLevelPermissions, value: boolean) => void;
  disabled?: boolean;
}

const CrudCheckboxes: React.FC<CrudCheckboxesProps> = React.memo(
  ({ permissions, onChange, disabled }) => {
    return (
      <Stack direction="row" spacing={2} sx={{ pl: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={permissions.view}
              onChange={(e) => onChange('view', e.target.checked)}
              disabled={disabled}
            />
          }
          label="Просмотр"
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={permissions.add}
              onChange={(e) => onChange('add', e.target.checked)}
              disabled={disabled}
            />
          }
          label="Добавление"
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={permissions.edit}
              onChange={(e) => onChange('edit', e.target.checked)}
              disabled={disabled}
            />
          }
          label="Редактирование"
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={permissions.delete}
              onChange={(e) => onChange('delete', e.target.checked)}
              disabled={disabled}
            />
          }
          label="Удаление"
        />
      </Stack>
    );
  }
);

CrudCheckboxes.displayName = 'CrudCheckboxes';

// Обертка с React.memo для оптимизации
const ResourcePermissionSelector = React.memo(function ResourcePermissionSelector({
  resourceLabel,
  permissions,
  companies,
  departments,
  onChange,
  userCompanyId,
}: ResourcePermissionSelectorProps) {
  // Используем ref для хранения актуального permissions без пересоздания callbacks
  const permissionsRef = useRef(permissions);
  useEffect(() => {
    permissionsRef.current = permissions;
  }, [permissions]);

  // Обработчик для "Мои" - стабильный callback
  const handleOwnChange = useCallback(
    (action: keyof ScopeLevelPermissions, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        own: {
          ...current.own,
          [action]: value,
        },
      });
    },
    [onChange]
  );

  // Обработчик для "Система" - стабильный callback
  const handleSystemChange = useCallback(
    (action: keyof ScopeLevelPermissions, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        system: {
          ...current.system,
          [action]: value,
        },
      });
    },
    [onChange]
  );

  // Обработчик для добавления компании - стабильный callback
  const handleAddCompany = useCallback(
    (companyId: number) => {
      const current = permissionsRef.current;
      // Получаем отделы этой компании
      const companyDepartments = departments.filter((d) => d.company === companyId);

      const newCompany: CompanyPermissions = {
        companyId,
        companyLevel: emptyCrudPermissions(),
        departments: companyDepartments.map((dept) => ({
          departmentId: dept.id,
          permissions: emptyCrudPermissions(),
        })),
        selectAll: false,
      };

      onChange({
        ...current,
        companies: [...current.companies, newCompany],
      });
    },
    [departments, onChange]
  );

  // Обработчик для удаления компании - стабильный callback
  const handleRemoveCompany = useCallback(
    (companyId: number) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        companies: current.companies.filter((c) => c.companyId !== companyId),
      });
    },
    [onChange]
  );

  // Обработчик для "Выбрать всё" компании - стабильный callback
  const handleCompanySelectAll = useCallback(
    (companyId: number, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        companies: current.companies.map((company) =>
          company.companyId === companyId
            ? applyCompanySelectAll(company, value)
            : company
        ),
      });
    },
    [onChange]
  );

  // Обработчик для CRUD компании - стабильный callback
  const handleCompanyCrudChange = useCallback(
    (companyId: number, action: keyof ScopeLevelPermissions, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        companies: current.companies.map((company) =>
          company.companyId === companyId
            ? updateCompanyCrud(company, action, value)
            : company
        ),
      });
    },
    [onChange]
  );

  // Обработчик для CRUD отдела - стабильный callback
  const handleDepartmentCrudChange = useCallback(
    (companyId: number, departmentId: number, action: keyof ScopeLevelPermissions, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        companies: current.companies.map((company) =>
          company.companyId === companyId
            ? updateDepartmentCrud(company, departmentId, action, value)
            : company
        ),
      });
    },
    [onChange]
  );

  // Фильтруем компании (для админа компании только его компания)
  const availableCompanies = useMemo(() => {
    if (userCompanyId) {
      return companies.filter((c) => c.id === userCompanyId);
    }
    return companies;
  }, [companies, userCompanyId]);

  // Компании, которые еще не добавлены
  const notAddedCompanies = useMemo(() => {
    const addedIds = permissions.companies.map((c) => c.companyId);
    return availableCompanies.filter((c) => !addedIds.includes(c.id));
  }, [availableCompanies, permissions.companies]);

  return (
    <Accordion TransitionProps={{ timeout: 0 }} defaultExpanded={false}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">{resourceLabel}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={3}>
          {/* 1. МОИ */}
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Мои {resourceLabel.toLowerCase()}
            </Typography>
            <CrudCheckboxes permissions={permissions.own} onChange={handleOwnChange} />
          </Box>

          <Divider />

          {/* 2. КОМПАНИИ И ОТДЕЛЫ */}
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              Компании и отделы
            </Typography>

            <Stack spacing={2}>
              {/* Добавленные компании */}
              {permissions.companies.map((company) => {
                const companyData = companies.find((c) => c.id === company.companyId);
                if (!companyData) return null;

                return (
                  <Box key={company.companyId} sx={{ pl: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                    <Stack spacing={2}>
                      {/* Заголовок компании с кнопкой удаления */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {companyData.name}
                          </Typography>
                          <FormControlLabel
                            control={
                              <Checkbox
                                size="small"
                                checked={company.selectAll}
                                onChange={(e) =>
                                  handleCompanySelectAll(company.companyId, e.target.checked)
                                }
                              />
                            }
                            label={
                              <Typography variant="caption" color="primary">
                                Выбрать всё
                              </Typography>
                            }
                          />
                        </Box>
                        <Chip
                          label="Удалить"
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => handleRemoveCompany(company.companyId)}
                          sx={{ cursor: 'pointer' }}
                        />
                      </Box>

                      {/* CRUD для всей компании */}
                      <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          На уровне компании:
                        </Typography>
                        <CrudCheckboxes
                          permissions={company.companyLevel}
                          onChange={(action, value) =>
                            handleCompanyCrudChange(company.companyId, action, value)
                          }
                        />
                      </Box>

                      {/* Отделы компании */}
                      {company.departments.length > 0 && (
                        <Box sx={{ pl: 2 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Отделы:
                          </Typography>
                          <Stack spacing={1.5}>
                            {company.departments.map((dept) => {
                              const deptData = departments.find((d) => d.id === dept.departmentId);
                              if (!deptData) return null;

                              return (
                                <Box key={dept.departmentId} sx={{ pl: 2 }}>
                                  <Typography variant="body2" gutterBottom>
                                    {deptData.name}
                                  </Typography>
                                  <CrudCheckboxes
                                    permissions={dept.permissions}
                                    onChange={(action, value) =>
                                      handleDepartmentCrudChange(
                                        company.companyId,
                                        dept.departmentId,
                                        action,
                                        value
                                      )
                                    }
                                  />
                                </Box>
                              );
                            })}
                          </Stack>
                        </Box>
                      )}
                    </Stack>
                  </Box>
                );
              })}

              {/* Кнопка добавления компании */}
              {notAddedCompanies.length > 0 && (
                <Box sx={{ pl: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Добавить компанию:
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    {notAddedCompanies.map((company) => (
                      <Chip
                        key={company.id}
                        label={`+ ${company.name}`}
                        size="small"
                        color="primary"
                        variant="outlined"
                        onClick={() => handleAddCompany(company.id)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* 3. СИСТЕМА (только для системного админа) */}
          {!userCompanyId && (
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Вся система
              </Typography>
              <CrudCheckboxes permissions={permissions.system} onChange={handleSystemChange} />
            </Box>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

export default ResourcePermissionSelector;
