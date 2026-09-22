import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import {
  CarFront,
  CircleGauge,
  CreditCard,
  History,
  Settings,
  Shield,
} from 'lucide-react'
import PublicLayout from '../components/layout/PublicLayout'
import ProtectedRoute from './ProtectedRoute'
import ScrollToTop from './ScrollToTop'
import FeaturePlaceholderPage from '../pages/private/FeaturePlaceholderPage'
import PrivateAreaPage from '../pages/private/PrivateAreaPage'
import FaqSection, { ContactSection } from '../components/home/FaqSection'
import HowItWorks from '../components/home/HowItWorks'

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
import ReservationPage from '../pages/public/ReservationPage'
import StaticInfoPage from '../pages/public/StaticInfoPage'
import RentalProcessPage from '../pages/public/RentalProcessPage'
import ClientDashboardPage from '../pages/client/ClientDashboardPage'
import PaymentPage from '../pages/client/PaymentPage'
import ClientProfilePage from '../pages/client/ClientProfilePage'
import ClientReservationsPage from '../pages/client/ClientReservationsPage'
import ClientReservationDetailPage from '../pages/client/ClientReservationDetailPage'
import ClientVehicleUnlockPage from '../pages/client/ClientVehicleUnlockPage'
import DepartureInspectionPage, { DepartureInspectionInteriorPage } from '../pages/client/DepartureInspectionPage'
import DepartureInspectionVehicleStatePage from '../pages/client/DepartureInspectionVehicleStatePage'
import DepartureInspectionConfirmationPage from '../pages/client/DepartureInspectionConfirmationPage'
import ReturnInspectionPage, {
  ReturnInspectionConfirmationPage,
  ReturnInspectionInteriorPage,
  ReturnInspectionVehicleStatePage,
} from '../pages/client/ReturnInspectionPage'
import ClientInvoicesPage from '../pages/client/ClientInvoicesPage'
import ClientInvoiceDetailPage from '../pages/client/ClientInvoiceDetailPage'
import ClientNotificationsPage from '../pages/client/ClientNotificationsPage'
import ManagerDocumentsPage from '../pages/manager/ManagerDocumentsPage'
import ManagerDocumentDetailPage from '../pages/manager/ManagerDocumentDetailPage'
import ManagerVehiclesPage from '../pages/manager/ManagerVehiclesPage'
import ManagerVehicleCreatePage from '../pages/manager/ManagerVehicleCreatePage'
import ManagerVehicleEditPage from '../pages/manager/ManagerVehicleEditPage'
import ManagerVehiclePhotosPage from '../pages/manager/ManagerVehiclePhotosPage'
import ManagerReservationsPage from '../pages/manager/ManagerReservationsPage'
import ManagerReservationDetailPage from '../pages/manager/ManagerReservationDetailPage'
import ManagerInterventionsPage from '../pages/manager/ManagerInterventionsPage'
import CleaningInterventionDetailPage from '../pages/cleaning/CleaningInterventionDetailPage'
import CleaningInterventionsPage from '../pages/cleaning/CleaningInterventionsPage'
import MechanicInterventionDetailPage from '../pages/mechanic/MechanicInterventionDetailPage'
import MechanicInterventionsPage from '../pages/mechanic/MechanicInterventionsPage'
import AdminDashboardPage from '../pages/admin/AdminDashboardPage'
import AdminInvoicesPage from '../pages/admin/AdminInvoicesPage'
import AdminUsersPage from '../pages/admin/AdminUsersPage'
import AdminSystemLogsPage from '../pages/admin/AdminSystemLogsPage'
import AdminBackupsPage from '../pages/admin/AdminBackupsPage'

