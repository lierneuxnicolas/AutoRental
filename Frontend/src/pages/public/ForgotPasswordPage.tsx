import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import { requestPasswordReset } from '../../services/authService'
import type { PasswordResetRequest } from '../../types/auth'

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('validation.email'),
})

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [serverMessage, setServerMessage] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetRequest>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  })

  const onSubmit = async (values: PasswordResetRequest) => {
    setServerError(null)
    setServerMessage(null)

    try {
      await requestPasswordReset(values)
      setServerMessage('public.si_un_compte_existe_pour_cette_adresse_vous_recevrez_un_e')
    } catch (error) {
      if (axios.isAxiosError(error)) {
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
              <h1 className="text-center text-2xl font-semibold text-[#0F172A]">{t('public.reinitialiser_mon_mot_de_passe')}</h1>
            </div>

            {serverError ? <Alert variant="danger" title={t('public.demande_impossible')} message={t(serverError)} className="mb-6" /> : null}
            {serverMessage ? <Alert variant="success" title={t('public.demande_envoyee')} message={t(serverMessage)} className="mb-6" /> : null}

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Input
                label={t('auth.email')}
                type="email"
                autoComplete="email"
                placeholder={t('auth.emailExample')}
                error={errors.email?.message ? t(errors.email.message) : undefined}
                {...register('email')}
              />

              <Button type="submit" variant="violet" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label={t('public.envoi_en_cours')} />
                    {t('public.envoi')}
                  </span>
                ) : (
                  t('public.envoyer_les_instructions')
                )}
              </Button>
            </form>

            <div className="mt-6 flex justify-center text-center text-sm text-slate-600">
              <a href="/login" className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                {t('auth.login')}
              </a>
        </div>
      </div>
    </div>
  )
}