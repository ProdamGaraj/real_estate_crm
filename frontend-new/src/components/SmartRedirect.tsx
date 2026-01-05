import { Navigate } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuthStore } from '../store/authStore';
import { hasAnyViewPermission, isSystemAdmin } from '../utils/permissions';
import type { ResourceType } from '../utils/permissions';

interface RouteConfig {
    path: string;
    resource?: ResourceType;
    requireAdmin?: boolean;
}

// Порядок маршрутов соответствует приоритету редиректа
const routes: RouteConfig[] = [
    { path: '/dashboard', resource: 'DASHBOARD' },
    { path: '/clients', resource: 'CLIENT' },
    { path: '/applications', resource: 'APPLICATION' },
    { path: '/meetings', resource: 'MEETING' },
    { path: '/tasks', resource: 'TASK' },
    { path: '/deals', resource: 'DEAL' },
    { path: '/projects', resource: 'PROJECT' },
    { path: '/finances', resource: 'PAYMENT' },
    { path: '/reports', resource: 'REPORT' },
    { path: '/discounts', resource: 'DISCOUNT' },
    { path: '/settings', requireAdmin: true },
];

/**
 * Компонент для умного редиректа на первую доступную страницу после авторизации.
 * Проверяет права пользователя и редиректит на первый доступный маршрут.
 */
export default function SmartRedirect() {
    const { user, isLoading } = useAuthStore();

    // Пока пользователь загружается, показываем спиннер
    if (isLoading || !user) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    // Находим первый доступный маршрут
    for (const route of routes) {
        if (route.requireAdmin) {
            if (isSystemAdmin(user)) {
                console.log('SmartRedirect: redirecting to', route.path, '(admin)');
                return <Navigate to={route.path} replace />;
            }
        } else if (route.resource) {
            if (hasAnyViewPermission(user, route.resource)) {
                console.log('SmartRedirect: redirecting to', route.path, 'for resource', route.resource);
                return <Navigate to={route.path} replace />;
            }
        }
    }

    // Если нет доступных маршрутов, показываем клиентов по умолчанию
    console.log('SmartRedirect: no matching routes, fallback to /clients');
    return <Navigate to="/clients" replace />;
}
