import { Link } from 'react-router-dom'

const footerLinks = [
  { label: 'Véhicules', to: '/vehicles' },
  { label: 'Fonctionnement', to: '/#fonctionnement' },
  { label: 'FAQ', to: '/#faq' },
  { label: 'Assistance', to: '/#assistance' },
  { label: 'Conditions générales', to: '/terms' },
  { label: 'Politique de confidentialité', to: '/terms' },
]

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="max-w-md">
          <p className="text-lg font-semibold tracking-tight text-[#1F2937]">
            <span className="text-[#2563EB]">Auto</span>Rental
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Une expérience simple et fiable pour réserver, conduire et gérer votre location en toute sérénité.
          </p>
        </div>

        <div className="grid gap-4 text-sm text-slate-600 sm:grid-cols-2 lg:min-w-[420px] lg:grid-cols-3">
          {footerLinks.map((item) => (
            <Link key={`${item.to}-${item.label}`} to={item.to} className="transition hover:text-[#2563EB]">
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-[#F5F5F5] px-4 py-4 text-center text-sm text-slate-500 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} AutoRental. Tous droits réservés.
      </div>
    </footer>
  )
}
