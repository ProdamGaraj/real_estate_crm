import { useState } from 'react';
import { Box, Typography, Paper, Tabs, Tab } from '@mui/material';
import { useTranslation } from 'react-i18next';
import ProjectReport from '../components/reports/ProjectReport';
import EmployeeReport from '../components/reports/EmployeeReport';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}


export default function ReportsPage() {
    const { t } = useTranslation();
    const [tabValue, setTabValue] = useState(0);

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 2 }}>{t('pages.reports.title')}</Typography>
            <Paper>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
                        <Tab label={t('pages.reports.project_report')} />
                        <Tab label={t('pages.reports.employee_report')} />
                    </Tabs>
                </Box>
                <TabPanel value={tabValue} index={0}>
                    <ProjectReport />
                </TabPanel>
                <TabPanel value={tabValue} index={1}>
                    <EmployeeReport />
                </TabPanel>
            </Paper>
        </Box>
    );
}