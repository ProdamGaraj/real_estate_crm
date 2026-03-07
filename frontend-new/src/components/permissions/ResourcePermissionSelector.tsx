import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  ExtendedPermissions,
  CompanyPermissions,
} from '../../utils/permissionHierarchyV2';
import {
  emptyCrudPermissions,
  emptyExtendedPermissions,
  applyCompanySelectAll,
  updateCompanyCrud,
  updateDepartmentCrud,
} from '../../utils/permissionHierarchyV2';
import type { Company, Department } from '../../api/permissions';

// Ресурсы, для которых показываются расширенные действия
const RESOURCES_WITH_EXTENDED_ACTIONS = ['TASK'];

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
  labels: {
    view: string;
    add: string;
    edit: string;
    delete: string;
  };
}

const CrudCheckboxes: React.FC<CrudCheckboxesProps> = React.memo(
  ({ permissions, onChange, disabled, labels }) => {
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
          label={labels.view}
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
          label={labels.add}
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
          label={labels.edit}
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
          label={labels.delete}
        />
      </Stack>
    );
  }
);

CrudCheckboxes.displayName = 'CrudCheckboxes';

// Компонент для расширенных чекбоксов (ASSIGN, EDIT_IN_PROGRESS, REOPEN, FORCE_EDIT)
interface ExtendedCheckboxesProps {
  permissions: ExtendedPermissions;
  onChange: (action: keyof ExtendedPermissions, value: boolean) => void;
  disabled?: boolean;
  labels: {
    assign: string;
    edit_in_progress: string;
    reopen: string;
    force_edit: string;
  };
}

const ExtendedCheckboxes: React.FC<ExtendedCheckboxesProps> = React.memo(
  ({ permissions, onChange, disabled, labels }) => {
    return (
      <Stack direction="row" spacing={2} sx={{ pl: 2, flexWrap: 'wrap' }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={permissions.assign}
              onChange={(e) => onChange('assign', e.target.checked)}
              disabled={disabled}
            />
          }
          label={labels.assign}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={permissions.edit_in_progress}
              onChange={(e) => onChange('edit_in_progress', e.target.checked)}
              disabled={disabled}
            />
          }
          label={labels.edit_in_progress}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={permissions.reopen}
              onChange={(e) => onChange('reopen', e.target.checked)}
              disabled={disabled}
            />
          }
          label={labels.reopen}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={permissions.force_edit}
              onChange={(e) => onChange('force_edit', e.target.checked)}
              disabled={disabled}
            />
          }
          label={labels.force_edit}
        />
      </Stack>
    );
  }
);

ExtendedCheckboxes.displayName = 'ExtendedCheckboxes';

