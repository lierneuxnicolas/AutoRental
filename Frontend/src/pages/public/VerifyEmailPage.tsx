import { authMessageKey } from '../../i18n/authMessages'
import { Trans, useTranslation } from 'react-i18next'
import { Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import { verifyEmail } from '../../services/authService'
import { getReservationResume, readReservationResume } from '../../utils/reservationResume'

export default function VerifyEmailPage() {
  const { t } = useTranslation()
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
        await verifyEmail({ token })
        setMessage(null)
        setStatus('success')
      } catch (error) {
        const fallback = 'public.la_verification_a_echoue_le_lien_est_peut_etre_invalide_ou'

        if (error && typeof error === 'object' && 'response' in error) {
          const response = error.response as { data?: { detail?: string } }
          setMessage(response?.data?.detail ? authMessageKey(response.data.detail) : fallback)
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
        <h1 className="text-2xl font-semibold text-slate-900">{t('public.verifiez_votre_e_mail')}</h1>

        {status === 'loading' ? (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-600" role="status">
            <LoadingSpinner size="sm" aria-hidden="true" />
            {t('public.verification_en_cours')}
          </div>
        ) : null}
        {status === 'success' ? (
          <Alert variant="success" message={t(message ?? 'public.votre_e_mail_a_bien_ete_confirme')} className="mt-4" />
        ) : null}
        {status === 'error' ? (
          <Alert variant="danger" message={t(message ?? 'public.la_verification_a_echoue')} className="mt-4" />
        ) : null}
        {status === 'idle' ? (
          <p className="mt-4 break-words text-sm leading-6 text-slate-600">
            {pendingVerification || email ? (
              email ? <Trans i18nKey="public.un_lien_de_confirmation_a_ete_envoye_a_email_address_email" values={{ address: email }} components={{ email: <strong className="font-semibold text-slate-900" /> }} /> : t('public.un_lien_de_confirmation_a_ete_envoye')
            ) : t('public.aucun_lien_de_verification_na_ete_fourni')}
          </p>
        ) : null}

        <Link
          to="/login"
          state={reservationResume}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#6038FF] px-5 text-sm font-medium text-white transition-colors hover:bg-[#4F2BE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6038FF] focus-visible:ring-offset-2"
        >
          {t('auth.login')}
        </Link>
      </section>
    </div>
  )
}
