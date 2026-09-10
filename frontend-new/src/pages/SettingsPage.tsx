// real_estate_crm/frontend-new/src/pages/SettingsPage.tsx

import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Grid, Paper, Tabs, Tab } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getVisibleSettingsTabs } from '../utils/settingsTabs';
import ReasonManager from '../components/settings/ReasonManager';
import ApplicationStatusManager from '../components/settings/ApplicationStatusManager';
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
  active: boolean;
}

function TabPanel({ children, active }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={!active}>
      {active && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  // Пользователь видит только те вкладки, на ресурсы которых у него есть права
  const tabs = useMemo(() => getVisibleSettingsTabs(user), [user]);

  // Найти индекс вкладки по ID из URL параметра
  const getTabIndex = () => {
    if (!tabParam) return 0;
    const index = tabs.findIndex(tab => tab.id === tabParam);
    return index >= 0 ? index : 0;
  };

  const [tabValue, setTabValue] = useState(getTabIndex());

  // Синхронизация с URL при изменении параметра или состава вкладок
  useEffect(() => {
    setTabValue(getTabIndex());
  }, [tabParam, tabs]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setSearchParams({ tab: tabs[newValue].id });
  };

  const activeTabId = tabs[tabValue]?.id;

  if (tabs.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h5" color="error" gutterBottom>{t('errors.access_denied')}</Typography>
        <Typography variant="body1" color="text.secondary">{t('errors.no_view_permission')}</Typography>
      </Box>
    );
  }

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
            {tabs.map((tab) => (
              <Tab key={tab.id} label={t(tab.labelKey)} />
            ))}
          </Tabs>
        </Box>

        {/* Вкладка "Компании" */}
        <TabPanel active={activeTabId === 'companies'}>
          <CompaniesPage />
        </TabPanel>

        {/* Вкладка "Отделы" */}
        <TabPanel active={activeTabId === 'departments'}>
          <DepartmentsPage />
        </TabPanel>

        {/* Вкладка "Роли" */}
        <TabPanel active={activeTabId === 'roles'}>
          <RolesPage />
        </TabPanel>

        {/* Вкладка "Пользователи" */}
        <TabPanel active={activeTabId === 'users'}>
          <UsersPage />
        </TabPanel>

        {/* Вкладка "Заявки" */}
        <TabPanel active={activeTabId === 'applications'}>
          <Box sx={{ mb: 4 }}>
            <ApplicationStatusManager />
          </Box>
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
        <TabPanel active={activeTabId === 'realty'}>
            <Typography variant="h6" sx={{ mb: 2 }}>{t('pages.settings.building_types')}</Typography>
            <BuildingTypeManager />
        </TabPanel>

        {/* Вкладка "Финансы" */}
        <TabPanel active={activeTabId === 'finances'}>
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
        <TabPanel active={activeTabId === 'templates'}>
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
        <TabPanel active={activeTabId === 'api-keys'}>
          <PartnerAPIKeyManager />
        </TabPanel>

      </Paper>
    </Box>
  );
}