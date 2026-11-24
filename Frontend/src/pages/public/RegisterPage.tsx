import { Trans, useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createPasswordSchema } from '../../utils/passwordValidation'
import axios from 'axios'
import Input from '../../components/ui/Input'
import PasswordInput from '../../components/ui/PasswordInput'
import Button from '../../components/ui/Button'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import { register as registerUser } from '../../services/authService'
import { authMessageKey } from '../../i18n/authMessages'
import { ACCOUNT_TERMS_VERSION } from '../../config/termsVersion'
import type { RegisterRequest } from '../../types/auth'
import { clearReservationResume, getReservationResume, saveReservationResume } from '../../utils/reservationResume'

type RegisterFormValues = Omit<RegisterRequest, 'terms_version'>

const registerSchema = z
  .object({
    first_name: z.string().trim().min(1, 'validation.firstName'),
    last_name: z.string().trim().min(1, 'validation.lastName'),
    email: z.string().trim().email('validation.email'),
    password: createPasswordSchema('validation.passwordLength', 'validation.passwordCharacter'),
    terms_accepted: z.boolean().refine((accepted) => accepted, 'validation.terms'),
    password_confirm: z.string().min(1, 'validation.confirmPassword'),
  })
  .refine((data) => data.password === data.password_confirm, {
    message: 'validation.passwordMismatch',
    path: ['password_confirm'],
  })

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      password_confirm: '',
      terms_accepted: false,
    },
  })

  const passwordValue = useWatch({ control, name: 'password' })

  const validationMessage = (key?: string) => key ? t(key) : undefined
  const termsError = validationMessage(fieldErrors.terms_accepted) ?? validationMessage(fieldErrors.terms_version) ?? validationMessage(errors.terms_accepted?.message)

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null)
    setFieldErrors({})

    try {
      await registerUser({ ...values, terms_version: ACCOUNT_TERMS_VERSION })
      const resume = getReservationResume(location.state)
      if (resume) {
        saveReservationResume(resume)
      } else {
        clearReservationResume()
      }
      navigate('/verify-email', { state: { pendingVerification: true, email: values.email, ...resume } })
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as Record<string, unknown> | undefined
        const mappedErrors: Record<string, string> = {}

        if (data && typeof data === 'object') {
          Object.entries(data).forEach(([key, value]) => {
            if (key === 'detail' && typeof value === 'string') {
              setServerError(authMessageKey(value))
              return
            }

            if (Array.isArray(value)) {
              mappedErrors[key] = authMessageKey(String(value[0]))
            } else if (typeof value === 'string') {
              mappedErrors[key] = authMessageKey(value)
            }
          })
        }

        if (Object.keys(mappedErrors).length > 0) {
          setFieldErrors(mappedErrors)
          return
        }

        if (error.code === 'ERR_NETWORK') {
          setServerError('auth.networkError')
          return
        }

        setServerError('auth.registrationFailed')
        return
      }

      setServerError('auth.unexpectedError')
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-4xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-20px_rgba(37,99,235,0.35)] sm:p-10">
            <div className="mb-8">
              <h1 className="text-center text-2xl font-semibold text-[#0F172A]">{t('auth.registerTitle')}</h1>
            </div>

            {serverError ? <Alert variant="danger" title={t("auth.registerError")} message={t(serverError)} className="mb-6" /> : null}

            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  label={t("auth.firstName")}
                  autoComplete="given-name"
                  placeholder={t("auth.firstNameExample")}
                  error={validationMessage(fieldErrors.first_name) ?? validationMessage(errors.first_name?.message)}
                  {...register('first_name')}
                />

                <Input
                  label={t("auth.lastName")}
                  autoComplete="family-name"
                  placeholder={t("auth.lastNameExample")}
                  error={validationMessage(fieldErrors.last_name) ?? validationMessage(errors.last_name?.message)}
                  {...register('last_name')}
                />
              </div>

              <Input
                label={t("auth.email")}
                type="email"
                autoComplete="email"
                placeholder={t("auth.emailExample")}
                error={validationMessage(fieldErrors.email) ?? validationMessage(errors.email?.message)}
                {...register('email')}
              />

              <PasswordInput
                label={t("auth.password")}
                localize
                minimumLengthValue={passwordValue}
                autoComplete="new-password"
                placeholder="••••••••"
                error={validationMessage(fieldErrors.password) ?? validationMessage(errors.password?.message)}
                {...register('password')}
              />

              <PasswordInput
                label={t("auth.confirmPassword")}
                localize
                autoComplete="new-password"
                placeholder="••••••••"
                error={validationMessage(fieldErrors.password_confirm) ?? validationMessage(errors.password_confirm?.message)}
                {...register('password_confirm')}
              />

              <div>
                <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                  <input
                    type="checkbox"
                    required
                    aria-invalid={termsError ? true : undefined}
                    aria-describedby={termsError ? 'register-terms-error' : undefined}
                    className="mt-1 size-4 shrink-0 accent-[#6038FF]"
                    {...register('terms_accepted')}
                  />
                  <span>
                    <Trans
                      i18nKey="auth.termsConsent"
                      components={{ terms: <Link to="/terms#conditions-compte" target="_blank" rel="noopener noreferrer" className="font-medium text-[#6038FF] underline" /> }}
                    />
                  </span>
                </label>
                {termsError ? <p id="register-terms-error" role="alert" className="mt-1 text-sm text-red-700">{termsError}</p> : null}
              </div>

              <Button type="submit" variant="violet" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label={t("auth.registerLoading")} />
                    {t('auth.registerPending')}
                  </span>
                ) : (
                  t('auth.submitRegister')
                )}
              </Button>
            </form>

            <div className="mt-6 flex flex-wrap justify-center gap-x-1 text-center text-sm text-slate-600">
              <span>{t('auth.alreadyRegistered')}</span>
              <Link to="/login" state={location.state} className="font-medium text-[#2563EB] transition hover:text-[#1D4ED8]">
                {t('auth.login')}
              </Link>
        </div>
      </div>
    </div>
  )
}