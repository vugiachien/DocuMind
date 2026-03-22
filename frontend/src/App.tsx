import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import Layout from './components/Layout';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import ContractListPage from './pages/contracts/ContractListPage';
import ContractCreatePage from './pages/contracts/ContractCreatePage';
import ContractDetailPage from './pages/contracts/ContractDetailPage';
import ReviewEditPage from './pages/contracts/ReviewEditPage';
import LibraryPage from './pages/library/LibraryPage';
import PlaybookPreviewPage from './pages/library/PlaybookPreviewPage';
import PlaybookRulesPage from './pages/library/PlaybookRulesPage';
import ContractTypePage from './pages/library/ContractTypePage';
import PartnerPage from './pages/partners/PartnerPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import DepartmentManagementPage from './pages/admin/DepartmentManagementPage';
import DeletedContractsPage from './pages/admin/DeletedContractsPage';
import InformationSecurityPage from './pages/settings/InformationSecurityPage';
import SettingsPage from './pages/settings/SettingsPage';

import { NotificationProvider } from './contexts/NotificationContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AnalysisSettingsProvider } from './contexts/AnalysisSettingsContext';

function App() {
  return (
    <ThemeProvider>
      <AnalysisSettingsProvider>
        <AuthProvider>
          <BrowserRouter>
            <NotificationProvider>
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<LoginPage />} />

                {/* Protected Routes */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <DashboardPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/contracts"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ContractListPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/contracts/create"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ContractCreatePage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/contracts/:id"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ContractDetailPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/contracts/:id/edit"
                  element={
                    <ProtectedRoute>
                      {/* No Layout wrapper for full screen mode if desired, or keep Layout */}
                      {/* Using Layout for consistency but ReviewEditPage handles its own full-height layout */}
                      <ReviewEditPage />
                    </ProtectedRoute>
                  }
                />

                {/* Library & Contract Types — visible to all users (read-only for non-admin) */}
                <Route
                  path="/library"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <LibraryPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/library/preview/:id"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <PlaybookPreviewPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/library/rules/:id"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <PlaybookRulesPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/contract-types"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <ContractTypePage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Admin-Only Routes */}
                <Route
                  path="/partners"
                  element={
                    <AdminRoute>
                      <Layout>
                        <PartnerPage />
                      </Layout>
                    </AdminRoute>
                  }
                />
                <Route
                  path="/users"
                  element={
                    <AdminRoute>
                      <Layout>
                        <UserManagementPage />
                      </Layout>
                    </AdminRoute>
                  }
                />
                <Route
                  path="/departments"
                  element={
                    <AdminRoute>
                      <Layout>
                        <DepartmentManagementPage />
                      </Layout>
                    </AdminRoute>
                  }
                />
                <Route
                  path="/deleted-contracts"
                  element={
                    <AdminRoute>
                      <Layout>
                        <DeletedContractsPage />
                      </Layout>
                    </AdminRoute>
                  }
                />

                {/* Settings Routes */}
                <Route
                  path="/settings/information"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <InformationSecurityPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <SettingsPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* 404 */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </NotificationProvider>
          </BrowserRouter>
        </AuthProvider>
      </AnalysisSettingsProvider>
    </ThemeProvider>
  );
}

export default App;
