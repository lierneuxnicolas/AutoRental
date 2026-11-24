import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Alert from '../../components/feedback/Alert'
import { ERASURE_CONFIRMATION_KEY } from '../../utils/accountErasureResult'
import { CallToAction, Hero, PopularVehicles, SearchSection } from '../../components/home'

export default function HomePage() {
  const { t } = useTranslation()
  const [erasureCompleted] = useState(() => window.sessionStorage.getItem(ERASURE_CONFIRMATION_KEY) === '1')
  useEffect(() => {
    if (erasureCompleted) window.sessionStorage.removeItem(ERASURE_CONFIRMATION_KEY)
  }, [erasureCompleted])

  return (
    <div className="flex flex-col gap-8">
      {erasureCompleted ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4" role="status">
          <Alert variant="success" title={t('public.compte_supprime')} message={t('public.votre_compte_a_ete_cloture_et_leffacement_des_donnees_prevu_a')} />
        </div>
      ) : null}
      <Hero />
      <SearchSection />
      <PopularVehicles />
      <CallToAction />
    </div>
  )
}