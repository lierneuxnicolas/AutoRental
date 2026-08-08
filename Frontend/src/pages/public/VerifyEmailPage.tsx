import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import { verifyEmail } from '../../services/authService'

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

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-[radial-gradient(circle_at_top,#EFF6FF,#FFFFFF_70%)] px-4 py-12">
      <div className="w-full max-w-3xl overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-[0_20px_60px_-20px_rgba(37,99,235,0.35)]">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="bg-[#0F172A] p-8 text-white sm:p-10 lg:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-200">AutoRental</p>
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Vérification de votre e-mail</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-300 sm:text-base">
              Confirmez votre adresse pour pouvoir utiliser votre espace AutoRental de façon complète.
            </p>
          </div>

          <div className="p-8 sm:p-10 lg:p-12">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Authentification</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#0F172A]">État de la vérification</h2>
            </div>

            {status === 'loading' ? (
              <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <LoadingSpinner size="sm" aria-label="Vérification en cours" />
                Vérification de votre adresse e-mail en cours...
              </div>
            ) : null}

            {status === 'success' ? (
              <Alert variant="success" title="Adresse vérifiée" message={message ?? 'Votre e-mail a bien été confirmé.'} className="mb-6" />
            ) : null}

            {status === 'error' ? (
              <Alert variant="danger" title="Vérification impossible" message={message ?? 'La vérification a échoué.'} className="mb-6" />
            ) : null}

            {status === 'idle' ? (
              <Alert
                variant="info"
                title="Vérification en attente"
                message={
                  pendingVerification || email
                    ? `Un e-mail de confirmation a été envoyé${email ? ` à ${email}` : ''}. Veuillez cliquer sur le lien reçu pour finaliser l’inscription.`
                    : 'Aucun jeton de vérification n’a été trouvé dans l’URL.'
                }
                className="mb-6"
              />
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className="inline-flex">
                <Button type="button" className="w-full sm:w-auto">Se connecter</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
