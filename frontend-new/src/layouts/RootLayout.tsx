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
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  SwipeableDrawer,
} from '@mui/material';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import EventIcon from '@mui/icons-material/Event';
import ChecklistIcon from '@mui/icons-material/Checklist';
import MenuIcon from '@mui/icons-material/Menu';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
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
import { SETTINGS_RESOURCES } from '../utils/settingsTabs';
import type { ResourceType } from '../utils/permissions';
import LanguageSwitcher from '../components/LanguageSwitcher';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useIsMobile, DRAWER_WIDTH, BOTTOM_NAV_HEIGHT } from '../hooks/useMobile';

const drawerWidth = DRAWER_WIDTH;

interface NavItem {
  textKey: string; // i18n key for translation
  icon: React.ReactElement;
  path: string;
  resource?: ResourceType; // Ресурс для проверки прав
  requireAdmin?: boolean; // Требуется ли админ
  anyResource?: ResourceType[]; // Достаточно права VIEW на любой из ресурсов
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
  { textKey: 'nav.settings', icon: <SettingsIcon />, path: '/settings', anyResource: SETTINGS_RESOURCES },
];

export default function RootLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

  // Фильтруем пункты меню на основе прав доступа
  const visibleNavItems = useMemo(() => {
    return navItems.filter(item => {
      // Пункты без проверки доступа НЕ отображаются
      if (!item.resource && !item.requireAdmin && !item.anyResource) {
        return false;
      }

      // Достаточно права на любой из ресурсов (раздел-агрегатор вроде «Настроек»)
      if (item.anyResource) {
        return isSystemAdmin(user) || item.anyResource.some(r => hasAnyViewPermission(user, r));
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

  // Пункты для Bottom Navigation (первые 4 + "Ещё")
  const bottomNavItems = useMemo(() => {
    return visibleNavItems.slice(0, 4);
  }, [visibleNavItems]);

  // Определяем текущий активный пункт для bottom nav
  const getCurrentBottomNavValue = () => {
    const currentPath = location.pathname;
    const index = bottomNavItems.findIndex(item => currentPath.startsWith(item.path.split('?')[0]));
    if (index !== -1) return index;
    // Если текущий путь не в первых 4, возвращаем "Ещё" (индекс 4)
    const isInMoreMenu = visibleNavItems.slice(4).some(item => 
      currentPath.startsWith(item.path.split('?')[0])
    );
    return isInMoreMenu ? 4 : 0;
  };

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

  const handleMobileDrawerToggle = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  const handleMobileDrawerClose = () => {
    setMobileDrawerOpen(false);
  };

  const handleMobileDrawerOpen = () => {
    setMobileDrawerOpen(true);
  };

  const handleBottomNavChange = (_event: React.SyntheticEvent, newValue: number) => {
    if (newValue === 4) {
      // "Ещё" - открываем drawer
      setMobileDrawerOpen(true);
    } else {
      navigate(bottomNavItems[newValue].path);
    }
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

  // Контент drawer (общий для desktop и mobile)
  const drawerContent = (
    <Box sx={{ overflow: 'auto' }}>
      <List>
        {visibleNavItems.map((item) => {
          const itemPath = item.path.split('?')[0];
          const isActive = location.pathname.startsWith(itemPath);
          return (
            <ListItem key={item.textKey} disablePadding>
              <ListItemButton 
                component={Link} 
                to={item.path}
                selected={isActive}
                onClick={isMobile ? handleMobileDrawerClose : undefined}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={t(item.textKey)} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

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
          {/* Hamburger menu для mobile */}
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleMobileDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Typography 
            variant="h6" 
            noWrap 
            component="div" 
            sx={{ 
              flexGrow: 1, 
              fontWeight: 'bold',
              fontSize: isMobile ? '1rem' : '1.25rem'
            }}
          >
            {t('nav.app_title')}
          </Typography>

          {/* Theme Switcher - скрыт на очень маленьких экранах */}
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <ThemeSwitcher />
          </Box>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Информация о пользователе */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Имя пользователя скрыто на mobile */}
            <Typography 
              variant="body2" 
              sx={{ 
                mr: 1,
                display: { xs: 'none', sm: 'block' }
              }}
            >
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
            {/* Theme switcher в меню для mobile */}
            {isMobile && (
              <>
                <Divider />
                <MenuItem>
                  <ThemeSwitcher />
                </MenuItem>
              </>
            )}
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1 }} />
              {t('nav.logout')}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Боковое меню - Desktop (permanent) */}
      {!isMobile && (
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
          {drawerContent}
        </Drawer>
      )}

      {/* Боковое меню - Mobile (swipeable) */}
      {isMobile && (
        <SwipeableDrawer
          variant="temporary"
          open={mobileDrawerOpen}
          onOpen={handleMobileDrawerOpen}
          onClose={handleMobileDrawerClose}
          ModalProps={{
            keepMounted: true, // Better performance on mobile
          }}
          sx={{
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
            },
          }}
        >
          <Toolbar />
          {drawerContent}
        </SwipeableDrawer>
      )}

      {/* Основной контент */}
      <Box 
        component="main" 
        sx={{
          flexGrow: 1,
          p: isMobile ? 2 : 3,
          pb: isMobile ? `${BOTTOM_NAV_HEIGHT + 16}px` : 3,
          bgcolor: 'background.default',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>

      {/* Bottom Navigation для mobile */}
      {isMobile && (
        <Paper 
          sx={{ 
            position: 'fixed', 
            bottom: 0, 
            left: 0, 
            right: 0,
            zIndex: (theme) => theme.zIndex.drawer + 1,
          }} 
          elevation={3}
        >
          <BottomNavigation
            showLabels
            value={getCurrentBottomNavValue()}
            onChange={handleBottomNavChange}
            sx={{
              height: BOTTOM_NAV_HEIGHT,
              '& .MuiBottomNavigationAction-root': {
                minWidth: 'auto',
                px: 1,
              },
              '& .MuiBottomNavigationAction-label': {
                fontSize: '0.65rem',
                '&.Mui-selected': {
                  fontSize: '0.7rem',
                },
              },
            }}
          >
            {bottomNavItems.map((item) => (
              <BottomNavigationAction
                key={item.textKey}
                label={t(item.textKey)}
                icon={item.icon}
              />
            ))}
            {visibleNavItems.length > 4 && (
              <BottomNavigationAction
                label={t('nav.more')}
                icon={<MoreHorizIcon />}
              />
            )}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
}