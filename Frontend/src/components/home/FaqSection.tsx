import type { ReactNode } from 'react'
import { ChevronDown, Mail, MapPin, Phone } from 'lucide-react'
import { useId, useState } from 'react'

type FaqItem = {
  question: string
  content: ReactNode
}

const answerParagraphClass = 'text-base leading-7 text-slate-700'
const contactLinkClass = 'font-semibold text-[#2563EB] hover:underline break-all'

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Comment créer et valider mon compte GetaCar ?',
    content: (
      <p className={answerParagraphClass}>
        Créez votre compte sur la plateforme, complétez vos informations personnelles puis téléversez votre carte d'identité et votre permis de conduire. Votre profil doit être validé avant de pouvoir réserver un véhicule. Vous devez avoir au moins 21 ans et vos documents doivent rester valides jusqu'à la fin de la location.
      </p>
    ),
  },
  {
    question: 'Comment réserver un véhicule et quand ma réservation est-elle confirmée ?',
    content: (
      <p className={answerParagraphClass}>
        Choisissez un véhicule disponible, sélectionnez vos dates et les options souhaitées. Votre réservation est définitivement confirmée lorsque le paiement est accepté et que la préautorisation de la caution est validée.
      </p>
    ),
  },
  {
    question: 'Comment fonctionnent le paiement et la caution ?',
    content: (
      <p className={answerParagraphClass}>
        Le paiement correspond au montant de votre location. La caution est une préautorisation bancaire distincte : le montant est temporairement réservé sur votre carte sans être automatiquement débité. Elle peut notamment servir à couvrir des dommages, retards, amendes ou autres frais justifiés liés à la location.
      </p>
    ),
  },
  {
    question: 'Quand ma caution est-elle libérée après la location ?',
    content: (
      <p className={answerParagraphClass}>
        La préautorisation peut être conservée pendant maximum 7 jours après la restitution. Ce délai permet à GetaCar de vérifier les états des lieux, les éventuels dommages et les incohérences qui n'auraient pas été détectées immédiatement. Si aucun frais n'est constaté, la caution est libérée. Toute retenue doit être justifiée.
      </p>
    ),
  },
  {
    question: 'Comment récupérer et déverrouiller le véhicule ?',
    content: (
      <p className={answerParagraphClass}>
        Rendez-vous à l'emplacement indiqué dans votre réservation. Lorsque vous êtes à proximité du véhicule, utilisez l'application GetaCar pour lancer le déverrouillage. Votre réservation doit être active, votre paiement et votre caution validés, et les étapes nécessaires au départ doivent être complétées.
      </p>
    ),
  },
  {
    question: 'Comment faire le plein et quand dois-je le faire ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          Le niveau de carburant est enregistré lors des états des lieux de départ et de retour. Avant de restituer le véhicule, vous devez ramener le niveau de carburant à au moins 90 %.
        </p>
        <p className={answerParagraphClass}>
          Utilisez la carte carburant présente dans le véhicule. Lors du paiement à la station-service, le terminal peut vous demander le code PIN de la carte ainsi que le kilométrage actuel du véhicule. Conservez le ticket de carburant jusqu'à la fin de votre location. Si le véhicule est rendu avec moins de 90 % de carburant, des frais peuvent être appliqués.
        </p>
      </div>
    ),
  },
  {
    question: 'Comment réaliser l\'état des lieux de départ ?',
    content: (
      <p className={answerParagraphClass}>
        Avant de prendre la route, contrôlez notamment la carrosserie, les vitres, les rétroviseurs, les pneus, la propreté, le niveau de carburant, le kilométrage, les voyants du tableau de bord et les équipements présents. Prenez les photos demandées dans l'application et signalez toute anomalie avant de commencer la location.
      </p>
    ),
  },
  {
    question: 'Que faire si je constate un dommage avant de partir ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          Ne démarrez pas sans avoir signalé le problème. Ajoutez une description et des photos dans l'état des lieux.
        </p>
        <p className={answerParagraphClass}>
          Si le problème est mineur, il est enregistré dans votre dossier. En cas de problème important — par exemple un véhicule accidenté, une vitre cassée, un pneu endommagé ou un voyant rouge — le véhicule est placé <strong className="font-semibold text-[#1F2937]">« À contrôler »</strong> et ne doit pas être utilisé. La réservation peut alors être annulée et vous devrez effectuer une nouvelle réservation avec un autre véhicule disponible.
        </p>
      </div>
    ),
  },
  {
    question: 'Que faire si le véhicule ne se déverrouille pas ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          Vérifiez que votre réservation est active, que les étapes de départ sont terminées et que vous êtes bien à proximité du véhicule. Vérifiez également votre connexion et relancez l'application si nécessaire.
        </p>
        <p className={answerParagraphClass}>
          Si le véhicule reste verrouillé, utilisez la rubrique Aide &amp; Contact. Ne tentez jamais de forcer une porte ou une serrure.
        </p>
      </div>
    ),
  },
  {
    question: 'Que faire si la clé ou la Keybox ne fonctionne pas ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          La clé physique est conservée dans une Keybox installée dans le véhicule, notamment dans la boîte à gants. Elle devient accessible lorsque les conditions de départ sont remplies.
        </p>
        <p className={answerParagraphClass}>
          Si la Keybox ne s'ouvre pas, si la clé reste bloquée ou si le système ne reconnaît pas correctement la clé, ne forcez rien. Signalez immédiatement le problème via Aide &amp; Contact.
        </p>
      </div>
    ),
  },
  {
    question: 'Que faire en cas de panne ou d\'accident pendant la location ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          Mettez-vous d'abord en sécurité et ne poursuivez pas votre trajet si le véhicule présente un danger. Si nécessaire, contactez les services d'urgence.
        </p>
        <p className={answerParagraphClass}>
          Signalez ensuite l'incident dans l'application GetaCar avec une description et des photos. Si le véhicule ne peut plus rouler, contactez le service d'assistance lié au contrat de leasing :
        </p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-[#1F2937]">GetaCar Assistance – Renault Leasing</p>
          <p className="mt-1">
            <a href="tel:080012424" className={contactLinkClass}>0800 12 424</a>
          </p>
          <p className="mt-1 text-xs text-slate-500">Numéro fictif utilisé pour la démonstration du projet</p>
          <p className="mt-1 text-sm text-slate-600">Assistance 24 h/24 – 7 j/7</p>
        </div>
        <p className={answerParagraphClass}>
          En cas d'accident avec un autre véhicule ou un tiers, remplissez également le constat d'accident et conservez les coordonnées des personnes impliquées.
        </p>
      </div>
    ),
  },
  {
    question: 'Que se passe-t-il si j\'endommage le véhicule ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          Signalez immédiatement le dommage dans l'application et ajoutez des photos. En cas d'accident avec un tiers, complétez également le constat d'accident.
        </p>
        <p className={answerParagraphClass}>
          Envoyez ensuite le constat par e-mail à :{' '}
          <a href="mailto:sinistres@getacar.be" className={contactLinkClass}>sinistres@getacar.be</a>
        </p>
        <p className={answerParagraphClass}>
          Indiquez votre nom, votre numéro de réservation et, si possible, joignez des photos de l'accident.
        </p>
        <p className={answerParagraphClass}>
          Si le véhicule ne peut plus rouler en sécurité, contactez GetaCar Assistance – Renault Leasing au{' '}
          <a href="tel:080012424" className={contactLinkClass}>0800 12 424</a>. Le véhicule pourra être placé <strong className="font-semibold text-[#1F2937]">« À contrôler »</strong> et envoyé vers un garage ou un service de dépannage partenaire.
        </p>
        <p className={answerParagraphClass}>
          Les éventuels frais dépendent des circonstances de l'accident, des dommages constatés, de l'assurance choisie et de la franchise applicable. Toute somme réclamée doit pouvoir être justifiée.
        </p>
      </div>
    ),
  },
  {
    question: 'Comment restituer et verrouiller le véhicule ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          Ramenez le véhicule à l'emplacement prévu, coupez le moteur et fermez toutes les fenêtres. Réalisez ensuite l'état des lieux de retour avec les photos demandées.
        </p>
        <p className={answerParagraphClass}>
          Replacez la clé dans la Keybox. Une fois la présence de la clé confirmée, verrouillez le véhicule depuis l'application et vérifiez que la location est bien indiquée comme terminée.
        </p>
      </div>
    ),
  },
  {
    question: 'Que faire si le véhicule ne se verrouille pas ou si la restitution ne se termine pas ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          Ne quittez pas le véhicule tant que vous n'avez pas vérifié qu'il est correctement fermé.
        </p>
        <p className={answerParagraphClass}>Assurez-vous que :</p>
        <ul className="list-disc space-y-1 pl-5 text-base leading-7 text-slate-700">
          <li>la clé est correctement replacée dans la Keybox ;</li>
          <li>les portes et fenêtres sont fermées ;</li>
          <li>l'état des lieux de retour est terminé ;</li>
          <li>l'application reconnaît bien la restitution.</li>
        </ul>
        <p className={answerParagraphClass}>
          Si le verrouillage échoue, contactez immédiatement Aide &amp; Contact et restez à proximité du véhicule jusqu'à recevoir les instructions nécessaires.
        </p>
      </div>
    ),
  },
  {
    question: 'Que faire si mon téléphone n\'a plus de batterie, de réseau ou si l\'application ne fonctionne plus ?',
    content: (
      <div className="space-y-3">
        <p className={answerParagraphClass}>
          Votre smartphone est nécessaire pour plusieurs étapes de la location. Si possible, rechargez-le, rétablissez votre connexion ou redémarrez l'application.
        </p>
        <p className={answerParagraphClass}>
          Si vous restez bloqué, utilisez un autre appareil pour accéder à Aide &amp; Contact ou contactez le numéro d'assistance indiqué dans les informations de votre réservation.
        </p>
        <p className={answerParagraphClass}>
          Ne tentez jamais de forcer le véhicule, la serrure ou la Keybox.
        </p>
      </div>
    ),
  },
]

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const baseId = useId()

  const handleToggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index))
  }

  return (
    <section aria-labelledby="faq-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-8 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="faq-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Questions fréquentes
          </h2>
        </div>

        <div className="mx-auto mt-10 max-w-5xl space-y-3 sm:mt-12 sm:space-y-4">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index
            const panelId = `${baseId}-panel-${index}`
            const buttonId = `${baseId}-button-${index}`

            return (
              <div
                key={item.question}
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
                    <span>{item.question}</span>
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
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function ContactSection() {
  const contactValueLinkClass = 'text-lg font-medium text-slate-700 transition-colors duration-200 hover:text-blue-600 sm:text-xl break-all'

  return (
    <section id="contact" className="scroll-mt-24" aria-labelledby="contact-title">
      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-8 sm:py-7">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="contact-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
            Contact
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