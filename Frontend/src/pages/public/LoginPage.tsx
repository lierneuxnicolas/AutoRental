import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import { useAuth } from '../../hooks/useAuth'
import type { LoginCredentials } from '../../types/auth'
import { clearReservationResume, getReservationResume } from '../../utils/reservationResume'

const loginSchema = z.object({
  email: z.string().trim().email('validation.email'),
  password: z.string().min(1, 'validation.password'),
})

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const erasureSessionExpired = new URLSearchParams(location.search).get('session') === 'erasure-expired'
  const { login } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (credentials: LoginCredentials) => {
    setServerError(null)

    try {
      await login(credentials)
      const fromPath = (location.state as { from?: string } | null)?.from
      const resume = getReservationResume(location.state)

      if (typeof fromPath === 'string' && fromPath.startsWith('/')) {
        if (resume) clearReservationResume()
        navigate(fromPath, { state: resume ? { reservationDraft: resume.reservationDraft } : undefined })
        return
      }

      navigate('/')
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        const serverMessage = error.response?.data?.detail ?? error.response?.data?.message ?? ''
        const normalizedMessage = String(serverMessage).toLowerCase()

        if (status === 401 || normalizedMessage.includes('invalid') || normalizedMessage.includes('identifiant')) {
          setServerError('auth.invalidCredentials')
          return
        }

        if (error.code === 'ERR_NETWORK') {
          setServerError('auth.networkError')
          return
        }

        setServerError('auth.retryError')
        return
      }

      setServerError('auth.unexpectedError')
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-4xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-20px_rgba(37,99,235,0.35)] sm:p-10">
            <div className="mb-8">
              <h1 className="text-center text-2xl font-semibold text-[#0F172A]">{t('auth.loginTitle')}</h1>
            </div>

            {erasureSessionExpired && !serverError ? (
              <Alert variant="warning" title={t("auth.expired")} message={t("auth.erasureLogin")} className="mb-6" />
            ) : null}
            {serverError ? (
              <Alert variant="danger" title={t("auth.loginError")} message={t(serverError)} className="mb-6" />
            ) : null}

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Input
                label={t("auth.email")}
                type="email"
                autoComplete="email"
                placeholder={t("auth.emailExample")}
                error={errors.email?.message ? t(errors.email.message) : undefined}
                {...register('email')}
              />

              <Input
                label={t("auth.password")}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                error={errors.password?.message ? t(errors.password.message) : undefined}
                {...register('password')}
              />

              <Button type="submit" variant="violet" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label={t("auth.loginLoading")} />
                    {t('auth.loginPending')}
                  </span>
                ) : (
                  t('auth.login')
                )}
              </Button>
            </form>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-center text-xs text-slate-600 sm:text-sm">
              <Link to="/forgot-password" className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                {t('auth.forgotPassword')}
              </Link>
              <Link to="/register" state={location.state} className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                {t('auth.register')}
              </Link>
        </div>
      </div>
    </div>
  )
}