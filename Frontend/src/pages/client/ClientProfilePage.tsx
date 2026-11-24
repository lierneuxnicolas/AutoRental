import { clientDisplay } from '../../i18n/clientDisplay'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import AccountErasureAction from '../../components/profile/AccountErasureAction'
import ProfileDocumentsTab from '../../components/profile/ProfileDocumentsTab'
import { getClientProfileMe, getClientProfileProgress, updateClientProfile } from '../../services/authService'
import type { ClientProfileProgress, ClientProfileUpdateRequest } from '../../types/auth'

type ProfileFormValues = {
  first_name: string
  last_name: string
  phone: string
  date_of_birth: string
  address: string
}

type ProfileTabId = 'personal' | 'documents'

function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return value.slice(0, 10)
}

function profileProgressItems(progress: ClientProfileProgress | undefined) {
  if (!progress) {
    return []
  }

  return [
    { key: 'account_created', label: 'Compte créé', done: progress.account_created },
    { key: 'email_verified', label: 'E-mail vérifié', done: progress.email_verified },
    { key: 'personal_information_complete', label: 'Informations personnelles', done: progress.personal_information_complete },
    { key: 'identity_card_valid', label: progress.identity_card_issue ?? 'Carte d’identité', done: progress.identity_card_valid },
    { key: 'driving_license_valid', label: progress.driving_license_issue ?? 'Permis de conduire', done: progress.driving_license_valid },
  ]
}

type ApiErrorPayload = {
  detail?: string
  first_name?: string | string[]
  last_name?: string | string[]
  phone?: string | string[]
  date_of_birth?: string | string[]
  [key: string]: unknown
}

