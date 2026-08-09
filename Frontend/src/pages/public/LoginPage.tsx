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

const loginSchema = z.object({
  email: z.string().trim().email('Une adresse e-mail valide est requise.'),
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
})

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
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

      if (typeof fromPath === 'string' && fromPath.startsWith('/')) {
        navigate(fromPath)
        return
      }

      navigate('/')
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        const serverMessage = error.response?.data?.detail ?? error.response?.data?.message ?? ''
        const normalizedMessage = String(serverMessage).toLowerCase()

        if (status === 401 || normalizedMessage.includes('invalid') || normalizedMessage.includes('identifiant')) {
          setServerError('Identifiants invalides.')
          return
        }

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
      <div className="w-full max-w-5xl overflow-hidden rounded-4xl border border-slate-200 bg-white shadow-[0_20px_60px_-20px_rgba(37,99,235,0.35)]">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="bg-[#0F172A] p-8 text-white sm:p-10 lg:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-blue-200">AutoRental</p>
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Bienvenue à bord</h1>
            <p className="mt-4 max-w-md text-sm leading-7 text-slate-300 sm:text-base">
              Connectez-vous pour gérer vos réservations, suivre vos véhicules et profiter d’une expérience de location fluide.
            </p>

            <div className="mt-8 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-sm font-medium text-blue-100">Pourquoi se connecter ?</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                <li>• Accéder à votre espace personnel</li>
                <li>• Suivre l’état de vos réservations</li>
                <li>• Consulter vos documents et factures</li>
              </ul>
            </div>
          </div>

          <div className="p-8 sm:p-10 lg:p-12">
            <div className="mb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Connexion</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#0F172A]">Accédez à votre espace</h2>
              <p className="mt-2 text-sm text-slate-600">Saisissez vos identifiants pour continuer.</p>
            </div>

            {serverError ? (
              <Alert variant="danger" title="Connexion impossible" message={serverError} className="mb-6" />
            ) : null}

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Input
                label="Adresse e-mail"
                type="email"
                autoComplete="email"
                placeholder="vous@example.com"
                error={errors.email?.message}
                {...register('email')}
              />

              <Input
                label="Mot de passe"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                error={errors.password?.message}
                {...register('password')}
              />

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Connexion en cours" />
                    Connexion...
                  </span>
                ) : (
                  'Se connecter'
                )}
              </Button>
            </form>

            <div className="mt-6 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <Link to="/forgot-password" className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                Mot de passe oublié ?
              </Link>
              <Link to="/register" className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                Créer un compte
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}