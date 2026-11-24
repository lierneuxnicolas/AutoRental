import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { ChevronDown, Mail, MapPin, Phone } from 'lucide-react'
import { useId, useState } from 'react'

type FaqItem = {
  question: string
  content: ReactNode
}

const answerParagraphClass = 'text-base leading-7 text-slate-700'
const contactLinkClass = 'font-semibold text-[#2563EB] hover:underline break-all'

function getFaqItems(t: TFunction): FaqItem[] {
  return [
  {
    question: 'public.comment_creer_et_valider_mon_compte_getacar',
    content: (
      <p className={answerParagraphClass}>
        {t('public.creez_votre_compte_sur_la_plateforme_completez_vos_informations_personnelles_puis')}
      </p>
    ),
  },
  {
    question: 'public.comment_reserver_un_vehicule_et_quand_ma_reservation_est_elle_confirmee',
    content: (
      <p className={answerParagraphClass}>
        {t('public.choisissez_un_vehicule_disponible_selectionnez_vos_dates_et_les_options_souhaitees')}
      </p>
    ),
  },
  {
    question: 'public.comment_fonctionnent_le_paiement_et_la_caution',
    content: (
      <p className={answerParagraphClass}>
        {t('public.le_paiement_correspond_au_montant_de_votre_location_la_caution_est')}
      </p>
    ),
  },
  {
    question: 'public.quand_ma_caution_est_elle_liberee_apres_la_location',
    content: (
      <p className={answerParagraphClass}>
        {t('public.la_preautorisation_peut_etre_conservee_pendant_maximum_7_jours_apres_la')}
      </p>
    ),
  },
  {
    question: 'public.comment_recuperer_et_deverrouiller_le_vehicule',
    content: (
      <p className={answerParagraphClass}>
        {t('public.rendez_vous_a_l_emplacement_indique_dans_votre_reservation_lorsque_vous')}
      </p>
    ),
  },
  {
    question: 'public.comment_faire_le_plein_et_quand_dois_je_le_faire',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.le_niveau_de_carburant_est_enregistre_lors_des_etats_des_lieux')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.utilisez_la_carte_carburant_presente_dans_le_vehicule_lors_du_paiement')}
        </p>
      </div>
    ),
  },
  {
    question: 'public.comment_realiser_l_etat_des_lieux_de_depart',
    content: (
      <p className={answerParagraphClass}>
        {t('public.avant_de_prendre_la_route_controlez_notamment_la_carrosserie_les_vitres')}
      </p>
    ),
  },
  {
    question: 'public.que_faire_si_je_constate_un_dommage_avant_de_partir',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.ne_demarrez_pas_sans_avoir_signale_le_probleme_ajoutez_une_description')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.si_le_probleme_est_mineur_il_est_enregistre_dans_votre_dossier')} <strong className="font-semibold text-[#1F2937]">{t('public.a_controler')}</strong> {t('public.et_ne_doit_pas_etre_utilise_la_reservation_peut_alors_etre')}
        </p>
      </div>
    ),
  },
  {
    question: 'public.que_faire_si_le_vehicule_ne_se_deverrouille_pas',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.verifiez_que_votre_reservation_est_active_que_les_etapes_de_depart')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.si_le_vehicule_reste_verrouille_utilisez_la_rubrique_aide_amp_contact')}
        </p>
      </div>
    ),
  },
  {
    question: 'public.que_faire_si_la_cle_ou_la_keybox_ne_fonctionne_pas',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.la_cle_physique_est_conservee_dans_une_keybox_installee_dans_le')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.si_la_keybox_ne_s_ouvre_pas_si_la_cle_reste')}
        </p>
      </div>
    ),
  },
  {
    question: 'public.que_faire_en_cas_de_panne_ou_d_accident_pendant_la',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.mettez_vous_d_abord_en_securite_et_ne_poursuivez_pas_votre')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.signalez_ensuite_l_incident_dans_l_application_getacar_avec_une_description')}
        </p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-[#1F2937]">GetaCar Assistance – Renault Leasing</p>
          <p className="mt-1">
            <a href="tel:080012424" className={contactLinkClass}>0800 12 424</a>
          </p>
          <p className="mt-1 text-xs text-slate-500">{t('public.numero_fictif_utilise_pour_la_demonstration_du_projet')}</p>
          <p className="mt-1 text-sm text-slate-600">{t('public.assistance_24_h_24_7_j_7')}</p>
        </div>
        <p className={answerParagraphClass}>
          {t('public.en_cas_d_accident_avec_un_autre_vehicule_ou_un_tiers')}
        </p>
      </div>
    ),
  },
  {
    question: 'public.que_se_passe_t_il_si_j_endommage_le_vehicule',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.signalez_immediatement_le_dommage_dans_l_application_et_ajoutez_des_photos')}
        </p>
        <p className={answerParagraphClass}>
          {' '}{t('public.envoyez_ensuite_le_constat_par_e_mail_a')}{' '}{' '}
          <a href="mailto:sinistres@getacar.be" className={contactLinkClass}>sinistres@getacar.be</a>
        </p>
        <p className={answerParagraphClass}>
          {t('public.indiquez_votre_nom_votre_numero_de_reservation_et_si_possible_joignez')}
        </p>
        <p className={answerParagraphClass}>
          {' '}{t('public.si_le_vehicule_ne_peut_plus_rouler_en_securite_contactez_getacar')}{' '}{' '}
          <a href="tel:080012424" className={contactLinkClass}>0800 12 424</a>{t('public.le_vehicule_pourra_etre_place')} <strong className="font-semibold text-[#1F2937]">{t('public.a_controler')}</strong> {t('public.et_envoye_vers_un_garage_ou_un_service_de_depannage_partenaire')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.les_eventuels_frais_dependent_des_circonstances_de_l_accident_des_dommages')}
        </p>
      </div>
    ),
  },
  {
    question: 'public.comment_restituer_et_verrouiller_le_vehicule',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.ramenez_le_vehicule_a_l_emplacement_prevu_coupez_le_moteur_et')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.replacez_la_cle_dans_la_keybox_une_fois_la_presence_de')}
        </p>
      </div>
    ),
  },
  {
    question: 'public.que_faire_si_le_vehicule_ne_se_verrouille_pas_ou_si',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.ne_quittez_pas_le_vehicule_tant_que_vous_n_avez_pas')}
        </p>
        <p className={answerParagraphClass}>{t('public.assurez_vous_que')}</p>
        <ul className="list-disc space-y-1 pl-5 text-base leading-7 text-slate-700">
          <li>{t('public.la_cle_est_correctement_replacee_dans_la_keybox')}</li>
          <li>{t('public.les_portes_et_fenetres_sont_fermees')}</li>
          <li>{t('public.l_etat_des_lieux_de_retour_est_termine')}</li>
          <li>{t('public.l_application_reconnait_bien_la_restitution')}</li>
        </ul>
        <p className={answerParagraphClass}>
          {t('public.si_le_verrouillage_echoue_contactez_immediatement_aide_amp_contact_et_restez')}
        </p>
      </div>
    ),
  },
  {
    question: 'public.que_faire_si_mon_telephone_n_a_plus_de_batterie_de',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          {t('public.votre_smartphone_est_necessaire_pour_plusieurs_etapes_de_la_location_si')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.si_vous_restez_bloque_utilisez_un_autre_appareil_pour_acceder_a')}
        </p>
        <p className={answerParagraphClass}>
          {t('public.ne_tentez_jamais_de_forcer_le_vehicule_la_serrure_ou_la')}
        </p>
      </div>
    ),
  },
]
}

