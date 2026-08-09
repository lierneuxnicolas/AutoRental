import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { getClientProfileMe, getClientProfileProgress, updateClientProfile } from '../../services/authService'
import type { ClientProfileMe, ClientProfileProgress, ClientProfileUpdateRequest } from '../../types/auth'

type ProfileFormValues = {
  first_name: string
  last_name: string
  phone: string
  date_of_birth: string
  address: string
}

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

type ApiErrorPayload = {
  detail?: string
  [key: string]: unknown
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
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

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
      setFormError(extractApiErrorMessage(error))
    },
  })

  const onSubmit = (values: ProfileFormValues) => {
    setFormError(null)
    setSuccessMessage(null)

    if (!values.first_name.trim() || !values.last_name.trim() || !values.address.trim()) {
      setFormError('Le prénom, le nom et l’adresse sont obligatoires.')
      return
    }

    void updateProfileMutation.mutateAsync(values)
  }

  const profileStatus = useMemo(() => profileStatusDetails(profileQuery.data), [profileQuery.data])
  const progressItems = useMemo(() => profileProgressItems(progressQuery.data), [progressQuery.data])
  const isLoading = profileQuery.isLoading || progressQuery.isLoading

  if (isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement du profil" />
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Mon profil</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Informations personnelles</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Mettez à jour vos informations client et suivez la progression de votre profil.
          </p>
        </div>
      </div>

      {profileQuery.error || progressQuery.error ? (
        <Alert variant="danger" title="Chargement impossible" message="Les informations de profil n’ont pas pu être récupérées. Veuillez réessayer." />
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card header={<div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold text-[#1F2937]">Profil client</h2><span className="text-sm text-slate-500">{profileQuery.data?.email ?? ''}</span></div>}>
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            {formError ? <Alert variant="danger" title="Sauvegarde impossible" message={formError} /> : null}
            {successMessage ? <Alert variant="success" title="Profil mis à jour" message={successMessage} /> : null}

            <div className="grid gap-5 md:grid-cols-2">
              <Input label="Prénom" error={errors.first_name?.message} {...register('first_name')} />
              <Input label="Nom" error={errors.last_name?.message} {...register('last_name')} />
            </div>

            <Input label="Téléphone" error={errors.phone?.message} {...register('phone')} />
            <Input label="Date de naissance" type="date" error={errors.date_of_birth?.message} {...register('date_of_birth')} />
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

          <Card header={<div><h2 className="text-lg font-semibold text-[#1F2937]">Progression du profil</h2><p className="text-sm text-slate-500">Pourcentage réel fourni par l’API</p></div>}>
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-4xl font-semibold text-[#0F172A]">{progressQuery.data?.percentage ?? 0}%</p>
                  <p className="mt-1 text-sm text-slate-500">Progression actuelle</p>
                </div>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-[#E5E7EB]">
                <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${Math.max(0, Math.min(100, progressQuery.data?.percentage ?? 0))}%` }} />
              </div>

              <ul className="space-y-3">
                {progressItems.map((item) => (
                  <li key={item.key} className="flex items-center justify-between rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937]">
                    <span>{item.label}</span>
                    <span className={`font-semibold ${item.done ? 'text-[#15803D]' : 'text-[#C2410C]'}`}>{item.done ? 'OK' : 'À faire'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
