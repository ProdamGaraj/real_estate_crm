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

const drawerWidth = 240;

interface NavItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  resource?: ResourceType; // Ресурс для проверки прав
  requireAdmin?: boolean; // Требуется ли админ
}

const navItems: NavItem[] = [
  { text: 'Дашборд', icon: <DashboardIcon />, path: '/' },
  { text: 'Клиенты', icon: <PeopleIcon />, path: '/clients', resource: 'CLIENT' },
  { text: 'Заявки', icon: <AssignmentIcon />, path: '/applications', resource: 'APPLICATION' },
  { text: 'Встречи', icon: <EventIcon />, path: '/meetings', resource: 'MEETING' },
  { text: 'Задачи', icon: <ChecklistIcon />, path: '/tasks', resource: 'TASK' },
  { text: 'Сделки', icon: <BusinessCenterIcon />, path: '/deals', resource: 'DEAL' },
  { text: 'Проекты', icon: <AccountBalanceIcon />, path: '/projects', resource: 'PROJECT' },
  { text: 'Финансы', icon: <PaymentsIcon />, path: '/finances', resource: 'PAYMENT' },
  { text: 'Отчеты', icon: <AssessmentIcon />, path: '/reports' },
  { text: 'Скидки', icon: <LocalOfferIcon />, path: '/discounts', resource: 'DISCOUNT' },
  { text: 'Настройки', icon: <SettingsIcon />, path: '/settings?tab=companies', requireAdmin: true },
];

export default function RootLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Фильтруем пункты меню на основе прав доступа
  const visibleNavItems = useMemo(() => {
    return navItems.filter(item => {
      // Дашборд и отчеты доступны всем
      if (!item.resource && !item.requireAdmin) {
        return true;
      }

      // Проверяем требование администратора
      if (item.requireAdmin) {
        return isSystemAdmin(user);
      }

      // Проверяем наличие VIEW разрешения на ресурс
      if (item.resource) {
        return hasAnyViewPermission(user, item.resource);
      }

      return true;
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
    return user?.user_username || 'Пользователь';
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
            CRM Недвижимость
          </Typography>

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
              {user?.email || 'Нет email'}
            </MenuItem>
            {user?.company_name && (
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  Компания: {user.company_name}
                </Typography>
              </MenuItem>
            )}
            {user?.department_name && (
              <MenuItem disabled>
                <Typography variant="body2" color="text.secondary">
                  Отдел: {user.department_name}
                </Typography>
              </MenuItem>
            )}
            <Divider />
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1 }} />
              Выйти
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
              <ListItem key={item.text} disablePadding>
                <ListItemButton component={Link} to={item.path}>
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
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