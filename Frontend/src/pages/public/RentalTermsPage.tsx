import { ACCOUNT_TERMS_VERSION, RENTAL_TERMS_VERSION } from '../../config/termsVersion'
import StaticInfoPage, { type StaticInfoSection } from './StaticInfoPage'

const sections: StaticInfoSection[] = [
  {
    heading: 'Conditions pour louer',
    paragraphs: [
      "Le conducteur doit avoir **au moins 21 ans**, une carte d’identité et un permis de conduire validés, **valables jusqu’à la fin de la location**. Le permis doit être **compatible avec le véhicule choisi**.",
    ],
  },
  {
    heading: 'Tarifs et assurances',
    paragraphs: [
      "Les prix sont **TTC**. L’assurance **Standard** est incluse avec une franchise de **1 000 €**. L’assurance **Complémentaire** coûte **10 €/jour** et réduit la franchise à **300 €** pour les dommages couverts. La franchise correspond à la part des dommages qui reste à la charge du client.",
    ],
  },
  {
    heading: 'Caution de 500 €',
    paragraphs: [
      "Une caution de **500 €** est temporairement bloquée sur la carte bancaire, **sans débit immédiat**. Elle peut le rester jusqu’au contrôle du véhicule et à la finalisation de la facture, dans la limite de validité de l’autorisation bancaire. Les **frais justifiés** peuvent être retenus et le solde est libéré.",
    ],
  },
  {
    heading: 'Annulation',
    paragraphs: [
      "L’annulation est possible avant le départ. **Plus de 24 h avant le départ**, des frais de gestion de **20 €** sont déduits et le solde est remboursé. **À 24 h du départ ou moins**, le prix de la location n’est pas remboursé.",
    ],
  },
  {
    heading: 'Départ et restitution',
    paragraphs: [
      "Les **états des lieux avec photos** sont obligatoires. Le véhicule doit être restitué au **parking prévu**, avec le **même niveau de carburant** qu’au départ. Le kilométrage est relevé.",
    ],
  },
  {
    heading: 'Retards, dommages et amendes',
    paragraphs: [
      "Tout retard, **même de 10 minutes**, entraîne **120 € par période de 24 h entamée**. Le carburant manquant, les dommages justifiés et les amendes imputables au conducteur peuvent être facturés selon les conditions applicables.",
    ],
  },
]

const rentalVersionNote = `Version ${RENTAL_TERMS_VERSION} – Conditions de location GetaCar`

export default function RentalTermsPage({ archive = false }: { archive?: boolean }) {
  return (
    <StaticInfoPage
      title={archive ? "Conditions de location et assurances" : "Conditions générales"}
      sections={archive ? sections : undefined}
      groups={archive ? undefined : [
        {
          id: 'conditions-compte',
          title: "Conditions d'utilisation du compte",
          sections: [{
            heading: 'Utilisation du compte GetaCar',
            paragraphs: [
              "Pour utiliser GetaCar, vous devez créer un compte avec des informations exactes, confirmer votre adresse e-mail et respecter les règles du service. Vous êtes responsable de la confidentialité de vos identifiants. L'accès aux réservations nécessite un profil et des documents validés. Toute utilisation frauduleuse ou abusive peut entraîner la suspension du compte.",
            ],
          }],
          note: `Version ${ACCOUNT_TERMS_VERSION} – Conditions d'utilisation du compte`,
        },
        {
          id: 'conditions-location',
          title: 'Conditions de location',
          sections,
          note: rentalVersionNote,
        },
      ]}
      checkClassName="size-5 shrink-0 text-[#6038FF]"
      footerNote={archive ? "Version 1.1 – Conditions de location GetaCar" : undefined}
    />
  )
}
