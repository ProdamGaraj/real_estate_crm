import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import BuildingDetailPage from './pages/BuildingDetailPage';
// Импорт макетов и страниц
import RootLayout from './layouts/RootLayout';
import LoginPage from './pages/auth/LoginPage';
import PasswordResetRequestPage from './pages/auth/PasswordResetRequestPage';
import PasswordResetConfirmPage from './pages/auth/PasswordResetConfirmPage';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import ApplicationsPage from './pages/ApplicationsPage';
import ApplicationDetailPage from './pages/ApplicationDetailPage';
import DealsPage from './pages/DealsPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import SettingsPage from './pages/SettingsPage';
import DealDetailPage from './pages/DealDetailPage';
import DiscountsPage from './pages/DiscountsPage';
import DiscountDetailPage from './pages/DiscountDetailPage';
import MeetingsPage from './pages/MeetingsPage';
import TasksPage from './pages/TasksPage';
import TaskDetailPage from './pages/TaskDetailPage';
import FinancesPage from './pages/FinancesPage';
import PaymentDetailPage from './pages/PaymentDetailPage';
import ReportsPage from './pages/ReportsPage';
// Permissions pages
import CompanyDetailPage from './pages/permissions/CompanyDetailPage';
import RoleDetailPage from './pages/permissions/RoleDetailPage';
// Auth
import ProtectedRoute from './components/ProtectedRoute';
import PermissionRoute from './components/PermissionRoute';
import SmartRedirect from './components/SmartRedirect';
import { canAccessSettings } from './utils/settingsTabs';

// Компонент-обертка для защиты маршрутов (используя новую систему авторизации)
const ProtectedRouteWrapper = () => {
  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  );
};

// Определяем все маршруты приложения
const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/forgot-password',
    element: <PasswordResetRequestPage />,
  },
  {
    path: '/reset-password/:uid/:token',
    element: <PasswordResetConfirmPage />,
  },
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        element: <ProtectedRouteWrapper />,
        children: [
          { index: true, element: <SmartRedirect /> },
          {
            path: 'dashboard',
            element: (
              <PermissionRoute resource="DASHBOARD" action="VIEW">
                <DashboardPage />
              </PermissionRoute>
            )
          },
          {
            path: 'clients',
            element: (
              <PermissionRoute resource="CLIENT" action="VIEW">
                <ClientsPage />
              </PermissionRoute>
            )
          },
          {
            path: 'clients/:clientId',
            element: (
              <PermissionRoute resource="CLIENT" action="VIEW">
                <ClientDetailPage />
              </PermissionRoute>
            )
          },
          {
            path: 'applications',
            element: (
              <PermissionRoute resource="APPLICATION" action="VIEW">
                <ApplicationsPage />
              </PermissionRoute>
            )
          },
          {
            path: 'applications/:applicationId',
            element: (
              <PermissionRoute resource="APPLICATION" action="VIEW">
                <ApplicationDetailPage />
              </PermissionRoute>
            )
          },
          {
            path: 'meetings',
            element: (
              <PermissionRoute resource="MEETING" action="VIEW">
                <MeetingsPage />
              </PermissionRoute>
            )
          },
          {
            path: 'tasks',
            element: (
              <PermissionRoute resource="TASK" action="VIEW">
                <TasksPage />
              </PermissionRoute>
            )
          },
          {
            path: 'tasks/:id',
            element: (
              <PermissionRoute resource="TASK" action="VIEW">
                <TaskDetailPage />
              </PermissionRoute>
            )
          },
          {
            path: 'deals',
            element: (
              <PermissionRoute resource="DEAL" action="VIEW">
                <DealsPage />
              </PermissionRoute>
            )
          },
          {
            path: 'deals/:dealId',
            element: (
              <PermissionRoute resource="DEAL" action="VIEW">
                <DealDetailPage />
              </PermissionRoute>
            )
          },
          {
            path: 'projects',
            element: (
              <PermissionRoute resource="PROJECT" action="VIEW">
                <ProjectsPage />
              </PermissionRoute>
            )
          },
          {
            path: 'projects/:projectId',
            element: (
              <PermissionRoute resource="PROJECT" action="VIEW">
                <ProjectDetailPage />
              </PermissionRoute>
            )
          },
          {
            path: 'projects/:projectId/buildings/:buildingId',
            element: (
              <PermissionRoute resource="BUILDING" action="VIEW">
                <BuildingDetailPage />
              </PermissionRoute>
            )
          },
          {
            path: 'finances',
            element: (
              <PermissionRoute resource="PAYMENT" action="VIEW">
                <FinancesPage />
              </PermissionRoute>
            )
          },
          {
            path: 'finances/:paymentId',
            element: (
              <PermissionRoute resource="PAYMENT" action="VIEW">
                <PaymentDetailPage />
              </PermissionRoute>
            )
          },
          {
            path: 'reports',
            element: (
              <PermissionRoute resource="REPORT" action="VIEW">
                <ReportsPage />
              </PermissionRoute>
            )
          },
          {
            path: 'settings',
            element: (
              // Раздел открыт тем, кто ведёт хотя бы одну настройку;
              // прав, выданных ради форм, для этого недостаточно
              <PermissionRoute canAccess={canAccessSettings}>
                <SettingsPage />
              </PermissionRoute>
            )
          },
          {
            path: 'discounts',
            element: (
              <PermissionRoute resource="DISCOUNT" action="VIEW">
                <DiscountsPage />
              </PermissionRoute>
            )
          },
          {
            path: 'discounts/:discountId',
            element: (
              <PermissionRoute resource="DISCOUNT" action="VIEW">
                <DiscountDetailPage />
              </PermissionRoute>
            )
          },
          // Permissions routes
          {
            path: 'permissions/companies/:id',
            element: (
              <PermissionRoute requireAdmin>
                <CompanyDetailPage />
              </PermissionRoute>
            )
          },
          {
            path: 'permissions/roles/:id',
            element: (
              <PermissionRoute requireAdmin>
                <RoleDetailPage />
              </PermissionRoute>
            )
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;