export default function FaqSection() {
  const { t } = useTranslation()
  const faqItems = getFaqItems(t)
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const [showAll, setShowAll] = useState(false)
  const baseId = useId()

  const handleToggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index))
  }

  return (
    <section aria-labelledby="faq-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="faq-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            {t('public.questions_frequentes')}
          </h2>
        </div>

        <div className="mx-auto mt-10 max-w-5xl space-y-3 sm:mt-12 sm:space-y-4">
          {faqItems.map((item, index) => {
            const isOpen = openIndex === index
            const panelId = `${baseId}-panel-${index}`
            const buttonId = `${baseId}-button-${index}`

            return (
              <div key={item.question} className={index < 5 || showAll ? 'grid grid-rows-[1fr] opacity-100 transition-all duration-300 ease-out' : 'hidden'}>
                <div className="overflow-hidden">
                  <div
                    className={`rounded-2xl border bg-white transition-all duration-200 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm ${
                  isOpen
                    ? 'border-blue-300 bg-blue-50/40 shadow-[0_6px_20px_rgba(15,23,42,0.06)]'
                    : 'border-slate-200 shadow-[0_2px_10px_rgba(15,23,42,0.04)]'
                    }`}
                  >
                    <h3>
                      <button
                    id={buttonId}
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl px-5 py-3 text-left text-base font-semibold text-[#1F2937] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:text-lg"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => handleToggle(index)}
                  >
                    <span>{t(item.question)}</span>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 self-center text-[#2563EB] transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                      aria-hidden="true"
                    />
                      </button>
                    </h3>

                    <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className={`grid transition-all duration-200 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                >
                      <div className="overflow-hidden px-5 pb-4">{item.content}</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {faqItems.length > 5 ? (
            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#2563EB] shadow-sm transition-all duration-200 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                {t(showAll ? 'public.voir_moins' : 'public.voir_toutes_les_questions')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function ContactSection() {
  const { t } = useTranslation()
  const contactValueLinkClass = 'text-lg font-medium text-slate-700 transition-colors duration-200 hover:text-blue-600 sm:text-xl break-all'

  return (
    <section id="contact" className="scroll-mt-24" aria-labelledby="contact-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-8 sm:py-7">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="contact-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            {t('public.contact')}
          </h2>
        </div>

        <div className="mx-auto mt-5 grid max-w-5xl grid-cols-1 gap-8 sm:mt-6 md:grid-cols-3 md:gap-6 md:divide-x md:divide-slate-200">
          <div className="flex flex-col items-center gap-2 text-center md:px-6 md:first:pl-0 md:last:pr-0">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB]">
              <Mail className="h-6 w-6" aria-hidden="true" />
            </span>
            <a href="mailto:contact@getacar.be" className={contactValueLinkClass}>
              contact@getacar.be
            </a>
          </div>

          <div className="flex flex-col items-center gap-2 text-center md:px-6 md:first:pl-0 md:last:pr-0">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB]">
              <Phone className="h-6 w-6" aria-hidden="true" />
            </span>
            <a href="tel:+3225551234" className={contactValueLinkClass}>
              +32 2 555 12 34
            </a>
          </div>

          <div className="flex flex-col items-center gap-2 text-center md:px-6 md:first:pl-0 md:last:pr-0">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#2563EB]">
              <MapPin className="h-6 w-6" aria-hidden="true" />
            </span>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Avenue+de+l%27Innovation+12%2C+1000+Bruxelles"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-medium text-slate-700 transition-colors hover:text-blue-600 sm:text-xl"
            >
              Avenue de l'Innovation 12
              <br />
              1000 Bruxelles
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}