import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, Link } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axios from 'axios'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import { register as registerUser } from '../../services/authService'
import type { RegisterRequest } from '../../types/auth'

const registerSchema = z
  .object({
    first_name: z.string().trim().min(1, 'Le prénom est obligatoire.'),
    last_name: z.string().trim().min(1, 'Le nom est obligatoire.'),
    email: z.string().trim().email('Une adresse e-mail valide est requise.'),
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.'),
    password_confirm: z.string().min(1, 'La confirmation du mot de passe est obligatoire.'),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['password_confirm'],
  })

export default function RegisterPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterRequest>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      password_confirm: '',
    },
  })

  const onSubmit = async (values: RegisterRequest) => {
    setServerError(null)
    setFieldErrors({})

    try {
      await registerUser(values)
      navigate('/verify-email', { state: { pendingVerification: true, email: values.email } })
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined
        const mappedErrors: Record<string, string> = {}

        if (data && typeof data === 'object') {
          Object.entries(data).forEach(([key, value]) => {
            if (key === 'detail' && typeof value === 'string') {
              setServerError(value)
              return
            }

            if (Array.isArray(value)) {
              mappedErrors[key] = String(value[0])
            } else if (typeof value === 'string') {
              mappedErrors[key] = value
            }
          })
        }

        if (Object.keys(mappedErrors).length > 0) {
          setFieldErrors(mappedErrors)
          return
        }

        if (error.code === 'ERR_NETWORK') {
          setServerError('Impossible de joindre le serveur. Vérifiez votre connexion.')
          return
        }

        setServerError('Une erreur est survenue lors de la création du compte.')
        return
      }

      setServerError('Une erreur inattendue s’est produite.')
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-5xl overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-[0_20px_60px_-20px_rgba(37,99,235,0.35)]">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="bg-[#0F172A] p-8 text-white sm:p-10 lg:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-200">GetaCar</p>
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Créer votre compte</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-300 sm:text-base">
              Rejoignez GetaCar pour réserver un véhicule, suivre vos contrats et profiter d’une expérience simplifiée.
            </p>
          </div>

          <div className="p-8 sm:p-10 lg:p-12">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Inscription</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#0F172A]">Démarrez votre aventure</h2>
              <p className="mt-2 text-sm text-slate-600">Remplissez les informations ci-dessous pour créer votre compte.</p>
            </div>

            {serverError ? <Alert variant="danger" title="Création du compte impossible" message={serverError} className="mb-6" /> : null}

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  label="Prénom"
                  autoComplete="given-name"
                  placeholder="Jean"
                  error={fieldErrors.first_name ?? errors.first_name?.message}
                  {...register('first_name')}
                />

                <Input
                  label="Nom"
                  autoComplete="family-name"
                  placeholder="Dupont"
                  error={fieldErrors.last_name ?? errors.last_name?.message}
                  {...register('last_name')}
                />
              </div>

              <Input
                label="Adresse e-mail"
                type="email"
                autoComplete="email"
                placeholder="vous@example.com"
                error={fieldErrors.email ?? errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Mot de passe"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                error={fieldErrors.password ?? errors.password?.message}
                {...register('password')}
              />

              <Input
                label="Confirmer le mot de passe"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                error={fieldErrors.password_confirm ?? errors.password_confirm?.message}
                {...register('password_confirm')}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Création du compte" />
                    Création du compte...
                  </span>
                ) : (
                  'Créer mon compte'
                )}
              </Button>
            </form>

            <div className="mt-6 text-sm text-slate-600">
              <span>Vous avez déjà un compte ? </span>
              <Link to="/login" className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                Se connecter
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}