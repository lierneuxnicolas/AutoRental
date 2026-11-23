import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { newPasswordSchema } from '../../utils/passwordValidation'
import axios from 'axios'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import { resetPassword } from '../../services/authService'
import type { PasswordResetConfirmRequest } from '../../types/auth'

const resetPasswordSchema = z
  .object({
    uid: z.string().min(1, 'Le lien de réinitialisation est incomplet.'),
    token: z.string().min(1, 'Le lien de réinitialisation est incomplet.'),
    new_password: newPasswordSchema,
    new_password_confirm: z.string().min(1, 'La confirmation du mot de passe est obligatoire.'),
  })
  .refine((data) => data.new_password === data.new_password_confirm, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['new_password_confirm'],
  })

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const uid = searchParams.get('uid') ?? ''
  const token = searchParams.get('token') ?? ''
  const isReady = useMemo(() => Boolean(uid && token), [uid, token])

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetConfirmRequest>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      uid,
      token,
      new_password: '',
      new_password_confirm: '',
    },
  })

  const passwordValue = useWatch({ control, name: 'new_password' })

  const onSubmit = async (values: PasswordResetConfirmRequest) => {
    setServerError(null)
    setSuccessMessage(null)

    try {
      await resetPassword({
        uid: values.uid || uid,
        token: values.token || token,
        new_password: values.new_password,
        new_password_confirm: values.new_password_confirm,
      })
      setSuccessMessage('Votre mot de passe a été réinitialisé avec succès.')
      window.setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data
        let hasPasswordError = false
        for (const field of ['new_password', 'new_password_confirm'] as const) {
          const message = Array.isArray(data?.[field]) ? data[field][0] : data?.[field]
          if (typeof message === 'string') {
            setError(field, { type: 'server', message })
            hasPasswordError = true
          }
        }
        if (hasPasswordError) {
          return
        }
        const detail = data?.detail ?? data?.message

        if (error.code === 'ERR_NETWORK') {
          setServerError('Impossible de joindre le serveur. Vérifiez votre connexion.')
          return
        }

        setServerError(typeof detail === 'string' ? detail : 'Le lien de réinitialisation est invalide ou a expiré.')
        return
      }

      setServerError('Une erreur inattendue s’est produite.')
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-[radial-gradient(circle_at_top,#EFF6FF,#FFFFFF_70%)] px-4 py-12">
      <div className="w-full max-w-4xl overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-[0_20px_60px_-20px_rgba(37,99,235,0.35)]">
        <div className="grid gap-0 lg:grid-cols-[1fr_1fr]">
          <div className="bg-[#0F172A] p-8 text-white sm:p-10 lg:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-200">AutoRental</p>
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Réinitialiser votre mot de passe</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-300 sm:text-base">
              Choisissez un nouveau mot de passe pour sécuriser votre compte.
            </p>
          </div>

          <div className="p-8 sm:p-10 lg:p-12">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Mot de passe</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#0F172A]">Créer un nouveau mot de passe</h2>
            </div>

            {serverError ? <Alert variant="danger" title="Réinitialisation impossible" message={serverError} className="mb-6" /> : null}
            {successMessage ? <Alert variant="success" title="Réinitialisation réussie" message={successMessage} className="mb-6" /> : null}

            {!isReady ? (
              <Alert
                variant="warning"
                title="Lien incomplet"
                message="Le lien de réinitialisation est incomplet. Veuillez utiliser le lien envoyé par e-mail."
                className="mb-6"
              />
            ) : null}

            {isReady ? (
              <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
                <PasswordInput
                  label="Nouveau mot de passe"
                  minimumLengthValue={passwordValue}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  error={errors.new_password?.message}
                  {...register('new_password')}
                />

                <PasswordInput
                  label="Confirmer le nouveau mot de passe"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  error={errors.new_password_confirm?.message}
                  {...register('new_password_confirm')}
                />

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <LoadingSpinner size="sm" aria-label="Réinitialisation en cours" />
                      Réinitialisation...
                    </span>
                  ) : (
                    'Réinitialiser le mot de passe'
                  )}
                </Button>
              </form>
            ) : null}

            <div className="mt-6 text-sm text-slate-600">
              <Link to="/login" className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                Retour à la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
