// real_estate_crm/frontend-new/src/pages/SettingsPage.tsx

import { useState, useEffect } from 'react';
import { Box, Typography, Grid, Paper, Tabs, Tab } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import ReasonManager from '../components/settings/ReasonManager';
import BuildingTypeManager from '../components/settings/BuildingTypeManager';
import PaymentTypeManager from '../components/settings/PaymentTypeManager';
import BeneficiaryAccountManager from '../components/settings/BeneficiaryAccountManager';
import TemplateManager from '../components/settings/TemplateManager';
import TemplateTagsCheatSheet from '../components/settings/TemplateTagsCheatSheet';
import PartnerAPIKeyManager from '../components/settings/PartnerAPIKeyManager';
import CompaniesPage from './permissions/CompaniesPage';
import DepartmentsPage from './permissions/DepartmentsPage';
import RolesPage from './permissions/RolesPage';
import UsersPage from './permissions/UsersPage';

// Вспомогательный компонент TabPanel
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const TABS = [
  { id: 'companies', labelKey: 'pages.settings.companies_tab' },
  { id: 'departments', labelKey: 'pages.settings.departments_tab' },
  { id: 'roles', labelKey: 'pages.settings.roles_tab' },
  { id: 'users', labelKey: 'pages.settings.users_tab' },
  { id: 'applications', labelKey: 'pages.settings.applications_tab' },
  { id: 'realty', labelKey: 'pages.settings.realty_tab' },
  { id: 'finances', labelKey: 'pages.settings.finances_tab' },
  { id: 'templates', labelKey: 'pages.settings.templates_tab' },
  { id: 'api-keys', labelKey: 'pages.settings.api_keys_tab' },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  
  // Найти индекс вкладки по ID из URL параметра
  const getTabIndex = () => {
    if (!tabParam) return 0;
    const index = TABS.findIndex(tab => tab.id === tabParam);
    return index >= 0 ? index : 0;
  };

  const [tabValue, setTabValue] = useState(getTabIndex());

  // Синхронизация с URL при изменении параметра
  useEffect(() => {
    setTabValue(getTabIndex());
  }, [tabParam]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setSearchParams({ tab: TABS[newValue].id });
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>{t('pages.settings.title')}</Typography>
      <Paper>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
          >
            {TABS.map((tab) => (
              <Tab key={tab.id} label={t(tab.labelKey)} />
            ))}
          </Tabs>
        </Box>

        {/* Вкладка "Компании" */}
        <TabPanel value={tabValue} index={0}>
          <CompaniesPage />
        </TabPanel>

        {/* Вкладка "Отделы" */}
        <TabPanel value={tabValue} index={1}>
          <DepartmentsPage />
        </TabPanel>

        {/* Вкладка "Роли" */}
        <TabPanel value={tabValue} index={2}>
          <RolesPage />
        </TabPanel>

        {/* Вкладка "Пользователи" */}
        <TabPanel value={tabValue} index={3}>
          <UsersPage />
        </TabPanel>

        {/* Вкладка "Заявки" */}
        <TabPanel value={tabValue} index={4}>
          <Typography variant="h6" sx={{ mb: 2 }}>{t('pages.settings.rejection_reasons_title')}</Typography>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <ReasonManager title={t('pages.settings.junk_reasons')} reasonType="JUNK" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <ReasonManager title={t('pages.settings.rejection_reasons')} reasonType="REJECTED" />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Вкладка "Недвижимость" */}
        <TabPanel value={tabValue} index={5}>
            <Typography variant="h6" sx={{ mb: 2 }}>{t('pages.settings.building_types')}</Typography>
            <BuildingTypeManager />
        </TabPanel>

        {/* Вкладка "Финансы" */}
        <TabPanel value={tabValue} index={6}>
           <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <PaymentTypeManager />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <BeneficiaryAccountManager />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Вкладка "Шаблоны" */}
        <TabPanel value={tabValue} index={7}>
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 7 }}>
              <TemplateManager />
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <TemplateTagsCheatSheet />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Вкладка "API-ключи" */}
        <TabPanel value={tabValue} index={8}>
          <PartnerAPIKeyManager />
        </TabPanel>

      </Paper>
    </Box>
  );
}