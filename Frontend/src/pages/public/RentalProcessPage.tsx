import { useTranslation } from 'react-i18next'
export default function RentalProcessPage() {
  const { t } = useTranslation()
  return (
    <section className="py-8 sm:py-12" aria-labelledby="rental-process-title">
      <div className="mx-auto max-w-6xl rounded-[32px] border border-slate-200 bg-white px-5 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:px-10 sm:py-12 lg:px-12">
        <h1 id="rental-process-title" className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-4xl">
          {t('public.schema_du_parcours_de_location')}
        </h1>

        <p className="mt-6 text-base leading-7 text-slate-600 sm:text-lg">
          {t('public.decouvrez_les_principales_etapes_d_une_location_getacar_de_la_creation')}
        </p>

        <div className="mt-8 flex justify-center">
          <img
            src="/images/rental-process/rental-process-guide.png"
            alt={t('public.schema_du_parcours_de_location_getacar_creation_du_compte_reservation_prise')}
            className="w-full h-auto max-w-6xl rounded-2xl border border-slate-200 object-contain"
          />
        </div>
      </div>
    </section>
  )
}
