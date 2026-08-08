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
  email: z.string().trim().email('Une adresse e-mail valide est requise.'),
})

export default function ForgotPasswordPage() {
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
      const response = await requestPasswordReset(values)
      setServerMessage(response.message)
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ERR_NETWORK') {
          setServerError('Impossible de joindre le serveur. Vérifiez votre connexion.')
          return
        }

        setServerError('Une erreur est survenue. Veuillez réessayer.')
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
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Mot de passe oublié</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-300 sm:text-base">
              Saisissez l’adresse e-mail liée à votre compte. Si elle correspond à un compte actif, vous recevrez des instructions de réinitialisation.
            </p>
          </div>

          <div className="p-8 sm:p-10 lg:p-12">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Sécurité</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#0F172A]">Réinitialiser mon mot de passe</h2>
            </div>

            {serverError ? <Alert variant="danger" title="Demande impossible" message={serverError} className="mb-6" /> : null}
            {serverMessage ? <Alert variant="success" title="Demande envoyée" message={serverMessage} className="mb-6" /> : null}

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Input
                label="Adresse e-mail"
                type="email"
                autoComplete="email"
                placeholder="vous@example.com"
                error={errors.email?.message}
                {...register('email')}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Envoi en cours" />
                    Envoi...
                  </span>
                ) : (
                  'Envoyer les instructions'
                )}
              </Button>
            </form>

            <div className="mt-6 text-sm text-slate-600">
              <span>Vous vous souvenez de votre mot de passe ? </span>
              <a href="/login" className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                Se connecter
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}