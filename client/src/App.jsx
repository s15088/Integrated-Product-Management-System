import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import AppLayout from './components/AppLayout';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const RequirementsPage = lazy(() => import('./pages/RequirementsPage'));
const RequirementDetailPage = lazy(() => import('./pages/RequirementDetailPage'));
const IssuesPage = lazy(() => import('./pages/IssuesPage'));
const IssueDetailPage = lazy(() => import('./pages/IssueDetailPage'));
const VersionsPage = lazy(() => import('./pages/VersionsPage'));
const VersionDetailPage = lazy(() => import('./pages/VersionDetailPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const PermissionsPage = lazy(() => import('./pages/PermissionsPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const ArchivePage = lazy(() => import('./pages/ArchivePage'));

const LoadingFallback = () => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100%',
      minHeight: 200,
    }}
  >
    <Spin size="large" tip="加载中..." />
  </div>
);

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          width: '100vw',
        }}
      >
        <Spin size="large" tip="正在加载..." />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          path="/dashboard"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="/products"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <ProductsPage />
            </Suspense>
          }
        />
        <Route
          path="/products/categories"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <CategoryPage />
            </Suspense>
          }
        />
        <Route
          path="/products/:id"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <ProductDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/requirements"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <RequirementsPage />
            </Suspense>
          }
        />
        <Route
          path="/requirements/:id"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <RequirementDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/issues"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <IssuesPage />
            </Suspense>
          }
        />
        <Route
          path="/issues/:id"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <IssueDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/versions"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <VersionsPage />
            </Suspense>
          }
        />
        <Route
          path="/versions/:id"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <VersionDetailPage />
            </Suspense>
          }
        />
        <Route
          path="/system/users"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <UsersPage />
            </Suspense>
          }
        />
        <Route
          path="/system/permissions"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <PermissionsPage />
            </Suspense>
          }
        />
        <Route
          path="/system/audit"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <AuditLogsPage />
            </Suspense>
          }
        />
        <Route
          path="/system/archive"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <ArchivePage />
            </Suspense>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;