import axios from 'axios'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import ProfileDocumentsTab from '../../components/profile/ProfileDocumentsTab'
import { getClientProfileMe, getClientProfileProgress, updateClientProfile } from '../../services/authService'
import type { ClientProfileMe, ClientProfileProgress, ClientProfileUpdateRequest } from '../../types/auth'

type ProfileFormValues = {
  first_name: string
  last_name: string
  phone: string
  date_of_birth: string
  address: string
}

type ProfileTabId = 'personal' | 'documents'

type ProfileStatusLabel = {
  label: string
  description: string
  variant: 'info' | 'success' | 'warning' | 'danger'
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return value.slice(0, 10)
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Non renseignée'
  }

  const normalized = value.slice(0, 10)
  const [year, month, day] = normalized.split('-')

  if (!year || !month || !day) {
    return value
  }

  return `${day}/${month}/${year}`
}

function profileStatusDetails(profile: ClientProfileMe | undefined): ProfileStatusLabel {
  if (!profile) {
    return {
      label: 'Statut indisponible',
      description: 'Le statut du profil n’a pas encore été chargé.',
      variant: 'warning',
    }
  }

  switch (profile.profile_status) {
    case 'VALIDE':
      return {
        label: 'Profil valide',
        description: 'Votre profil est complètement validé.',
        variant: 'success',
      }
    case 'EN_ATTENTE':
      return {
        label: 'Profil en attente',
        description: 'Votre profil est en cours de validation par un gestionnaire.',
        variant: 'warning',
      }
    case 'REFUSE':
      return {
        label: 'Profil refusé',
        description: profile.rejection_reason ? `Motif de refus : ${profile.rejection_reason}` : 'Votre profil a été refusé.',
        variant: 'danger',
      }
    case 'EXPIRE':
      return {
        label: 'Profil expiré',
        description: 'Un document de votre profil a expiré et doit être remplacé.',
        variant: 'danger',
      }
    default:
      return {
        label: 'Profil incomplet',
        description: 'Des informations ou documents doivent encore être complétés.',
        variant: 'info',
      }
  }
}

function profileProgressItems(progress: ClientProfileProgress | undefined) {
  if (!progress) {
    return []
  }

  return [
    { key: 'account_created', label: 'Compte créé', done: progress.account_created },
    { key: 'email_verified', label: 'E-mail vérifié', done: progress.email_verified },
    { key: 'personal_information_complete', label: 'Informations personnelles', done: progress.personal_information_complete },
    { key: 'identity_card_valid', label: 'Carte d’identité', done: progress.identity_card_valid },
    { key: 'driving_license_valid', label: 'Permis de conduire', done: progress.driving_license_valid },
  ]
}

function isProfileFullyValidated(progress: ClientProfileProgress | undefined): boolean {
  if (!progress) {
    return false
  }

  return progress.percentage >= 100
    && progress.account_created
    && progress.email_verified
    && progress.personal_information_complete
    && progress.identity_card_valid
    && progress.driving_license_valid
}

type ApiErrorPayload = {
  detail?: string
  date_of_birth?: string | string[]
  [key: string]: unknown
}

const MINIMUM_AGE = 18
const MAXIMUM_AGE = 90

function subtractYears(referenceDate: Date, years: number): Date {
  const targetYear = referenceDate.getFullYear() - years
  const month = referenceDate.getMonth()
  const day = referenceDate.getDate()
  const candidate = new Date(targetYear, month, day)

  if (candidate.getMonth() !== month) {
    return new Date(targetYear, month + 1, 0)
  }

  return candidate
}

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const parsed = new Date(year, monthIndex, day)

  if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) {
    return null
  }

  return parsed
}

function validateDateOfBirth(value: string): true | string {
  if (!value) {
    return true
  }

  const birthDate = parseDateInput(value)
  if (!birthDate) {
    return 'La date de naissance est invalide.'
  }

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const youngestAllowedBirthDate = subtractYears(today, MINIMUM_AGE)
  const oldestAllowedBirthDate = subtractYears(today, MAXIMUM_AGE)

  if (birthDate > today) {
    return 'La date de naissance ne peut pas etre dans le futur.'
  }

  if (birthDate > youngestAllowedBirthDate) {
    return 'Vous devez avoir au moins 18 ans pour utiliser GetACar.'
  }

  if (birthDate < oldestAllowedBirthDate) {
    return "L'âge maximum autorisé pour une location GetACar est de 90 ans."
  }

  return true
}

function extractFieldError(payload: ApiErrorPayload | undefined, field: string): string | null {
  if (!payload) {
    return null
  }

  const raw = payload[field]
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw
  }
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim().length > 0) {
    return raw[0]
  }

  return null
}

