import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export default function PublicFooter() {
  const { t } = useTranslation()
  return (
    <footer className="border-t border-[#002B50]/30 bg-[#002B50] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <h3 className="text-base font-semibold text-white">{t('public.a_propos')}</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white">
              <Link to="/about" className="transition hover:underline">{t('public.qui_sommes_nous')}</Link>
              <Link to="/terms" className="transition hover:underline">{t('public.conditions_generales')}</Link>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">{t('public.confidentialite')}</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white">
              <Link to="/privacy" className="transition hover:underline">{t('public.politique_de_confidentialite_et_rgpd')}</Link>
              <Link to="/cookies" className="transition hover:underline">{t('public.gerer_les_cookies')}</Link>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">{t('public.reseaux_sociaux')}</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm text-white">
              <a href="https://www.instagram.com" target="_blank" rel="noreferrer" className="transition hover:underline">Instagram</a>
              <a href="https://www.facebook.com" target="_blank" rel="noreferrer" className="transition hover:underline">Facebook</a>
              <a href="https://www.linkedin.com" target="_blank" rel="noreferrer" className="transition hover:underline">LinkedIn</a>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">{t('public.avis_clients')}</h3>
            <div className="mt-4 rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-sm text-slate-200">{t('public.les_avis_getacar_seront_bientot_disponibles')}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/15 bg-[#002B50] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-center text-sm text-white">
          <p>© 2026 GetACar</p>
        </div>
      </div>
    </footer>
  )
}
