import { Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import { verifyEmail } from '../../services/authService'
import { getReservationResume, readReservationResume } from '../../utils/reservationResume'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'idle'>('loading')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get('token') ?? searchParams.get('code') ?? ''

    if (!token) {
      const timeoutId = window.setTimeout(() => {
        setStatus('idle')
        setMessage(null)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }

    const verify = async () => {
      setStatus('loading')
      setMessage(null)

      try {
        const response = await verifyEmail({ token })
        setMessage(response.message)
        setStatus('success')
      } catch (error) {
        const fallback = 'La vérification a échoué. Le lien est peut-être invalide ou expiré.'

        if (error && typeof error === 'object' && 'response' in error) {
          const response = error.response as { data?: { detail?: string } }
          setMessage(response?.data?.detail ?? fallback)
        } else {
          setMessage(fallback)
        }

        setStatus('error')
      }
    }

    void verify()
  }, [searchParams])

  const pendingVerification = Boolean((location.state as { pendingVerification?: boolean } | null)?.pendingVerification)
  const email = (location.state as { email?: string } | null)?.email ?? searchParams.get('email') ?? ''
  const reservationResume = getReservationResume(location.state) ?? readReservationResume()

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <Mail aria-hidden="true" className="mx-auto mb-4 size-6 text-[#6038FF]" />
        <h1 className="text-2xl font-semibold text-slate-900">Vérifiez votre e-mail</h1>

        {status === 'loading' ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600" role="status">
            <LoadingSpinner size="sm" aria-hidden="true" />
            Vérification en cours…
          </div>
        ) : null}
        {status === 'success' ? (
          <Alert variant="success" message={message ?? 'Votre e-mail a bien été confirmé.'} className="mt-4" />
        ) : null}
        {status === 'error' ? (
          <Alert variant="danger" message={message ?? 'La vérification a échoué.'} className="mt-4" />
        ) : null}
        {status === 'idle' ? (
          <p className="mt-4 break-words text-sm leading-6 text-slate-600">
            {pendingVerification || email ? (
              <>Un lien de confirmation a été envoyé{email ? <> à <strong className="font-semibold text-slate-900">{email}</strong></> : null}.</>
            ) : 'Aucun lien de vérification n’a été fourni.'}
          </p>
        ) : null}

        <Link
          to="/login"
          state={reservationResume}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#6038FF] px-5 text-sm font-medium text-white transition-colors hover:bg-[#4F2BE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6038FF] focus-visible:ring-offset-2"
        >
          Se connecter
        </Link>
      </section>
    </div>
  )
}
