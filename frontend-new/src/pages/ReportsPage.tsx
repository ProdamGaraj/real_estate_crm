import { useState } from 'react';
import { Box, Typography, Paper, Tabs, Tab } from '@mui/material';
import { useTranslation } from 'react-i18next';
import ProjectReport from '../components/reports/ProjectReport';
import EmployeeReport from '../components/reports/EmployeeReport';
import { useIsMobile } from '../hooks/useMobile';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  isMobile?: boolean;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, isMobile = false, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: isMobile ? 1 : 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}


export default function ReportsPage() {
    const { t } = useTranslation();
    const isMobile = useIsMobile();
    const [tabValue, setTabValue] = useState(0);

    return (
        <Box>
            <Typography variant={isMobile ? 'h5' : 'h4'} sx={{ mb: isMobile ? 1 : 2 }}>{t('pages.reports.title')}</Typography>
            <Paper>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs 
                        value={tabValue} 
                        onChange={(_e, newValue) => setTabValue(newValue)}
                        variant={isMobile ? 'fullWidth' : 'standard'}
                    >
                        <Tab label={t('pages.reports.project_report')} />
                        <Tab label={t('pages.reports.employee_report')} />
                    </Tabs>
                </Box>
                <Box sx={{ p: isMobile ? 1 : 2 }}>
                    <TabPanel value={tabValue} index={0} isMobile={isMobile}>
                        <ProjectReport />
                    </TabPanel>
                    <TabPanel value={tabValue} index={1} isMobile={isMobile}>
                        <EmployeeReport />
                    </TabPanel>
                </Box>
            </Paper>
        </Box>
    );
}