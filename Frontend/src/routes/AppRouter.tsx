import { BrowserRouter, Route, Routes } from 'react-router-dom'
import {
  CarFront,
  CircleGauge,
  ClipboardList,
  CreditCard,
  FileCheck,
  History,
  Settings,
  Shield,
  Users,
  Wrench,
} from 'lucide-react'
import PublicLayout from '../components/layout/PublicLayout'
import ProtectedRoute from './ProtectedRoute'
import FeaturePlaceholderPage from '../pages/private/FeaturePlaceholderPage'
import PrivateAreaPage from '../pages/private/PrivateAreaPage'

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
import ReservationPage from '../pages/public/ReservationPage'
import PaymentPage from '../pages/client/PaymentPage'
import ClientProfilePage from '../pages/client/ClientProfilePage'
import ClientReservationsPage from '../pages/client/ClientReservationsPage'
import ClientReservationDetailPage from '../pages/client/ClientReservationDetailPage'
import DepartureInspectionPage from '../pages/client/DepartureInspectionPage'
import ReturnInspectionPage from '../pages/client/ReturnInspectionPage'
import ClientInvoicesPage from '../pages/client/ClientInvoicesPage'
import ClientInvoiceDetailPage from '../pages/client/ClientInvoiceDetailPage'
import ClientNotificationsPage from '../pages/client/ClientNotificationsPage'

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
          <Route path="/reservation" element={<ReservationPage />} />
          <Route path="/payment" element={<PaymentPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['CLIENT']} />}>
          <Route
            path="/client"
            element={<PublicLayout />}
          >
            <Route
              index
              element={
                <PrivateAreaPage
                  title="Mon espace"
                  roleLabel="client"
                  sections={['Informations personnelles', 'Mes réservations', 'Mes factures']}
                />
              }
            />
            <Route
              path="reservations"
              element={<ClientReservationsPage />}
            />
            <Route
              path="reservations/:id"
              element={<ClientReservationDetailPage />}
            />
            <Route
              path="reservations/:id/departure-inspection"
              element={<DepartureInspectionPage />}
            />
            <Route
              path="reservations/:id/return-inspection"
              element={<ReturnInspectionPage />}
            />
            <Route
              path="profile"
              element={<ClientProfilePage />}
            />
            <Route
              path="notifications"
              element={<ClientNotificationsPage />}
            />
            <Route
              path="invoices"
              element={<ClientInvoicesPage />}
            />
            <Route
              path="invoices/:id"
              element={<ClientInvoiceDetailPage />}
            />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['GESTIONNAIRE_COMPTABLE', 'ADMINISTRATEUR']} />}>
          <Route path="/manager" element={<PublicLayout />}>
            <Route
              index
              element={
                <PrivateAreaPage
                  title="Tableau de bord"
                  roleLabel="gestionnaire"
                  sections={['Gestion des véhicules', 'Réservations', 'Documents à valider', 'Paiements']}
                />
              }
            />
            <Route
              path="vehicles"
              element={
                <FeaturePlaceholderPage
                  title="Gestion des véhicules"
                  description="Pilotez l'état et la disponibilité de la flotte."
                  icon={CarFront}
                  backLink="/manager"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="reservations"
              element={
                <FeaturePlaceholderPage
                  title="Réservations"
                  description="Suivez et administrez les réservations clients."
                  icon={ClipboardList}
                  backLink="/manager"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="documents"
              element={
                <FeaturePlaceholderPage
                  title="Documents à valider"
                  description="Validez les documents déposés par les clients."
                  icon={FileCheck}
                  backLink="/manager"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="payments"
              element={
                <FeaturePlaceholderPage
                  title="Paiements"
                  description="Consultez les opérations de paiement et leur statut."
                  icon={CreditCard}
                  backLink="/manager"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['MECANICIEN']} />}>
          <Route path="/mechanic" element={<PublicLayout />}>
            <Route
              index
              element={
                <PrivateAreaPage
                  title="Tableau de bord"
                  roleLabel="mécanicien"
                  sections={['Véhicules à réparer', 'Interventions', 'Historique']}
                />
              }
            />
            <Route
              path="vehicles"
              element={
                <FeaturePlaceholderPage
                  title="Véhicules à réparer"
                  description="Visualisez les véhicules nécessitant une intervention mécanique."
                  icon={CarFront}
                  backLink="/mechanic"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="interventions"
              element={
                <FeaturePlaceholderPage
                  title="Interventions"
                  description="Suivez vos interventions en cours et planifiées."
                  icon={Wrench}
                  backLink="/mechanic"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="history"
              element={
                <FeaturePlaceholderPage
                  title="Historique"
                  description="Consultez les interventions mécaniques terminées."
                  icon={History}
                  backLink="/mechanic"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['NETTOYEUR']} />}>
          <Route path="/cleaning" element={<PublicLayout />}>
            <Route
              index
              element={
                <PrivateAreaPage
                  title="Tableau de bord"
                  roleLabel="nettoyage"
                  sections={['Véhicules à nettoyer', 'Historique']}
                />
              }
            />
            <Route
              path="vehicles"
              element={
                <FeaturePlaceholderPage
                  title="Véhicules à nettoyer"
                  description="Retrouvez les véhicules à traiter pour la mise à disposition."
                  icon={CarFront}
                  backLink="/cleaning"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="history"
              element={
                <FeaturePlaceholderPage
                  title="Historique"
                  description="Consultez les opérations de nettoyage déjà effectuées."
                  icon={History}
                  backLink="/cleaning"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['ADMINISTRATEUR']} />}>
          <Route path="/admin" element={<PublicLayout />}>
            <Route
              index
              element={
                <PrivateAreaPage
                  title="Tableau de bord"
                  roleLabel="administrateur"
                  sections={['Utilisateurs', 'Rôles', 'Paramètres', 'Statistiques']}
                />
              }
            />
            <Route
              path="users"
              element={
                <FeaturePlaceholderPage
                  title="Utilisateurs"
                  description="Gérez les comptes utilisateurs et leurs informations clés."
                  icon={Users}
                  backLink="/admin"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="roles"
              element={
                <FeaturePlaceholderPage
                  title="Rôles"
                  description="Administrez les rôles et leurs droits d'accès."
                  icon={Shield}
                  backLink="/admin"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="settings"
              element={
                <FeaturePlaceholderPage
                  title="Paramètres"
                  description="Configurez les paramètres de fonctionnement de la plateforme."
                  icon={Settings}
                  backLink="/admin"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
            <Route
              path="statistics"
              element={
                <FeaturePlaceholderPage
                  title="Statistiques"
                  description="Analysez les indicateurs de performance de l'activité."
                  icon={CircleGauge}
                  backLink="/admin"
                  backLabel="Retour au tableau de bord"
                />
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}