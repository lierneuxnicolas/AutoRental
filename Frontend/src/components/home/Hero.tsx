import { useTranslation } from 'react-i18next'
export default function Hero() {
  const { t } = useTranslation()
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:p-10 lg:p-12">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight text-[#1F2937] sm:text-5xl lg:text-6xl">
          {t('public.louez_une_voiture_simplement')}
          <br />
          <span className="text-[#2563EB]">{t('public.partout_a_tout_moment')}</span>
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          {t('public.reservez_en_quelques_clics')}
          <br />
          {t('public.deverrouillez_et_roulez_en_toute_liberte')}
        </p>
      </div>
    </section>
  )
}