function extractApiErrorMessage(error: unknown): string {
  const fallback = 'La mise à jour du profil a échoué. Veuillez réessayer.'

  if (axios.isAxiosError<ApiErrorPayload>(error)) {
    const payload = error.response?.data

    if (typeof payload?.detail === 'string' && payload.detail.trim().length > 0) {
      return payload.detail
    }

    if (error.code === 'ERR_NETWORK') {
      return 'Impossible de joindre le serveur. Vérifiez votre connexion.'
    }
  }

  return fallback
}

export default function ClientProfilePage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ProfileTabId>('personal')

  const profileQuery = useQuery({
    queryKey: ['client-profile-me'],
    queryFn: getClientProfileMe,
  })

  const progressQuery = useQuery({
    queryKey: ['client-profile-progress'],
    queryFn: getClientProfileProgress,
  })

  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      date_of_birth: '',
      address: '',
    },
  })

  useEffect(() => {
    if (profileQuery.data) {
      reset({
        first_name: profileQuery.data.first_name,
        last_name: profileQuery.data.last_name,
        phone: profileQuery.data.phone ?? '',
        date_of_birth: toDateInputValue(profileQuery.data.date_of_birth),
        address: profileQuery.data.address ?? '',
      })
    }
  }, [profileQuery.data, reset])

  useEffect(() => {
    const requestedTab = searchParams.get('tab')
    if (requestedTab === 'documents') {
      setActiveTab('documents')
      return
    }

    if (requestedTab === 'personal') {
      setActiveTab('personal')
    }
  }, [searchParams])

  const updateProfileMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const payload: ClientProfileUpdateRequest = {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        phone: values.phone.trim(),
        date_of_birth: values.date_of_birth ? values.date_of_birth : null,
        address: values.address.trim(),
      }

      return updateClientProfile(payload)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client-profile-me'] }),
        queryClient.invalidateQueries({ queryKey: ['client-profile-progress'] }),
      ])
      setFormError(null)
      setSuccessMessage('Vos informations ont bien été mises à jour.')
    },
    onError: (error) => {
      setSuccessMessage(null)

      if (axios.isAxiosError<ApiErrorPayload>(error)) {
        const payload = error.response?.data
        const dateOfBirthError = extractFieldError(payload, 'date_of_birth')
        if (dateOfBirthError) {
          setError('date_of_birth', { type: 'server', message: dateOfBirthError })
          setFormError(null)
          return
        }
      }

      setFormError(extractApiErrorMessage(error))
    },
  })

  const onSubmit = (values: ProfileFormValues) => {
    setFormError(null)
    setSuccessMessage(null)
    clearErrors('date_of_birth')

    if (!values.first_name.trim() || !values.last_name.trim() || !values.address.trim()) {
      setFormError('Le prénom, le nom et l’adresse sont obligatoires.')
      return
    }

    const dateOfBirthError = validateDateOfBirth(values.date_of_birth)
    if (dateOfBirthError !== true) {
      setError('date_of_birth', { type: 'validate', message: dateOfBirthError })
      return
    }

    void updateProfileMutation.mutateAsync(values)
  }

  const profileStatus = useMemo(() => profileStatusDetails(profileQuery.data), [profileQuery.data])
  const progressItems = useMemo(() => profileProgressItems(progressQuery.data), [progressQuery.data])
  const isLoading = profileQuery.isLoading || progressQuery.isLoading
  const completion = progressQuery.data?.percentage ?? 0
  const profileIsFullyValidated = isProfileFullyValidated(progressQuery.data)
  const progressCircleStyle = { '--progress': completion } as CSSProperties

  if (isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement du profil" />
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {profileQuery.error || progressQuery.error ? (
        <Alert variant="danger" title="Chargement impossible" message="Les informations de profil n’ont pas pu être récupérées. Veuillez réessayer." />
      ) : null}

      <div className="mb-4 mt-2 border-b border-[#E5E7EB]">
        <div className="flex w-full flex-nowrap gap-3 overflow-x-auto pb-2" role="tablist" aria-label="Sections du profil client">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'personal'}
            aria-controls="profile-tab-personal"
            id="profile-tab-trigger-personal"
            onClick={() => setActiveTab('personal')}
            className={`whitespace-nowrap rounded-full px-8 py-3.5 text-xl font-bold leading-none transition ${
              activeTab === 'personal' ? 'bg-[#2563EB] text-white shadow-sm' : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]'
            }`}
          >
            Informations personnelles
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'documents'}
            aria-controls="profile-tab-documents"
            id="profile-tab-trigger-documents"
            onClick={() => setActiveTab('documents')}
            className={`whitespace-nowrap rounded-full px-8 py-3.5 text-xl font-bold leading-none transition ${
              activeTab === 'documents' ? 'bg-[#2563EB] text-white shadow-sm' : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]'
            }`}
          >
            Documents
          </button>
        </div>
      </div>

      {activeTab === 'personal' ? (
        <div id="profile-tab-personal" role="tabpanel" aria-labelledby="profile-tab-trigger-personal" className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card header={<div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[#1F2937]">Profil client</h2><span className="text-sm text-slate-500">{profileQuery.data?.email ?? ''}</span></div>}>
            <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              {formError ? <Alert variant="danger" title="Sauvegarde impossible" message={formError} /> : null}
              {successMessage ? <Alert variant="success" title="Profil mis à jour" message={successMessage} /> : null}

              <div className="grid gap-5 md:grid-cols-2">
                <Input label="Prénom" error={errors.first_name?.message} {...register('first_name')} />
                <Input label="Nom" error={errors.last_name?.message} {...register('last_name')} />
              </div>

              <Input label="Téléphone" error={errors.phone?.message} {...register('phone')} />
              <Input
                label="Date de naissance"
                type="date"
                error={errors.date_of_birth?.message}
                {...register('date_of_birth', {
                  validate: validateDateOfBirth,
                })}
              />
              <Input label="Adresse" error={errors.address?.message} {...register('address')} />

              <Button type="submit" className="w-full" disabled={isSubmitting || updateProfileMutation.isPending}>
                {isSubmitting || updateProfileMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label="Sauvegarde du profil" />
                    Sauvegarde en cours...
                  </span>
                ) : (
                  'Enregistrer les modifications'
                )}
              </Button>
            </form>
          </Card>

          <div className="space-y-6">
            <Card header={<div><h2 className="text-lg font-semibold text-[#1F2937]">Statut du profil</h2><p className="text-sm text-slate-500">État actuel de votre dossier</p></div>}>
              <div className="space-y-4">
                <Alert variant={profileStatus.variant} title={profileStatus.label} message={profileStatus.description} />
                <div className="rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-sm text-slate-600">
                  <p className="font-medium text-[#1F2937]">E-mail</p>
                  <p className="mt-1">{profileQuery.data?.email ?? 'Non renseigné'}</p>
                  <p className="mt-3 font-medium text-[#1F2937]">Date de naissance</p>
                  <p className="mt-1">{formatDate(profileQuery.data?.date_of_birth ?? null)}</p>
                </div>
              </div>
            </Card>

            <Card className="rounded-4xl border-none bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-[1.85rem] font-semibold tracking-tight text-[#0F172A]">Progression de votre profil</h2>
                </div>

                <div className="grid gap-x-10 gap-y-4 md:grid-cols-[192px_1fr] md:items-center">
                  <div className="relative mx-auto flex h-38 w-38 items-center justify-center rounded-full bg-[conic-gradient(#4F46E5_0deg,#4F46E5_calc(var(--progress)*3.6deg),#E2E8F0_calc(var(--progress)*3.6deg),#E2E8F0_360deg)]" style={progressCircleStyle}>
                    <div className="flex h-26 w-26 flex-col items-center justify-center rounded-full bg-white text-center shadow-[inset_0_1px_6px_rgba(15,23,42,0.08)]">
                      <span className="text-3xl font-semibold text-[#0F172A]">{completion}%</span>
                      <span className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Complet</span>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {progressItems.map((item) => (
                      <li key={item.key} className="flex items-center gap-3 text-[0.92rem] font-semibold text-[#0F172A]">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${item.done ? 'border-[#16A34A] bg-[#DCFCE7] text-[#16A34A]' : 'border-slate-300 bg-slate-100 text-transparent'}`}
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {profileIsFullyValidated ? (
                  <div className="w-full rounded-2xl border border-[#BBF7D0] bg-[#DCFCE7] px-4 py-2 text-sm font-medium text-[#166534]">
                    ✓ Votre profil est complet. Vous pouvez réserver un véhicule.
                  </div>
                ) : (
                  <div className="w-full rounded-2xl border border-[#FCD34D] bg-[#FFEDD5] px-4 py-2 text-sm text-[#9A3412]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-medium">⚠ Votre profil doit être complété et vos documents validés avant de pouvoir réserver un véhicule.</p>
                      <Link to="/client/profile?tab=documents" className="shrink-0">
                        <Button className="bg-[#F97316] text-white hover:bg-[#EA580C] focus-visible:ring-[#F97316]">
                          Compléter mon profil
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}

              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div id="profile-tab-documents" role="tabpanel" aria-labelledby="profile-tab-trigger-documents" className="mt-8">
          <ProfileDocumentsTab />
        </div>
      )}
    </section>
  )
}
