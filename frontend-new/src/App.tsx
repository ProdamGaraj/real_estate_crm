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
import FinancesPage from './pages/FinancesPage';
import PaymentDetailPage from './pages/PaymentDetailPage';
import ReportsPage from './pages/ReportsPage';
// Permissions pages
import CompanyDetailPage from './pages/permissions/CompanyDetailPage';
import RoleDetailPage from './pages/permissions/RoleDetailPage';
// Auth
import ProtectedRoute from './components/ProtectedRoute';
import PermissionRoute from './components/PermissionRoute';

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
          { index: true, element: <DashboardPage /> },
          { path: 'clients', element: <ClientsPage /> },
          { path: 'clients/:clientId', element: <ClientDetailPage /> },
          { path: 'applications', element: <ApplicationsPage /> },
          { path: 'applications/:applicationId', element: <ApplicationDetailPage /> },
          { path: 'meetings', element: <MeetingsPage /> },
          { path: 'deals', element: <DealsPage /> },
          { path: 'deals/:dealId', element: <DealDetailPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'projects/:projectId', element: <ProjectDetailPage /> },
          { path: 'projects/:projectId/buildings/:buildingId', element: <BuildingDetailPage /> },
          { path: 'finances', element: <FinancesPage /> },
          { path: 'finances/:paymentId', element: <PaymentDetailPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { 
            path: 'settings', 
            element: (
              <PermissionRoute requireAdmin>
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
          { path: 'permissions/companies/:id', element: <CompanyDetailPage /> },
          { path: 'permissions/roles/:id', element: <RoleDetailPage /> },
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