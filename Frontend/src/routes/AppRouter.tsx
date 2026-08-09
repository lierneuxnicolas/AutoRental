import { BrowserRouter, Route, Routes } from 'react-router-dom'
import PublicLayout from '../components/layout/PublicLayout'
import ProtectedRoute from './ProtectedRoute'
import ClientLayout from '../components/layout/ClientLayout'
import ManagerLayout from '../components/layout/ManagerLayout'
import MechanicLayout from '../components/layout/MechanicLayout'
import CleaningLayout from '../components/layout/CleaningLayout'
import AdminLayout from '../components/layout/AdminLayout'

import HomePage from '../pages/public/HomePage'
import VehiclesPage from '../pages/public/VehiclesPage'
import VehicleDetailPage from '../pages/public/VehicleDetailPage'
import SearchPage from '../pages/public/SearchPage'
import SimulationPage from '../pages/public/SimulationPage'
import LoginPage from '../pages/public/LoginPage'
import RegisterPage from '../pages/public/RegisterPage'
import ForgotPasswordPage from '../pages/public/ForgotPasswordPage'
import VerifyEmailPage from '../pages/public/VerifyEmailPage'
import ResetPasswordPage from '../pages/public/ResetPasswordPage'
import TermsPage from '../pages/public/TermsPage'

function ClientDashboard() {
  return <div className="text-3xl font-bold">Dashboard client</div>
}

function ManagerDashboard() {
  return <div className="text-3xl font-bold">Dashboard gestionnaire</div>
}

function MechanicDashboard() {
  return <div className="text-3xl font-bold">Dashboard mécanicien</div>
}

function CleaningDashboard() {
  return <div className="text-3xl font-bold">Dashboard nettoyage</div>
}

function AdminDashboard() {
  return <div className="text-3xl font-bold">Dashboard administrateur</div>
}

function NotFoundPage() {
  return <div className="p-8 text-3xl font-bold">404 - Page introuvable</div>
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/terms" element={<TermsPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['CLIENT']} />}>
          <Route path="/client" element={<ClientLayout />}>
            <Route index element={<ClientDashboard />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['GESTIONNAIRE_COMPTABLE', 'ADMINISTRATEUR']} />}>
          <Route path="/manager" element={<ManagerLayout />}>
            <Route index element={<ManagerDashboard />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['MECANICIEN']} />}>
          <Route path="/mechanic" element={<MechanicLayout />}>
            <Route index element={<MechanicDashboard />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['NETTOYEUR']} />}>
          <Route path="/cleaning" element={<CleaningLayout />}>
            <Route index element={<CleaningDashboard />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['ADMINISTRATEUR']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}