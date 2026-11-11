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
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-4xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-20px_rgba(37,99,235,0.35)] sm:p-10">
            <div className="mb-8">
              <h1 className="text-center text-2xl font-semibold text-[#0F172A]">Réinitialiser mon mot de passe</h1>
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

              <Button type="submit" variant="violet" className="w-full" disabled={isSubmitting}>
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

            <div className="mt-6 flex justify-center text-center text-sm text-slate-600">
              <a href="/login" className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                Se connecter
              </a>
        </div>
      </div>
    </div>
  )
}