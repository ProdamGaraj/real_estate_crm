import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  AppBar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Divider,
} from '@mui/material';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import EventIcon from '@mui/icons-material/Event';
import ChecklistIcon from '@mui/icons-material/Checklist';
// Иконки
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssignmentIcon from '@mui/icons-material/Assignment';
import SettingsIcon from '@mui/icons-material/Settings';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import PaymentsIcon from '@mui/icons-material/Payments';
import AssessmentIcon from '@mui/icons-material/Assessment';
import LogoutIcon from '@mui/icons-material/Logout';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useAuthStore } from '../store/authStore';
import { hasAnyViewPermission, isSystemAdmin } from '../utils/permissions';
import type { ResourceType } from '../utils/permissions';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';

const drawerWidth = 240;

interface NavItem {
  textKey: string; // i18n key for translation
  icon: React.ReactElement;
  path: string;
  resource?: ResourceType; // Ресурс для проверки прав
  requireAdmin?: boolean; // Требуется ли админ
}

const navItems: NavItem[] = [
  { textKey: 'nav.dashboard', icon: <DashboardIcon />, path: '/dashboard', resource: 'DASHBOARD' },
  { textKey: 'nav.clients', icon: <PeopleIcon />, path: '/clients', resource: 'CLIENT' },
  { textKey: 'nav.applications', icon: <AssignmentIcon />, path: '/applications', resource: 'APPLICATION' },
  { textKey: 'nav.meetings', icon: <EventIcon />, path: '/meetings', resource: 'MEETING' },
  { textKey: 'nav.tasks', icon: <ChecklistIcon />, path: '/tasks', resource: 'TASK' },
  { textKey: 'nav.deals', icon: <BusinessCenterIcon />, path: '/deals', resource: 'DEAL' },
  { textKey: 'nav.projects', icon: <AccountBalanceIcon />, path: '/projects', resource: 'PROJECT' },
  { textKey: 'nav.finances', icon: <PaymentsIcon />, path: '/finances', resource: 'PAYMENT' },
  { textKey: 'nav.reports', icon: <AssessmentIcon />, path: '/reports', resource: 'REPORT' },
  { textKey: 'nav.discounts', icon: <LocalOfferIcon />, path: '/discounts', resource: 'DISCOUNT' },
  { textKey: 'nav.settings', icon: <SettingsIcon />, path: '/settings?tab=companies', requireAdmin: true },
];

export default function RootLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Фильтруем пункты меню на основе прав доступа
  const visibleNavItems = useMemo(() => {
    return navItems.filter(item => {
      // Пункты без resource и без requireAdmin - НЕ отображаются (все пункты должны иметь проверку)
      if (!item.resource && !item.requireAdmin) {
        return false;
      }

      // Проверяем требование администратора
      if (item.requireAdmin) {
        return isSystemAdmin(user);
      }

      // Проверяем наличие VIEW разрешения на ресурс
      if (item.resource) {
        return hasAnyViewPermission(user, item.resource);
      }

      return false;
    });
  }, [user]);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getUserDisplayName = () => {
    if (user?.user_full_name) {
      return user.user_full_name;
    }
    return user?.user_username || t('common.user');
  };

  const getUserInitials = () => {
    if (user?.user_full_name) {
      const parts = user.user_full_name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return user.user_full_name.substring(0, 2).toUpperCase();
    }
    if (user?.user_username) {
      return user.user_username.substring(0, 2).toUpperCase();
    }
    return 'UN';
  };

  return (
    <Box sx={{ display: 'flex', bgcolor: 'background.default', height: '100vh', overflow: 'hidden' }}>
      {/* AppBar с информацией о пользователе */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: 1,
        }}
      >
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            {t('nav.app_title')}
          </Typography>

          {/* Theme Switcher */}
          <ThemeSwitcher />

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Информация о пользователе */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ mr: 1 }}>
              {getUserDisplayName()}
            </Typography>
            <IconButton onClick={handleMenuOpen} size="small">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                {getUserInitials()}
              </Avatar>
            </IconButton>
          </Box>

          {/* Меню пользователя */}
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            <MenuItem disabled>
              <AccountCircleIcon sx={{ mr: 1 }} />
              {user?.email || t('nav.no_email')}
            </MenuItem>
            {user?.company_name && (
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  {t('nav.company_label')} {user.company_name}
                </Typography>
              </MenuItem>
            )}
            {user?.department_name && (
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  {t('nav.department_label')} {user.department_name}
                </Typography>
              </MenuItem>
            )}
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1 }} />
              {t('nav.logout')}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Боковое меню */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {visibleNavItems.map((item) => (
              <ListItem key={item.textKey} disablePadding>
                <ListItemButton component={Link} to={item.path}>
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={t(item.textKey)} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      {/* Основной контент */}
      <Box component="main" sx={{
        flexGrow: 1,
        p: 3,
        bgcolor: 'background.default',
        height: 'calc(100vh - 64px)',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}