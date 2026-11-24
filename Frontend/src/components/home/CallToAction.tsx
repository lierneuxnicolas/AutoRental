import { useTranslation } from 'react-i18next'
import { ArrowRight, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'

export default function CallToAction() {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="home-cta-title">
      <div className="relative overflow-hidden rounded-[32px] border border-blue-100 bg-gradient-to-br from-[#2563EB] via-[#3B82F6] to-[#1D4ED8] px-7 py-5 text-white shadow-[0_16px_40px_rgba(37,99,235,0.28)] sm:px-10 sm:py-7 lg:px-12 lg:py-8">
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-blue-200/20 blur-2xl" aria-hidden="true" />

        <div className="relative mx-auto max-w-3xl text-center">
          <h2 id="home-cta-title" className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            {t('public.pret_a_reserver_votre_prochain_vehicule')}
          </h2>

          <div className="mt-4 flex flex-col justify-center gap-3 sm:mt-5 sm:flex-row sm:gap-4">
            <Button variant="secondary" size="lg" className="w-full border border-white/40 bg-white text-[#1F2937] hover:bg-blue-50 sm:w-auto">
              <Link to="/register" className="inline-flex items-center gap-2">
                {t('auth.register')}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>

            <Button variant="secondary" size="lg" className="w-full border border-white/50 bg-transparent text-white hover:bg-white/10 sm:w-auto">
              <Link to="/login" className="inline-flex items-center gap-2">
                {t('public.connexion')}
                <LogIn className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}