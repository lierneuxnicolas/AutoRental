import { useTranslation } from 'react-i18next'
import { ACCOUNT_TERMS_VERSION, RENTAL_TERMS_VERSION } from '../../config/termsVersion'
import StaticInfoPage, { type StaticInfoSection } from './StaticInfoPage'

const sections: StaticInfoSection[] = [
  {
    heading: 'public.conditions_pour_louer',
    paragraphs: [
      'public.le_conducteur_doit_avoir_au_moins_21_ans_une_carte_didentite',
    ],
  },
  {
    heading: 'public.tarifs_et_assurances',
    paragraphs: [
      'public.les_prix_sont_ttc_lassurance_standard_est_incluse_avec_une_franchise',
    ],
  },
  {
    heading: 'public.caution_de_500',
    paragraphs: [
      'public.une_caution_de_500_est_temporairement_bloquee_sur_la_carte_bancaire',
    ],
  },
  {
    heading: 'public.annulation',
    paragraphs: [
      'public.lannulation_est_possible_avant_le_depart_plus_de_24_h_avant',
    ],
  },
  {
    heading: 'public.depart_et_restitution',
    paragraphs: [
      'public.les_etats_des_lieux_avec_photos_sont_obligatoires_le_vehicule_doit',
    ],
  },
  {
    heading: 'public.retards_dommages_et_amendes',
    paragraphs: [
      'public.tout_retard_meme_de_10_minutes_entraine_120_par_periode_de',
    ],
  },
]

export default function RentalTermsPage({ archive = false }: { archive?: boolean }) {
  const { t } = useTranslation()
  const rentalVersionNote = t('public.version_version_conditions_de_location_getacar', { version: RENTAL_TERMS_VERSION })
  return (
    <StaticInfoPage
      title={archive ? 'public.conditions_de_location_et_assurances' : 'public.conditions_generales'}
      sections={archive ? sections : undefined}
      groups={archive ? undefined : [
        {
          id: 'conditions-compte',
          title: 'public.conditions_d_utilisation_du_compte',
          sections: [{
            heading: 'public.utilisation_du_compte_getacar',
            paragraphs: [
              'public.pour_utiliser_getacar_vous_devez_creer_un_compte_avec_des_informations',
            ],
          }],
          note: t('public.version_version_conditions_d_utilisation_du_compte', { version: ACCOUNT_TERMS_VERSION }),
        },
        {
          id: 'conditions-location',
          title: 'public.conditions_de_location',
          sections,
          note: rentalVersionNote,
        },
      ]}
      checkClassName="size-5 shrink-0 text-[#6038FF]"
      footerNote={archive ? t('public.version_version_conditions_de_location_getacar', { version: "1.1" }) : undefined}
    />
  )
}