const MINIMUM_AGE = 21
const MAXIMUM_AGE = 90
const NAME_PATTERN = /^[\p{L}]+(?:[ '\u2019-][\p{L}]+)*$/u
const PHONE_PATTERN = /^\d{10}$/

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

function dateInputValue(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validatePersonName(value: string, label: string): true | string {
  const normalized = value.trim().normalize('NFC')
  if (!normalized || !NAME_PATTERN.test(normalized)) {
    return `Le ${label} ne peut contenir que des lettres, des espaces, des apostrophes ou des traits d'union.`
  }
  return true
}

function validatePhoneNumber(value: string): true | string {
  const normalized = value.trim()
  if (normalized && !PHONE_PATTERN.test(normalized)) {
    return 'Le numéro de téléphone doit contenir exactement 10 chiffres.'
  }
  return true
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
  const oldestAllowedBirthDate = subtractYears(today, MAXIMUM_AGE)

  if (birthDate > today) {
    return 'La date de naissance ne peut pas etre dans le futur.'
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
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const activeTab: ProfileTabId = searchParams.get('tab') === 'documents' ? 'documents' : 'personal'

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
    control,
    handleSubmit,
    reset,
    setError,
    setFocus,
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
  const declaredBirthDate = useWatch({ control, name: 'date_of_birth' })
  const parsedBirthDate = parseDateInput(declaredBirthDate)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const isUnderMinimumAge = parsedBirthDate !== null && parsedBirthDate <= today && parsedBirthDate > subtractYears(today, MINIMUM_AGE)

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

  const selectTab = (tab: ProfileTabId) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tab', tab)
      return next
    }, { replace: true })
  }

  const updateProfileMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      const payload: ClientProfileUpdateRequest = {
        phone: values.phone.trim(),
        address: values.address.trim(),
        ...(!profileQuery.data?.identity_locked ? {
          first_name: values.first_name.trim(),
          last_name: values.last_name.trim(),
          date_of_birth: values.date_of_birth ? values.date_of_birth : null,
        } : {}),
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
        const fieldErrors: Array<[keyof ProfileFormValues, string]> = []
        const fields: Array<[keyof ProfileFormValues, string]> = [
          ['first_name', 'first_name'],
          ['last_name', 'last_name'],
          ['phone', 'phone'],
          ['date_of_birth', 'date_of_birth'],
        ]
        fields.forEach(([field, payloadField]) => {
          const message = extractFieldError(payload, payloadField)
          if (message) {
            fieldErrors.push([field, message])
          }
        })
        if (fieldErrors.length > 0) {
          fieldErrors.forEach(([field, message]) => {
            setError(field, { type: 'server', message })
          })
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

  const progressItems = useMemo(() => profileProgressItems(progressQuery.data), [progressQuery.data])
  const isLoading = profileQuery.isLoading || progressQuery.isLoading
  const completion = progressQuery.data?.percentage ?? 0
  const progressCircleStyle = { '--progress': completion } as CSSProperties
  const profileStatus = progressQuery.data?.profile_status
  const profileStatusLabel = profileStatus === 'VALIDE'
    ? t('client.profil_complet')
    : profileStatus === 'EN_ATTENTE' || profileStatus === 'EN_ATTENTE_VALIDATION'
      ? t('client.en_attente_de_validation')
      : 'Profil incomplet'
  const profileStatusClass = profileStatus === 'VALIDE'
    ? 'border-[#BBF7D0] bg-[#DCFCE7] text-[#166534]'
    : profileStatus === 'EN_ATTENTE' || profileStatus === 'EN_ATTENTE_VALIDATION'
      ? 'border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]'
      : 'border-[#FECACA] bg-[#FEE2E2] text-[#991B1B]'

  const completeRequiredInformation = () => {
    if (progressQuery.data?.documents_need_action) {
      selectTab('documents')
      return
    }

    const profile = profileQuery.data
    const firstMissingField: keyof ProfileFormValues | undefined = !profile?.first_name.trim()
      ? 'first_name'
      : !profile?.last_name.trim()
        ? 'last_name'
        : !profile?.phone.trim()
          ? 'phone'
          : !profile?.date_of_birth
            ? 'date_of_birth'
            : !profile?.address.trim()
              ? 'address'
              : undefined

    if (firstMissingField) {
      setFocus(firstMissingField)
    }
  }

  if (isLoading) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label={t('client.chargement_du_profil')} />
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {profileQuery.error || progressQuery.error ? (
        <Alert variant="danger" title={t('client.chargement_impossible')} message={t('client.les_informations_de_profil_nont_pas_pu_etre_recuperees_veuillez_reessayer')} />
      ) : null}

      <div className="mb-4 mt-2 border-b border-[#E5E7EB]">
        <div className="flex w-full flex-nowrap gap-3 overflow-x-auto pb-2" role="tablist" aria-label={t('client.sections_du_profil_client')}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'personal'}
            aria-controls="profile-tab-personal"
            id="profile-tab-trigger-personal"
            onClick={() => selectTab('personal')}
            className={`whitespace-nowrap rounded-full px-8 py-3.5 text-xl font-bold leading-none transition ${
              activeTab === 'personal' ? 'bg-[#2563EB] text-white shadow-sm' : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]'
            }`}
          >
            {t('client.informations_personnelles')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'documents'}
            aria-controls="profile-tab-documents"
            id="profile-tab-trigger-documents"
            onClick={() => selectTab('documents')}
            className={`whitespace-nowrap rounded-full px-8 py-3.5 text-xl font-bold leading-none transition ${
              activeTab === 'documents' ? 'bg-[#2563EB] text-white shadow-sm' : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]'
            }`}
          >
            {t('client.documents')}
          </button>
        </div>
      </div>

      {activeTab === 'personal' ? (
        <div id="profile-tab-personal" role="tabpanel" aria-labelledby="profile-tab-trigger-personal" className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <Card
            className="flex h-full flex-col"
            contentClassName="flex flex-1 flex-col"
            header={<h2 className="text-xl font-semibold text-[#1F2937]">{t('client.informations_personnelles')}</h2>}
          >
            <form id="personal-information-form" className="flex flex-1 flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
              {formError ? <Alert variant="danger" title={t('client.sauvegarde_impossible')} message={clientDisplay(t, formError)} /> : null}
              {successMessage ? <p role="status" className="text-sm font-medium text-green-700">{clientDisplay(t, successMessage)}</p> : null}

              <Input
                label={t('client.adresse_e_mail')}
                value={profileQuery.data?.email ?? ''}
                readOnly
                helperText={t('client.la_modification_de_ladresse_e_mail_securisee_sera_disponible_ulterieurement')}
              />
              <div className="grid gap-5 md:grid-cols-2">
                <Input
                  label={t('client.prenom')}
                  readOnly={profileQuery.data?.identity_locked}
                  error={(errors.first_name?.message) ? clientDisplay(t, errors.first_name?.message ?? '') : undefined}
                  {...register('first_name', { validate: (value) => validatePersonName(value, 'prénom') })}
                />
                <Input
                  label={t('client.nom')}
                  readOnly={profileQuery.data?.identity_locked}
                  error={(errors.last_name?.message) ? clientDisplay(t, errors.last_name?.message ?? '') : undefined}
                  {...register('last_name', { validate: (value) => validatePersonName(value, 'nom') })}
                />
                <Input
                  label={t('client.telephone')}
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  error={(errors.phone?.message) ? clientDisplay(t, errors.phone?.message ?? '') : undefined}
                  {...register('phone', { validate: validatePhoneNumber })}
                />
                <div>
                  <Input
                    label={t('client.date_de_naissance')}
                    type="date"
                    readOnly={profileQuery.data?.identity_locked}
                    min={dateInputValue(subtractYears(new Date(), MAXIMUM_AGE))}
                    max={dateInputValue(new Date())}
                    error={(errors.date_of_birth?.message) ? clientDisplay(t, errors.date_of_birth?.message ?? '') : undefined}
                    {...register('date_of_birth', {
                      validate: (value) => profileQuery.data?.identity_locked || validateDateOfBirth(value),
                    })}
                  />
                  <p className={`mt-1 text-sm ${isUnderMinimumAge ? 'text-red-600' : 'text-slate-500'}`}>
                    {t('client.vous_devez_avoir_au_moins_21_ans_pour_louer_un_vehicule')}
                  </p>
                </div>
              </div>
              <Input label={t('client.adresse_du_domicile')} error={(errors.address?.message) ? clientDisplay(t, errors.address?.message ?? '') : undefined} {...register('address')} />

              <Button type="submit" variant="violet" size="sm" className="mt-auto w-11/12 self-center bg-[#6038FF]! hover:bg-[#6038FF]! focus-visible:ring-[#6038FF]!" disabled={isSubmitting || updateProfileMutation.isPending}>
                {isSubmitting || updateProfileMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" aria-label={t('client.sauvegarde_du_profil')} />
                    {t('client.sauvegarde_en_cours')}
                  </span>
                ) : (
                  t('client.enregistrer_les_modifications')
                )}
              </Button>
            </form>
            <AccountErasureAction />
          </Card>

          <Card
            contentClassName="px-4! py-4! sm:px-5!"
            header={
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h2 className="text-xl font-semibold text-[#1F2937]">{t('client.mon_profil')}</h2>
                <span className={`rounded-full border px-4 py-2 text-center text-sm font-semibold ${profileStatusClass}`}>
                  {clientDisplay(t, profileStatusLabel)}
                </span>
              </div>
            }
          >
            <div className="grid grid-cols-[minmax(7.5rem,48%)_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[44%_minmax(0,1fr)] sm:gap-4">
              <div className="flex justify-center">
                <div className="relative flex aspect-square w-full max-w-52 items-center justify-center rounded-full bg-[conic-gradient(#4F46E5_0deg,#4F46E5_calc(var(--progress)*3.6deg),#E2E8F0_calc(var(--progress)*3.6deg),#E2E8F0_360deg)] p-3 sm:p-4" style={progressCircleStyle}>
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
                    <span className="text-[2rem] leading-none font-semibold text-[#0F172A] sm:text-[2.5rem]">{completion}%</span>
                    <span className="mt-1.5 text-[0.8125rem] font-semibold uppercase tracking-wide text-slate-500 sm:text-sm">{t('client.complet')}</span>
                  </div>
                </div>
              </div>

              <ul className="flex flex-col gap-2" aria-label={t('client.criteres_de_completude_du_profil')}>
                {progressItems.map((item) => (
                  <li key={item.key} className="flex items-center gap-2 text-sm font-medium text-[#1F2937] min-[375px]:text-[0.9375rem] sm:text-base">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${item.done ? 'border-[#16A34A] bg-[#DCFCE7] text-[#16A34A]' : 'border-slate-300 bg-slate-100 text-transparent'}`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <span>{clientDisplay(t, item.label)}</span>
                  </li>
                ))}
              </ul>

              {progressQuery.data?.needs_client_action ? (
                <Button type="button" className="col-span-2 w-full" onClick={completeRequiredInformation}>
                  {t('client.completer_mon_profil')}
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      ) : (
        <div id="profile-tab-documents" role="tabpanel" aria-labelledby="profile-tab-trigger-documents" className="mt-8">
          <ProfileDocumentsTab />
        </div>
      )}
    </section>
  )
}
