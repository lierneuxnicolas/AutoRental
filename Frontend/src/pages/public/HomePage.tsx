import { useEffect, useState } from 'react'
import Alert from '../../components/feedback/Alert'
import { ERASURE_CONFIRMATION_KEY } from '../../utils/accountErasureResult'
import { CallToAction, Hero, PopularVehicles, SearchSection } from '../../components/home'

export default function HomePage() {
  const [erasureCompleted] = useState(() => window.sessionStorage.getItem(ERASURE_CONFIRMATION_KEY) === '1')
  useEffect(() => {
    if (erasureCompleted) window.sessionStorage.removeItem(ERASURE_CONFIRMATION_KEY)
  }, [erasureCompleted])

  return (
    <div className="flex flex-col gap-8">
      {erasureCompleted ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4" role="status">
          <Alert variant="success" title="Compte supprimé" message="Votre compte a été clôturé et l’effacement des données prévu a été effectué." />
        </div>
      ) : null}
      <Hero />
      <SearchSection />
      <PopularVehicles />
      <CallToAction />
    </div>
  )
}