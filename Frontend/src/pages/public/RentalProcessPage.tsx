export default function RentalProcessPage() {
  return (
    <section className="py-8 sm:py-12" aria-labelledby="rental-process-title">
      <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white px-5 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-10 sm:py-12 lg:px-12">
        <h1 id="rental-process-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
          Schéma du parcours de location
        </h1>

        <p className="mt-6 text-base leading-7 text-slate-600 sm:text-lg">
          Découvrez les principales étapes d'une location GetaCar, de la création du compte jusqu'à la restitution du véhicule.
        </p>

        <div className="mt-8 flex justify-center">
          <img
            src="/images/rental-process/rental-process-guide.png"
            alt="Schéma du parcours de location GetaCar : création du compte, réservation, prise en charge et restitution du véhicule"
            className="w-full h-auto max-w-6xl rounded-2xl border border-slate-200 object-contain"
          />
        </div>
      </div>
    </section>
  )
}
