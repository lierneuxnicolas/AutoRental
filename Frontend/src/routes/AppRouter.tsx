import { useTranslation } from 'react-i18next'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
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
import RentalTermsPage from '../pages/public/RentalTermsPage'
import StaticInfoPage from '../pages/public/StaticInfoPage'
import RentalProcessPage from '../pages/public/RentalProcessPage'
import ClientDashboardPage from '../pages/client/ClientDashboardPage'
import PaymentPage from '../pages/client/PaymentPage'
import ClientProfilePage from '../pages/client/ClientProfilePage'
import ClientReservationsPage from '../pages/client/ClientReservationsPage'
import ClientVehicleUnlockPage from '../pages/client/ClientVehicleUnlockPage'
import DepartureInspectionPage, { DepartureInspectionInteriorPage } from '../pages/client/DepartureInspectionPage'
import DepartureInspectionVehicleStatePage from '../pages/client/DepartureInspectionVehicleStatePage'
import DepartureInspectionConfirmationPage from '../pages/client/DepartureInspectionConfirmationPage'
import ReturnInspectionPage, {
  ReturnInspectionConfirmationPage,
  ReturnInspectionExteriorPage,
  ReturnInspectionInteriorPage,
  ReturnInspectionLockPage,
  ReturnInspectionVehicleStatePage,
} from '../pages/client/ReturnInspectionPage'
import ClientInvoicesPage from '../pages/client/ClientInvoicesPage'
import ClientInvoiceDetailPage from '../pages/client/ClientInvoiceDetailPage'
import ClientNotificationsPage from '../pages/client/ClientNotificationsPage'
import ManagerDocumentsPage from '../pages/manager/ManagerDocumentsPage'
import ManagerDashboardPage from '../pages/manager/ManagerDashboardPage'
import ManagerDocumentDetailPage from '../pages/manager/ManagerDocumentDetailPage'
import ManagerVehiclesPage from '../pages/manager/ManagerVehiclesPage'
import ManagerVehicleCreatePage from '../pages/manager/ManagerVehicleCreatePage'
import ManagerVehicleEditPage from '../pages/manager/ManagerVehicleEditPage'
import ManagerVehiclePhotosPage from '../pages/manager/ManagerVehiclePhotosPage'
import ManagerReservationsPage from '../pages/manager/ManagerReservationsPage'
import ManagerReservationDetailPage from '../pages/manager/ManagerReservationDetailPage'
import ManagerInterventionsPage from '../pages/manager/ManagerInterventionsPage'
import ManagerUsersPage from '../pages/manager/ManagerUsersPage'
import ManagerInterventionReportsPage from '../pages/manager/ManagerInterventionReportsPage'
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
  const { t } = useTranslation()
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
          <Route path="/terms" element={<RentalTermsPage />} />
          <Route path="/conditions-utilisation" element={<Navigate to="/terms#conditions-compte" replace />} />
          <Route path="/conditions-location" element={<Navigate to="/terms#conditions-location" replace />} />
          <Route path="/conditions-location/version-1.1" element={<RentalTermsPage archive />} />
          <Route
            path="/conditions-location/version-1.0"
            element={(
              <StaticInfoPage
                title='public.conditions_de_location_et_assurances'
                footerNote="Version 1.0 – Conditions de location GetaCar"
                sections={[
                  {
                    heading: 'public.conditions_pour_louer',
                    paragraphs: [
                      'public.pour_louer_un_vehicule_getacar_le_client_doit_avoir_au_moins',
                    ],
                  },
                  {
                    heading: 'public.reservation_paiement_et_assurance',
                    paragraphs: [
                      'public.la_reservation_est_confirmee_uniquement_si_le_vehicule_est_disponible_que',
                    ],
                  },
                  {
                    heading: 'public.caution_etat_du_vehicule_et_dommages',
                    paragraphs: [
                      'public.la_caution_est_realisee_sous_forme_de_preautorisation_bancaire_un_etat',
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
                title='public.qui_sommes_nous'
                description='public.getacar_est_un_service_de_location_de_vehicules_en_libre_service'
                paragraphs={[
                  'public.la_plateforme_permet_de_rechercher_un_vehicule_reserver_payer_gerer_la',
                ]}
                sections={[
                  {
                    heading: 'public.notre_objectif',
                    paragraphs: [
                      'public.proposer_une_experience_de_location_claire_et_pratique_tout_en_assurant',
                    ],
                  },
                  {
                    heading: 'public.nos_valeurs',
                    valueBlocks: [
                      {
                        title: 'public.simplicite',
                        description: 'public.une_interface_claire_et_un_parcours_de_location_facile_a_comprendre',
                      },
                      {
                        title: 'public.autonomie',
                        description: 'public.le_client_peut_gerer_les_principales_etapes_de_sa_location_directement',
                      },
                      {
                        title: 'public.securite',
                        description: 'public.les_documents_paiements_cautions_et_acces_aux_vehicules_sont_encadres_par',
                      },
                      {
                        title: 'public.tracabilite',
                        description: 'public.les_principales_actions_liees_a_la_reservation_aux_paiements_aux_etats',
                      },
                    ],
                  },
                ]}
                groups={[
                  {
                    id: 'mentions-legales',
                    title: 'public.mentions_legales',
                    sections: [
                      {
                        heading: 'public.editeur_du_site_et_contact',
                        content: (
                          <div className="space-y-3">
                            <div className="space-y-1 text-base leading-7 text-slate-600 sm:text-lg">
                              <p>{t('public.getacar_srl_societe_fictive_dans_le_cadre_du_tfe')}</p>
                              <p>{t('public.responsable_du_projet_nicolas_lierneux')}</p>
                              <p>{t('public.siege_social_fictif_bruxelles_belgique')}</p>
                              <p>{t('public.n_d_entreprise_fictif_be_1111_111_111')}</p>
                              <p>{t('public.n_de_tva_fictif_be_1111_111_111')}</p>
                            </div>
                            <p className="text-sm italic text-slate-500">
                              {t('public.ces_coordonnees_administratives_sont_fictives_et_utilisees_uniquement_dans_le_cadre')}
                            </p>
                            <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                              {t('public.pour_toute_question_concernant_getacar_veuillez_utiliser_la_rubrique')}{' '}
                              <Link to="/contact#contact" className="font-semibold text-[#2563EB] hover:underline">{t('navigation.contact')}</Link> {t('public.du_site')}
                            </p>
                          </div>
                        ),
                      },
                      {
                        heading: 'public.hebergement_et_propriete_intellectuelle',
                        paragraphs: [
                          'public.l_application_getacar_est_concue_pour_etre_hebergee_sur_microsoft_azure',
                          'public.les_contenus_l_interface_et_les_elements_developpes_specifiquement_pour_getacar',
                        ],
                      },
                      {
                        heading: 'public.responsabilite',
                        paragraphs: [
                          'public.les_informations_presentees_sur_cette_version_de_getacar_sont_fournies_dans',
                        ],
                      },
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
                title='public.politique_de_confidentialite_et_rgpd'
                sections={[
                  {
                    heading: 'public.donnees_collectees_et_utilisation',
                    content: (
                      <div className="space-y-3">
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          {t('public.pour_creer_et_utiliser_un_compte_getacar_nous_traitons_notamment_votre')}
                        </p>
                        <ul className="list-disc space-y-1 pl-5 text-base leading-7 text-slate-600 sm:text-lg">
                          <li>{t('public.creer_et_gerer_votre_compte')}</li>
                          <li>{t('public.verifier_votre_identite_et_votre_droit_a_conduire')}</li>
                          <li>{t('public.traiter_vos_reservations')}</li>
                          <li>{t('public.suivre_vos_locations_paiements_cautions_et_factures')}</li>
                          <li>{t('public.gerer_les_etats_des_lieux_et_les_eventuels_incidents')}</li>
                        </ul>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          {t('public.l_acces_a_ces_informations_est_limite_aux_personnes_autorisees_dans')}
                        </p>
                      </div>
                    ),
                  },
                  {
                    heading: 'public.services_stockage_et_securite',
                    content: (
                      <div className="space-y-3">
                        <ul className="list-disc space-y-1 pl-5 text-base leading-7 text-slate-600 sm:text-lg">
                          <li>{t('public.microsoft_azure_pour_l_hebergement_et_le_stockage')}</li>
                          <li>{t('public.stripe_pour_les_paiements_et_cautions')}</li>
                          <li>{t('public.brevo_pour_les_e_mails_transactionnels')}</li>
                        </ul>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          {t('public.ces_prestataires_ne_doivent_recevoir_que_les_donnees_necessaires_a_leur')}
                        </p>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          {t('public.les_documents_d_identite_et_les_photos_d_etats_des_lieux')}
                        </p>
                      </div>
                    ),
                  },
                  {
                    heading: 'public.conservation_des_donnees',
                    paragraphs: [
                      'public.les_documents_d_identite_peuvent_etre_conserves_tant_que_votre_compte',
                    ],
                  },
                ]}
                groups={[
                  {
                    id: 'rgpd',
                    title: 'public.vos_droits_rgpd',
                    sections: [
                      {
                        heading: 'public.comprendre_vos_droits',
                        paragraphs: [
                          'public.le_rgpd_est_le_reglement_europeen_qui_encadre_l_utilisation_des',
                          'public.vous_pouvez_demander_l_acces_a_vos_donnees_personnelles_et_faire',
                          'public.selon_votre_situation_vous_pouvez_egalement_beneficier_des_droits_de_limitation',
                        ],
                      },
                      {
                        heading: 'public.suppression_et_conservation_des_donnees',
                        paragraphs: [
                          'public.vous_pouvez_demander_la_suppression_de_votre_compte_getacar_celui_ci',
                          'public.certaines_informations_peuvent_toutefois_rester_archivees_lorsqu_elles_sont_necessaires_pour',
                        ],
                      },
                      {
                        heading: 'public.exercer_vos_droits',
                        content: (
                          <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                            {t('public.pour_toute_demande_concernant_vos_donnees_personnelles_utilisez_la_rubrique')}{' '}
                            <Link to="/contact#contact" className="font-semibold text-[#2563EB] hover:underline">{t('navigation.contact')}</Link> {t('public.de_getacar')}
                          </p>
                        ),
                      },
                    ],
                  },
                ]}
              />
            )}
          />
          <Route path="/legal-notice" element={<Navigate to="/about#mentions-legales" replace />} />
          <Route path="/rgpd" element={<Navigate to="/privacy#rgpd" replace />} />
          <Route
            path="/cookies"
            element={(
              <StaticInfoPage
                title='public.cookies'
                sections={[
                  {
                    heading: 'public.comprendre_les_cookies',
                    paragraphs: [
                      'public.un_cookie_est_un_petit_fichier_enregistre_par_votre_navigateur_lors',
                    ],
                  },
                  {
                    heading: 'public.cookies_necessaires',
                    content: (
                      <div className="space-y-3">
                        <ul className="list-disc space-y-1 pl-5 text-base leading-7 text-slate-600 sm:text-lg">
                          <li>{t('public.maintenir_votre_connexion')}</li>
                          <li>{t('public.assurer_la_securite_de_votre_session')}</li>
                          <li>{t('public.permettre_le_fonctionnement_normal_de_certaines_fonctionnalites')}</li>
                        </ul>
                        <p className="text-base leading-7 text-slate-600 sm:text-lg sm:text-justify">
                          {t('public.ces_cookies_ne_sont_pas_utilises_a_des_fins_publicitaires')}
                        </p>
                      </div>
                    ),
                  },
                  {
                    heading: 'public.cookies_facultatifs_et_preferences',
                    paragraphs: [
                      'public.getacar_peut_prevoir_ulterieurement_des_cookies_facultatifs_par_exemple_pour_des',
                    ],
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
              path="reservations/:id/return-inspection/exterior"
              element={<ReturnInspectionExteriorPage />}
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
              path="reservations/:id/return-inspection/lock"
              element={<ReturnInspectionLockPage />}
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
          <Route path="/manager" element={<PublicLayout manager />}>
            <Route index element={<ManagerDashboardPage />} />
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
              path="users"
              element={<ManagerUsersPage />}
            />
            <Route
              path="interventions/reports"
              element={<ManagerInterventionReportsPage />}
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
                  title={t("professional.paiements")}
                  description={t("professional.consultez_les_operations_de_paiement_et_leur_statut")}
                  icon={CreditCard}
                  backLink="/manager"
                  backLabel={t("professional.retour_au_tableau_de_bord")}
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
                  title={t("professional.tableau_de_bord")}
                  roleLabel={t("professional.mecanicien_2")}
                  sections={[t("professional.vehicules_a_reparer"), t("professional.interventions"), t("professional.historique")]}
                />
              }
            />
            <Route
              path="vehicles"
              element={
                <FeaturePlaceholderPage
                  title={t("professional.vehicules_a_reparer")}
                  description={t("professional.visualisez_les_vehicules_necessitant_une_intervention_mecanique")}
                  icon={CarFront}
                  backLink="/mechanic"
                  backLabel={t("professional.retour_au_tableau_de_bord")}
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
                  title={t("professional.historique")}
                  description={t("professional.consultez_les_interventions_mecaniques_terminees")}
                  icon={History}
                  backLink="/mechanic"
                  backLabel={t("professional.retour_au_tableau_de_bord")}
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
                  title={t("professional.tableau_de_bord")}
                  roleLabel={t("professional.nettoyage_2")}
                  sections={[t("professional.vehicules_a_nettoyer"), t("professional.historique")]}
                />
              }
            />
            <Route
              path="vehicles"
              element={
                <FeaturePlaceholderPage
                  title={t("professional.vehicules_a_nettoyer")}
                  description={t("professional.retrouvez_les_vehicules_a_traiter_pour_la_mise_a_disposition")}
                  icon={CarFront}
                  backLink="/cleaning"
                  backLabel={t("professional.retour_au_tableau_de_bord")}
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
                  title={t("professional.historique")}
                  description={t("professional.consultez_les_operations_de_nettoyage_deja_effectuees")}
                  icon={History}
                  backLink="/cleaning"
                  backLabel={t("professional.retour_au_tableau_de_bord")}
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
                  title={t("professional.roles")}
                  description={t("professional.administrez_les_roles_et_leurs_droits_d_acces")}
                  icon={Shield}
                  backLink="/admin"
                  backLabel={t("professional.retour_au_tableau_de_bord")}
                />
              }
            />
            <Route
              path="settings"
              element={
                <FeaturePlaceholderPage
                  title={t("professional.parametres")}
                  description={t("professional.configurez_les_parametres_de_fonctionnement_de_la_plateforme")}
                  icon={Settings}
                  backLink="/admin"
                  backLabel={t("professional.retour_au_tableau_de_bord")}
                />
              }
            />
            <Route
              path="statistics"
              element={
                <FeaturePlaceholderPage
                  title={t("professional.statistiques")}
                  description={t("professional.analysez_les_indicateurs_de_performance_de_l_activite")}
                  icon={CircleGauge}
                  backLink="/admin"
                  backLabel={t("professional.retour_au_tableau_de_bord")}
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