// Обертка с React.memo для оптимизации
const ResourcePermissionSelector = React.memo(function ResourcePermissionSelector({
  resourceName,
  resourceLabel,
  permissions,
  companies,
  departments,
  onChange,
  userCompanyId,
}: ResourcePermissionSelectorProps) {
  const { t } = useTranslation();

  const showExtended = RESOURCES_WITH_EXTENDED_ACTIONS.includes(resourceName);
  
  // Мемоизируем переводы для CRUD операций
  const crudLabels = useMemo(() => ({
    view: t('pages.settings.permissions.action_view'),
    add: t('pages.settings.permissions.action_add'),
    edit: t('pages.settings.permissions.action_edit'),
    delete: t('pages.settings.permissions.action_delete'),
  }), [t]);

  // Мемоизируем переводы для расширенных действий
  const extendedLabels = useMemo(() => ({
    assign: t('pages.settings.permissions.action_assign'),
    edit_in_progress: t('pages.settings.permissions.action_edit_in_progress'),
    reopen: t('pages.settings.permissions.action_reopen'),
    force_edit: t('pages.settings.permissions.action_force_edit'),
  }), [t]);
  
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

  // Обработчик для "Мои" расширенные
  const handleOwnExtendedChange = useCallback(
    (action: keyof ExtendedPermissions, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        ownExtended: {
          ...current.ownExtended,
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

  // Обработчик для "Система" расширенные
  const handleSystemExtendedChange = useCallback(
    (action: keyof ExtendedPermissions, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        systemExtended: {
          ...current.systemExtended,
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
        companyExtended: emptyExtendedPermissions(),
        departments: companyDepartments.map((dept) => ({
          departmentId: dept.id,
          permissions: emptyCrudPermissions(),
          extendedPermissions: emptyExtendedPermissions(),
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

  // Обработчик для расширенных действий компании
  const handleCompanyExtendedChange = useCallback(
    (companyId: number, action: keyof ExtendedPermissions, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        companies: current.companies.map((company) =>
          company.companyId === companyId
            ? { ...company, companyExtended: { ...company.companyExtended, [action]: value } }
            : company
        ),
      });
    },
    [onChange]
  );

  // Обработчик для расширенных действий отдела
  const handleDepartmentExtendedChange = useCallback(
    (companyId: number, departmentId: number, action: keyof ExtendedPermissions, value: boolean) => {
      const current = permissionsRef.current;
      onChange({
        ...current,
        companies: current.companies.map((company) =>
          company.companyId === companyId
            ? {
                ...company,
                departments: company.departments.map((dept) =>
                  dept.departmentId === departmentId
                    ? { ...dept, extendedPermissions: { ...dept.extendedPermissions, [action]: value } }
                    : dept
                ),
              }
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
              {t('pages.settings.permissions.my_resource', { resource: resourceLabel.toLowerCase() })}
            </Typography>
            <CrudCheckboxes permissions={permissions.own} onChange={handleOwnChange} labels={crudLabels} />
            {showExtended && (
              <ExtendedCheckboxes permissions={permissions.ownExtended} onChange={handleOwnExtendedChange} labels={extendedLabels} />
            )}
          </Box>

          <Divider />

          {/* 2. КОМПАНИИ И ОТДЕЛЫ */}
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
              {t('pages.settings.permissions.companies_and_departments')}
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
                                {t('common.select_all')}
                              </Typography>
                            }
                          />
                        </Box>
                        <Chip
                          label={t('common.delete')}
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
                          {t('pages.settings.permissions.at_company_level')}:
                        </Typography>
                        <CrudCheckboxes
                          permissions={company.companyLevel}
                          onChange={(action, value) =>
                            handleCompanyCrudChange(company.companyId, action, value)
                          }
                          labels={crudLabels}
                        />
                        {showExtended && (
                          <ExtendedCheckboxes
                            permissions={company.companyExtended}
                            onChange={(action, value) =>
                              handleCompanyExtendedChange(company.companyId, action, value)
                            }
                            labels={extendedLabels}
                          />
                        )}
                      </Box>

                      {/* Отделы компании */}
                      {company.departments.length > 0 && (
                        <Box sx={{ pl: 2 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {t('pages.settings.permissions.departments')}:
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
                                    labels={crudLabels}
                                  />
                                  {showExtended && (
                                    <ExtendedCheckboxes
                                      permissions={dept.extendedPermissions}
                                      onChange={(action, value) =>
                                        handleDepartmentExtendedChange(
                                          company.companyId,
                                          dept.departmentId,
                                          action,
                                          value
                                        )
                                      }
                                      labels={extendedLabels}
                                    />
                                  )}
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
                    {t('pages.settings.permissions.add_company')}:
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
                {t('pages.settings.permissions.scope_system')}
              </Typography>
              <CrudCheckboxes permissions={permissions.system} onChange={handleSystemChange} labels={crudLabels} />
              {showExtended && (
                <ExtendedCheckboxes permissions={permissions.systemExtended} onChange={handleSystemExtendedChange} labels={extendedLabels} />
              )}
            </Box>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

export default ResourcePermissionSelector;
