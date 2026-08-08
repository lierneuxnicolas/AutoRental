import { Link } from 'react-router-dom'
import Button from '../ui/Button'

export default function Hero() {
  return (
    <section className="grid items-center gap-10 rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] lg:grid-cols-[1.1fr_0.9fr] lg:p-12">
      <div className="max-w-2xl">
        <div className="mb-5 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-[#2563EB]">
          Location de véhicules 100 % numérique
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-[#1F2937] sm:text-5xl lg:text-6xl">
          Louez une voiture en quelques clics
        </h1>

        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
          Réservez, payez, ouvrez et restituez votre véhicule entièrement depuis l’application AutoRental.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button variant="danger" size="lg">
            <Link to="/vehicles">Réserver maintenant</Link>
          </Button>
          <Button variant="secondary" size="lg">
            <Link to="/#fonctionnement">Découvrir le fonctionnement</Link>
          </Button>
        </div>
      </div>

      <div className="relative">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#93C5FD] p-8 text-white shadow-lg">
          <div className="rounded-[24px] border border-white/20 bg-white/10 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-100">Voiture disponible</p>
                <p className="mt-2 text-2xl font-semibold">Tesla Model 3</p>
              </div>
              <div className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium">
                Électrique
              </div>
            </div>

            <div className="mt-8 h-36 rounded-[24px] border border-dashed border-white/40 bg-white/10" />

            <div className="mt-6 flex items-center justify-between text-sm text-blue-50">
              <span>✔ Disponible</span>
              <span>Bruxelles</span>
              <span>Dès 39 €/jour</span>
            </div>
          </div>
        </div>

        <div className="absolute -bottom-5 right-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <p className="text-sm font-semibold text-[#1F2937]">Réservation fluide</p>
          <p className="text-xs text-slate-500">Ouverture et restitution en quelques minutes</p>
        </div>
      </div>
    </section>
  )
}