function NotFoundPage() {
  return <div className="p-8 text-3xl font-bold">404 - Page introuvable</div>
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/:id/reservation" element={<VehicleDetailPage />} />
          <Route path="/vehicles/:id" element={<VehicleDetailPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/vehicles/:vehicleId/simulation" element={<SimulationPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/terms"
            element={(
              <StaticInfoPage
                title="Conditions de location et assurances"
                sections={[
                  {
                    heading: 'Conditions pour louer',
                    paragraphs: [
                      "Pour louer un véhicule GetaCar, le client doit avoir **au moins 21 ans**, disposer d'une carte d'identité et d'un permis de conduire valides. Ces documents doivent être validés avant la réservation.",
                    ],
                  },
                  {
                    heading: 'Réservation, paiement et assurance',
                    paragraphs: [
                      "La réservation est confirmée uniquement si le véhicule est disponible, que la **caution est autorisée** et que le paiement est effectué avec succès. Une assurance **Standard** est comprise dans le prix de base et des formules complémentaires peuvent être proposées. Le montant total est affiché avant la confirmation.",
                    ],
                  },
                  {
                    heading: 'Caution, état du véhicule et dommages',
                    paragraphs: [
                      "La caution est réalisée sous forme de **préautorisation bancaire**. Un **état des lieux avec photos** est effectué avant le départ et au retour. En cas de dommage ou de frais liés à la location, le client est informé des montants réclamés et des justificatifs correspondants.",
                    ],
                  },
                ]}
              />
            )}
          />
          <Route
            path="/about"
            element={(
              <StaticInfoPage
                title="Qui sommes-nous ?"
                description="GetaCar est un service de location de véhicules en libre-service conçu pour rendre la location plus simple, autonome et numérique."
                paragraphs={[
                  'La plateforme permet de rechercher un véhicule, réserver, payer, gérer la caution, réaliser les états des lieux et restituer le véhicule depuis une même interface.',
                ]}
                sections={[
                  {
                    heading: 'Notre objectif',
                    paragraphs: [
                      'Proposer une expérience de location claire et pratique, tout en assurant la **sécurité**, la disponibilité des véhicules et le suivi de chaque étape de la location.',
                    ],
                  },
                  {
                    heading: 'Nos valeurs',
                    valueBlocks: [
                      {
                        title: 'Simplicité',
                        description: "Une interface claire et un parcours de location facile à comprendre, de la réservation jusqu'à la restitution.",
                      },
                      {
                        title: 'Autonomie',
                        description: "Le client peut gérer les principales étapes de sa location directement depuis l'application, sans devoir passer systématiquement par une agence.",
                      },
                      {
                        title: 'Sécurité',
                        description: 'Les documents, paiements, cautions et accès aux véhicules sont encadrés par des contrôles et des règles métier.',
                      },
                      {
                        title: 'Traçabilité',
                        description: "Les principales actions liées à la réservation, aux paiements, aux états des lieux et aux interventions sont suivies dans l'application.",
                      },
                    ],
                  },
                ]}
              />
            )}
          />
          <Route
            path="/legal-notice"
            element={(
              <StaticInfoPage
                title="Mentions légales"
                sections={[
                  {
                    heading: 'Éditeur du site et contact',
                    content: (
                      <div className="space-y-3">
                        <div className="space-y-1 text-base leading-7 text-slate-600 sm:text-lg">
                          <p>GetaCar SRL — société fictive dans le cadre du TFE</p>
                          <p>Responsable du projet : Nicolas Lierneux</p>
                          <p>Siège social fictif : Bruxelles, Belgique</p>
                          <p>N° d'entreprise fictif : BE 1111.111.111</p>
                          <p>N° de TVA fictif : BE 1111.111.111</p>
                        </div>
                        <p className="text-sm italic text-slate-500">
                          Ces coordonnées administratives sont fictives et utilisées uniquement dans le cadre de la démonstration académique GetaCar.
                        </p>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          Pour toute question concernant GetaCar, veuillez utiliser la rubrique{' '}
                          <Link to="/contact#contact" className="font-semibold text-[#2563EB] hover:underline">Aide &amp; Contact</Link> du site.
                        </p>
                      </div>
                    ),
                  },
                  {
                    heading: 'Hébergement et propriété intellectuelle',
                    paragraphs: [
                      "L'application GetaCar est conçue pour être hébergée sur **Microsoft Azure**, notamment pour le frontend, le backend, la base de données et le stockage des fichiers.",
                      "Les contenus, l'interface et les éléments développés spécifiquement pour GetaCar sont utilisés dans le cadre de ce projet académique. Les marques, logos et services tiers restent la propriété de leurs détenteurs respectifs.",
                    ],
                  },
                  {
                    heading: 'Responsabilité',
                    paragraphs: [
                      "Les informations présentées sur cette version de GetaCar sont fournies dans le cadre d'un **projet académique et démonstratif**. Le service ne constitue pas actuellement une activité commerciale réelle.",
                    ],
                  },
                ]}
              />
            )}
          />
          <Route
            path="/privacy"
            element={(
              <StaticInfoPage
                title="Politique de confidentialité"
                sections={[
                  {
                    heading: 'Données collectées et utilisation',
                    content: (
                      <div className="space-y-3">
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          Pour créer et utiliser un compte GetaCar, nous traitons notamment votre nom, prénom, coordonnées, date de naissance, carte d'identité et permis de conduire. Les réservations, notifications et informations liées aux états des lieux font également partie des données utilisées par le service.
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-base leading-7 text-slate-600 sm:text-lg">
                          <li>créer et gérer votre compte ;</li>
                          <li>vérifier votre identité et votre droit à conduire ;</li>
                          <li>traiter vos réservations ;</li>
                          <li>suivre vos locations, paiements, cautions et factures ;</li>
                          <li>gérer les états des lieux et les éventuels incidents.</li>
                        </ul>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          L'accès à ces informations est limité aux personnes autorisées dans le cadre de leur fonction.
                        </p>
                      </div>
                    ),
                  },
                  {
                    heading: 'Services, stockage et sécurité',
                    content: (
                      <div className="space-y-3">
                        <ul className="list-disc space-y-1 pl-5 text-base leading-7 text-slate-600 sm:text-lg">
                          <li>Microsoft Azure pour l'hébergement et le stockage ;</li>
                          <li>Stripe pour les paiements et cautions ;</li>
                          <li>Brevo pour les e-mails transactionnels.</li>
                        </ul>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          Ces prestataires ne doivent recevoir que les données nécessaires à leur mission.
                        </p>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          Les documents d'identité et les photos d'états des lieux sont stockés dans des espaces privés. Les échanges avec l'application sont sécurisés et les accès sont contrôlés selon le rôle de l'utilisateur.
                        </p>
                      </div>
                    ),
                  },
                  {
                    heading: 'Conservation des données',
                    paragraphs: [
                      "Les documents d'identité peuvent être conservés tant que votre compte reste actif. Les photos d'état des lieux sont conservées pendant le temps nécessaire au suivi de la location ou d'un éventuel litige. Les données comptables et factures sont conservées pendant la durée légale applicable.",
                    ],
                  },
                ]}
              />
            )}
          />
          <Route
            path="/cookies"
            element={(
              <StaticInfoPage
                title="Cookies"
                sections={[
                  {
                    heading: 'Comprendre les cookies',
                    paragraphs: [
                      "Un cookie est un petit fichier enregistré par votre navigateur lors de la visite d'un site. Dans GetaCar, les cookies et mécanismes similaires servent principalement à maintenir votre connexion, mémoriser certaines préférences et assurer le bon fonctionnement du service.",
                    ],
                  },
                  {
                    heading: 'Cookies nécessaires',
                    content: (
                      <div className="space-y-3">
                        <ul className="list-disc space-y-1 pl-5 text-base leading-7 text-slate-600 sm:text-lg">
                          <li>maintenir votre connexion ;</li>
                          <li>assurer la sécurité de votre session ;</li>
                          <li>permettre le fonctionnement normal de certaines fonctionnalités.</li>
                        </ul>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          Ces cookies ne sont pas utilisés à des fins publicitaires.
                        </p>
                      </div>
                    ),
                  },
                  {
                    heading: 'Cookies facultatifs et préférences',
                    paragraphs: [
                      "GetaCar peut prévoir ultérieurement des cookies facultatifs, par exemple pour des statistiques ou certains services tiers. Lorsqu'un consentement est requis, ils ne sont déposés qu'après votre accord. Vous pouvez ensuite accepter, refuser ou modifier votre choix depuis les paramètres prévus à cet effet.",
                    ],
                  },
                ]}
              />
            )}
          />
          <Route
            path="/rgpd"
            element={(
              <StaticInfoPage
                title="Vos droits RGPD"
                sections={[
                  {
                    heading: 'Comprendre vos droits',
                    paragraphs: [
                      "Le RGPD est le règlement européen qui encadre l'utilisation des données personnelles et vous donne des droits sur les informations vous concernant.",
                      "Vous pouvez demander l'accès à vos données personnelles et faire corriger les informations inexactes ou incomplètes.",
                      'Selon votre situation, vous pouvez également bénéficier des droits de limitation, opposition et portabilité prévus par le RGPD.',
                    ],
                  },
                  {
                    heading: 'Suppression et conservation des données',
                    paragraphs: [
                      "Vous pouvez demander la suppression de votre compte GetaCar. Celui-ci est d'abord désactivé, puis les données qui ne doivent plus être conservées peuvent être supprimées ou anonymisées.",
                      "Certaines informations peuvent toutefois rester archivées lorsqu'elles sont nécessaires pour respecter une obligation légale, comptable ou pour le traitement d'un litige.",
                    ],
                  },
                  {
                    heading: 'Exercer vos droits',
                    content: (
                      <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                        Pour toute demande concernant vos données personnelles, utilisez la rubrique{' '}
                        <Link to="/contact#contact" className="font-semibold text-[#2563EB] hover:underline">Aide &amp; Contact</Link> de GetaCar.
                      </p>
                    ),
                  },
                ]}
              />
            )}
          />
          <Route
            path="/sitemap"
            element={<StaticInfoPage title="Plan du site" description="Retrouvez ici la structure des pages publiques et privées de GetACar." />}
          />
          <Route path="/rental-process" element={<RentalProcessPage />} />
          <Route
            path="/contact"
            element={
              <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-10">
                <HowItWorks />
                <FaqSection />
                <ContactSection />
              </div>
            }
          />
          <Route path="/reservation" element={<ReservationPage />} />
          <Route path="/payment" element={<PaymentPage />} />
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['CLIENT']} />}>
          <Route
            path="/client"
            element={<PublicLayout />}
          >
            <Route index element={<ClientDashboardPage />} />
            <Route
              path="reservations"
              element={<ClientReservationsPage />}
            />
            <Route
              path="reservations/:id"
              element={<ClientReservationDetailPage />}
            />
            <Route
              path="reservations/:id/unlock"
              element={<ClientVehicleUnlockPage />}
            />
            <Route
              path="reservations/:id/departure-inspection"
              element={<DepartureInspectionPage />}
            />
            <Route
              path="reservations/:id/departure-inspection/interior"
              element={<DepartureInspectionInteriorPage />}
            />
            <Route
              path="reservations/:id/departure-inspection/vehicle-state"
              element={<DepartureInspectionVehicleStatePage />}
            />
            <Route
              path="reservations/:id/departure-inspection/confirmation"
              element={<DepartureInspectionConfirmationPage />}
            />
            <Route
              path="reservations/:id/return-inspection"
              element={<ReturnInspectionPage />}
            />
            <Route
              path="reservations/:id/return-inspection/interior"
              element={<ReturnInspectionInteriorPage />}
            />
            <Route
              path="reservations/:id/return-inspection/vehicle-state"
              element={<ReturnInspectionVehicleStatePage />}
            />
            <Route
              path="reservations/:id/return-inspection/confirmation"
              element={<ReturnInspectionConfirmationPage />}
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
              element={<ManagerVehiclesPage />}
            />
            <Route
              path="vehicles/new"
              element={<ManagerVehicleCreatePage />}
            />
            <Route
              path="vehicles/:id/edit"
              element={<ManagerVehicleEditPage />}
            />
            <Route
              path="vehicles/:id/photos"
              element={<ManagerVehiclePhotosPage />}
            />
            <Route
              path="reservations"
              element={<ManagerReservationsPage />}
            />
            <Route
              path="reservations/:id"
              element={<ManagerReservationDetailPage />}
            />
            <Route
              path="interventions"
              element={<ManagerInterventionsPage />}
            />
            <Route
              path="documents"
              element={<ManagerDocumentsPage />}
            />
            <Route
              path="documents/:id"
              element={<ManagerDocumentDetailPage />}
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
              element={<MechanicInterventionsPage />}
            />
            <Route
              path="interventions/:id"
              element={<MechanicInterventionDetailPage />}
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
              path="interventions"
              element={<CleaningInterventionsPage />}
            />
            <Route
              path="interventions/:id"
              element={<CleaningInterventionDetailPage />}
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
            <Route index element={<AdminDashboardPage />} />
            <Route
              path="reservations"
              element={<ManagerReservationsPage basePath="/admin" />}
            />
            <Route
              path="reservations/:id"
              element={<ManagerReservationDetailPage basePath="/admin" />}
            />
            <Route
              path="vehicles"
              element={<ManagerVehiclesPage basePath="/admin" />}
            />
            <Route
              path="vehicles/new"
              element={<ManagerVehicleCreatePage basePath="/admin" />}
            />
            <Route
              path="vehicles/:id/edit"
              element={<ManagerVehicleEditPage basePath="/admin" />}
            />
            <Route
              path="vehicles/:id/photos"
              element={<ManagerVehiclePhotosPage basePath="/admin" />}
            />
            <Route
              path="interventions"
              element={<ManagerInterventionsPage />}
            />
            <Route
              path="invoices"
              element={<AdminInvoicesPage />}
            />
            <Route
              path="users"
              element={<AdminUsersPage />}
            />
            <Route
              path="system-logs"
              element={<AdminSystemLogsPage />}
            />
            <Route
              path="backups"
              element={<AdminBackupsPage />}
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