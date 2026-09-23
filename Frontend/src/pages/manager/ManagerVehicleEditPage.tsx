import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import {
  deleteVehiclePhoto,
  getBrands,
  getManagementVehicleById,
  getParkingSpaceOptions,
  getVehicleCategoryOptions,
  getVehicleEquipmentCatalog,
  updateVehicle,
  uploadVehiclePhoto,
} from '../../services/managementVehicleService'
import { getVehicleById } from '../../services/vehicleService'
import { resolveMediaUrl } from '../../utils/media'
import type {
  ManagementVehicleDetailResponse,
  VehicleManagementStatus,
  VehicleManagementUpdateRequest,
} from '../../types/managementVehicle'
import type { PublicVehicle } from '../../types/vehicle'

interface ManagerVehicleEditPageProps {
  basePath?: string
}

type ClientVisibleTab = 'features' | 'equipment' | 'conditions'

const statusOptions: Array<{ value: VehicleManagementStatus; label: string }> = [
  { value: 'DISPONIBLE', label: 'Disponible' },
  { value: 'RESERVE', label: 'Réservé' },
  { value: 'LOUE', label: 'Loué' },
  { value: 'A_CONTROLER', label: 'À contrôler' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'NETTOYAGE', label: 'Nettoyage' },
  { value: 'ACCIDENTE', label: 'Accidenté' },
  { value: 'INDISPONIBLE', label: 'Indisponible' },
]

interface BackendValidationErrorPayload {
  detail?: string
  non_field_errors?: string[]
  [key: string]: unknown
}

type VehicleFieldName =
  | 'brand'
  | 'category'
  | 'parking_space'
  | 'registration_number'
  | 'model_name'
  | 'year'
  | 'color'
  | 'fuel_type'
  | 'transmission'
  | 'seats'
  | 'doors'
  | 'mileage'
  | 'category_daily_rate'
  | 'description'
  | 'is_active'
  | 'power_hp'
  | 'consumption'
  | 'trunk_volume'
  | 'euro_standard'
  | 'included_km_per_day'
  | 'extra_km_price'
  | 'minimum_age'
  | 'required_license'
  | 'recommended_use'
  | 'equipment'

type VehicleFormFieldErrors = Partial<Record<VehicleFieldName, string>>

const FRIENDLY_FIELD_ERRORS: Partial<Record<VehicleFieldName, string>> = {
  brand: 'La marque doit être sélectionnée.',
  category: 'La catégorie doit être sélectionnée.',
  parking_space: 'La place de parking doit être sélectionnée.',
  registration_number: 'L\'immatriculation doit être valide.',
  model_name: 'Le modèle doit être valide.',
  year: 'L\'année doit être valide.',
  color: 'La couleur doit être valide.',
  fuel_type: 'La motorisation doit être valide.',
  transmission: 'La boîte de vitesses doit être valide.',
  seats: 'Le nombre de places doit être valide.',
  doors: 'Le nombre de portes doit être valide.',
  mileage: 'Le kilométrage doit être valide.',
  category_daily_rate: 'Le tarif journalier doit être valide.',
  power_hp: 'La puissance doit être valide.',
  consumption: 'La consommation doit être valide.',
  trunk_volume: 'Le volume du coffre doit être valide.',
  included_km_per_day: 'Le kilométrage inclus doit être valide.',
  extra_km_price: 'Le prix du kilomètre supplémentaire doit être valide.',
  minimum_age: 'L\'âge minimum doit être valide.',
  equipment: 'Les équipements sélectionnés doivent être valides.',
}

const ACCEPTED_FIELD_NAMES: VehicleFieldName[] = [
  'brand',
  'category',
  'parking_space',
  'registration_number',
  'model_name',
  'year',
  'color',
  'fuel_type',
  'transmission',
  'seats',
  'doors',
  'mileage',
  'category_daily_rate',
  'description',
  'is_active',
  'power_hp',
  'consumption',
  'trunk_volume',
  'euro_standard',
  'included_km_per_day',
  'extra_km_price',
  'minimum_age',
  'required_license',
  'recommended_use',
  'equipment',
]

interface FormState {
  brand: string
  category: string
  parking_space: string
  registration_number: string
  model_name: string
  year: string
  color: string
  fuel_type: string
  transmission: string
  seats: string
  doors: string
  mileage: string
  category_daily_rate: string
  status: VehicleManagementStatus
  is_active: boolean
  description: string
  power_hp: string
  consumption: string
  trunk_volume: string
  euro_standard: string
  included_km_per_day: string
  extra_km_price: string
  minimum_age: string
  required_license: string
  recommended_use: string
  equipment: number[]
}

interface ConditionDraftState {
  caution: string
  documents: string
  fuel: string
  late: string
  cancellation: string
  inspection: string
}

const emptyConditionDraft: ConditionDraftState = {
  caution: '',
  documents: '',
  fuel: '',
  late: '',
  cancellation: '',
  inspection: '',
}

function toFormState(vehicle: ManagementVehicleDetailResponse): FormState {
  return {
    brand: String(vehicle.brand),
    category: String(vehicle.category),
    parking_space: String(vehicle.parking_space),
    registration_number: vehicle.registration_number,
    model_name: vehicle.model_name,
    year: String(vehicle.year),
    color: vehicle.color,
    fuel_type: vehicle.fuel_type,
    transmission: vehicle.transmission,
    seats: String(vehicle.seats),
    doors: String(vehicle.doors),
    mileage: typeof vehicle.mileage === 'number' ? String(vehicle.mileage) : '',
    category_daily_rate: formatCurrency(vehicle.category_daily_rate),
    status: vehicle.status,
    is_active: vehicle.is_active ?? true,
    description: vehicle.description ?? '',
    power_hp: typeof vehicle.power_hp === 'number' ? String(vehicle.power_hp) : '',
    consumption: vehicle.consumption ?? '',
    trunk_volume: typeof vehicle.trunk_volume === 'number' ? String(vehicle.trunk_volume) : '',
    euro_standard: vehicle.euro_standard ?? '',
    included_km_per_day: typeof vehicle.included_km_per_day === 'number' ? String(vehicle.included_km_per_day) : '',
    extra_km_price: vehicle.extra_km_price ?? '',
    minimum_age: typeof vehicle.minimum_age === 'number' ? String(vehicle.minimum_age) : '',
    required_license: vehicle.required_license ?? '',
    recommended_use: vehicle.recommended_use ?? '',
    equipment: vehicle.equipment ?? [],
  }
}

function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toOptionalCurrencyNumber(value: string): number | undefined {
  const normalized = value.replace(/€/g, '').replace(/\s/g, '').replace(',', '.').trim()
  if (normalized === '') {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toPatchPayload(values: FormState): VehicleManagementUpdateRequest {
  const payload: VehicleManagementUpdateRequest = {
    brand: Number(values.brand),
    category: Number(values.category),
    parking_space: Number(values.parking_space),
    registration_number: values.registration_number.trim(),
    model_name: values.model_name.trim(),
    year: Number(values.year),
    color: values.color.trim(),
    fuel_type: values.fuel_type.trim(),
    transmission: values.transmission.trim(),
    seats: Number(values.seats),
    doors: Number(values.doors),
    status: values.status,
    is_active: values.is_active,
    equipment: values.equipment,
  }

  const mileage = toOptionalNumber(values.mileage)
  if (mileage !== undefined) {
    payload.mileage = mileage
  }

  const categoryDailyRate = toOptionalCurrencyNumber(values.category_daily_rate)
  if (categoryDailyRate !== undefined) {
    payload.category_daily_rate = categoryDailyRate
  }

  const description = values.description.trim()
  if (description) {
    payload.description = description
  }

  payload.power_hp = toOptionalNumber(values.power_hp) ?? null
  payload.consumption = toOptionalNumber(values.consumption) ?? null
  payload.trunk_volume = toOptionalNumber(values.trunk_volume) ?? null
  payload.included_km_per_day = toOptionalNumber(values.included_km_per_day) ?? null
  payload.extra_km_price = toOptionalNumber(values.extra_km_price) ?? null
  payload.minimum_age = toOptionalNumber(values.minimum_age) ?? null

  const euroStandard = values.euro_standard.trim()
  payload.euro_standard = euroStandard || undefined

  const requiredLicense = values.required_license.trim()
  payload.required_license = requiredLicense || undefined

  const recommendedUse = values.recommended_use.trim()
  payload.recommended_use = recommendedUse || undefined

  return payload
}

function getApiErrorMessage(error: unknown): { title: string; message: string; is404: boolean } {
  if (!axios.isAxiosError(error)) {
    return {
      title: 'Erreur API',
      message: 'Une erreur inattendue est survenue lors du chargement du vehicule.',
      is404: false,
    }
  }

  const statusCode = error.response?.status

  if (statusCode === 404) {
    return {
      title: 'Vehicule introuvable',
      message: 'Le vehicule demande n\'existe pas ou n\'est plus accessible.',
      is404: true,
    }
  }

  const detail = error.response?.data && typeof error.response.data === 'object' && 'detail' in error.response.data
    ? String((error.response.data as { detail?: unknown }).detail ?? '')
    : ''

  return {
    title: 'Erreur API',
    message: detail.trim().length > 0 ? detail : 'Impossible de charger le vehicule pour le moment.',
    is404: false,
  }
}

function toGeneralSubmitError(payload: BackendValidationErrorPayload | undefined): string {
  if (payload?.detail === 'Le vehicule est introuvable.' || payload?.detail === 'Not found.') {
    return 'Le véhicule est introuvable ou a été supprimé.'
  }

  return 'Impossible d’enregistrer les modifications.'
}

function mapBackendFieldErrors(payload: BackendValidationErrorPayload | undefined): VehicleFormFieldErrors {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const acceptedFields = new Set<VehicleFieldName>(ACCEPTED_FIELD_NAMES)
  const fieldErrors: VehicleFormFieldErrors = {}

  Object.entries(payload).forEach(([key, value]) => {
    if (!acceptedFields.has(key as VehicleFieldName)) {
      return
    }

    if (Array.isArray(value) && value.length > 0) {
      fieldErrors[key as VehicleFieldName] = FRIENDLY_FIELD_ERRORS[key as VehicleFieldName] ?? 'La valeur doit être valide.'
      return
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      fieldErrors[key as VehicleFieldName] = FRIENDLY_FIELD_ERRORS[key as VehicleFieldName] ?? 'La valeur doit être valide.'
    }
  })

  return fieldErrors
}

interface PhotoApiDetailPayload {
  detail?: string
  file?: string[]
  caption?: string[]
  position?: string[]
}

function getPhotoUploadErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur inattendue est survenue pendant l\'upload.'
  }

  if (!error.response) {
    return 'Erreur reseau: impossible de contacter le serveur.'
  }

  if (error.response.status === 403) {
    return 'Vous n\'avez pas les permissions pour ajouter une photo a ce vehicule.'
  }

  if (error.response.status === 404) {
    return 'Le vehicule est introuvable ou a ete supprime.'
  }

  const payload = error.response.data as PhotoApiDetailPayload | undefined

  if (payload?.detail && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (Array.isArray(payload?.file) && payload.file.length > 0) {
    return payload.file[0]
  }

  return 'Impossible d\'ajouter la photo pour le moment.'
}

function getPhotoDeleteErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Une erreur inattendue est survenue pendant la suppression.'
  }

  if (!error.response) {
    return 'Erreur reseau: impossible de contacter le serveur.'
  }

  if (error.response.status === 403) {
    return 'Vous n\'avez pas les permissions pour supprimer cette photo.'
  }

  if (error.response.status === 404) {
    return 'La photo ou le vehicule est introuvable.'
  }

  const payload = error.response.data as PhotoApiDetailPayload | undefined

  if (payload?.detail && payload.detail.trim().length > 0) {
    return payload.detail
  }

  return 'Impossible de supprimer la photo pour le moment.'
}

function getMainPhoto(vehicle: PublicVehicle): PublicVehicle['main_photo'] {
  if (vehicle.main_photo) {
    return vehicle.main_photo
  }

  return vehicle.photos.length > 0 ? vehicle.photos[0] : null
}

function formatCurrency(value: string | number | null | undefined): string {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) {
    return 'Non renseigné'
  }

  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(amount)
}

function buildConditionDraft(
  caution: string | number | null | undefined,
  conditions: PublicVehicle['conditions'] | undefined,
): ConditionDraftState {
  return {
    caution: formatCurrency(caution),
    documents: "Carte d'identité et permis de conduire",
    fuel: conditions?.fuel_tracking?.managed_in_inspections
      ? "Restitution avec le même niveau qu'au départ"
      : 'Suivi lors des états des lieux',
    late: `Tolérance de ${conditions?.late_policy?.early_tolerance_minutes ?? '—'} min avant / ${conditions?.late_policy?.late_tolerance_minutes ?? '—'} min après`,
    cancellation: 'Selon les statuts de réservation annulables',
    inspection: `Départ et retour obligatoires (${conditions?.inspection_policy?.mandatory_photo_count ?? '—'} photos requises)`,
  }
}

export default function ManagerVehicleEditPage({ basePath = '/manager' }: ManagerVehicleEditPageProps) {
  const queryClient = useQueryClient()
  const { id } = useParams<{ id: string }>()
  const [apiError, setApiError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<VehicleFormFieldErrors>({})
  const [formState, setFormState] = useState<FormState | null>(null)
  const [photoUploadFile, setPhotoUploadFile] = useState<File | null>(null)
  const [activeClientTab, setActiveClientTab] = useState<ClientVisibleTab>('features')
  const [conditionDraft, setConditionDraft] = useState<ConditionDraftState>(emptyConditionDraft)
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null)
  const [photoDeleteError, setPhotoDeleteError] = useState<string | null>(null)

  const vehicleId = useMemo(() => {
    if (!id) {
      return null
    }

    const parsed = Number(id)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }, [id])

  const vehicleQuery = useQuery({
    queryKey: ['manager-vehicle-edit', vehicleId],
    queryFn: async () => {
      if (vehicleId === null) {
        throw new Error('INVALID_ID')
      }
      return getManagementVehicleById(vehicleId)
    },
    enabled: vehicleId !== null,
  })

  const brandsQuery = useQuery({ queryKey: ['manager-vehicle-brands'], queryFn: getBrands })
  const categoriesQuery = useQuery({ queryKey: ['manager-vehicle-categories'], queryFn: getVehicleCategoryOptions })
  const parkingSpacesQuery = useQuery({ queryKey: ['manager-vehicle-parking-spaces'], queryFn: getParkingSpaceOptions })
  const equipmentCatalogQuery = useQuery({ queryKey: ['manager-vehicle-equipment-catalog'], queryFn: getVehicleEquipmentCatalog })

  const photosQuery = useQuery({
    queryKey: ['manager-vehicle-photos', vehicleId],
    queryFn: async () => {
      if (vehicleId === null) {
        throw new Error('INVALID_ID')
      }
      return getVehicleById(vehicleId)
    },
    enabled: vehicleId !== null,
  })

  useEffect(() => {
    if (vehicleQuery.data) {
      setFormState(toFormState(vehicleQuery.data))
    }
  }, [vehicleQuery.data])

  useEffect(() => {
    if (!formState) {
      return
    }

    const selectedCategory = (categoriesQuery.data ?? []).find((category) => String(category.id) === formState.category)
    setConditionDraft(buildConditionDraft(selectedCategory?.minimum_deposit, photosQuery.data?.conditions))
  }, [categoriesQuery.data, formState?.category, photosQuery.data?.conditions])

  const updateMutation = useMutation({
    mutationFn: ({ targetId, payload }: { targetId: number; payload: VehicleManagementUpdateRequest }) =>
      updateVehicle(targetId, payload),
  })

  const uploadPhotoMutation = useMutation({
    mutationFn: async ({ targetId, file, isPrimary }: { targetId: number; file: File; isPrimary: boolean }) =>
      uploadVehiclePhoto(targetId, { file, is_primary: isPrimary }),
    onSuccess: async () => {
      setPhotoUploadError(null)
      setPhotoUploadFile(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-photos', vehicleId] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
      ])
    },
  })

  const deletePhotoMutation = useMutation({
    mutationFn: async ({ targetId, photoId }: { targetId: number; photoId: number }) =>
      deleteVehiclePhoto(targetId, photoId),
    onSuccess: async () => {
      setPhotoDeleteError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-photos', vehicleId] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
      ])
    },
  })

  const handlePhotoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null
    setPhotoUploadFile(nextFile)
    setPhotoUploadError(null)

    if (!nextFile) {
      return
    }

    if (vehicleId === null) {
      setPhotoUploadError('Identifiant de vehicule invalide.')
      return
    }

    void uploadPhotoMutation.mutateAsync({ targetId: vehicleId, file: nextFile, isPrimary: true })
      .catch((error) => {
        setPhotoUploadError(getPhotoUploadErrorMessage(error))
      })
  }

  const handlePhotoUpload = async () => {
    if (vehicleId === null) {
      setPhotoUploadError('Identifiant de vehicule invalide.')
      return
    }

    if (!photoUploadFile) {
      setPhotoUploadError('Le fichier image est obligatoire.')
      return
    }

    setPhotoUploadError(null)

    try {
      await uploadPhotoMutation.mutateAsync({ targetId: vehicleId, file: photoUploadFile, isPrimary: true })
    } catch (error) {
      setPhotoUploadError(getPhotoUploadErrorMessage(error))
    }
  }

  const handlePhotoDelete = async (photoId: number) => {
    if (vehicleId === null) {
      setPhotoDeleteError('Identifiant de vehicule invalide.')
      return
    }

    const confirmed = window.confirm('Confirmer la suppression de cette photo ?')
    if (!confirmed) {
      return
    }

    setPhotoDeleteError(null)

    try {
      await deletePhotoMutation.mutateAsync({ targetId: vehicleId, photoId })
    } catch (error) {
      setPhotoDeleteError(getPhotoDeleteErrorMessage(error))
    }
  }

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSuccessMessage(null)
    setFormState((current) => (current ? { ...current, [key]: value } : current))
  }

  const updateConditionDraft = <K extends keyof ConditionDraftState>(key: K, value: ConditionDraftState[K]) => {
    setSuccessMessage(null)
    setConditionDraft((current) => ({ ...current, [key]: value }))
  }

  const toggleEquipment = (equipmentId: number) => {
    setFormState((current) => {
      if (!current) {
        return current
      }
      const isSelected = current.equipment.includes(equipmentId)
      return {
        ...current,
        equipment: isSelected
          ? current.equipment.filter((value) => value !== equipmentId)
          : [...current.equipment, equipmentId],
      }
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (vehicleId === null || !formState) {
      setApiError('Identifiant de vehicule invalide.')
      return
    }

    setApiError(null)
    setSuccessMessage(null)
    setFieldErrors({})

    try {
      await updateMutation.mutateAsync({
        targetId: vehicleId,
        payload: toPatchPayload(formState),
      })

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-edit', vehicleId] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-photos', vehicleId] }),
      ])
      setSuccessMessage('Les modifications ont été enregistrées.')
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        setApiError('Une erreur inattendue est survenue.')
        return
      }

      if (!error.response) {
        setApiError('Impossible de contacter le serveur. Réessayez dans un instant.')
        return
      }

      const statusCode = error.response.status
      const backendPayload = error.response.data as BackendValidationErrorPayload | undefined

      if (statusCode === 400) {
        const mappedFieldErrors = mapBackendFieldErrors(backendPayload)
        if (Object.keys(mappedFieldErrors).length > 0) {
          setFieldErrors(mappedFieldErrors)
        }
        setApiError(toGeneralSubmitError(backendPayload))
        return
      }

      if (statusCode === 403) {
        setApiError('Vous n\'avez pas les permissions pour modifier ce véhicule.')
        return
      }

      if (statusCode === 404) {
        setApiError('Le véhicule est introuvable ou a été supprimé.')
        return
      }

      setApiError(toGeneralSubmitError(backendPayload))
    }
  }

  if (vehicleId === null) {
    return (
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Identifiant invalide" message="L'identifiant du vehicule est invalide." />
        <Link to={`${basePath}/vehicles`}>
          <Button type="button" variant="secondary">Retour</Button>
        </Link>
      </section>
    )
  }

  if (vehicleQuery.isLoading || !formState) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <LoadingSpinner size="lg" aria-label="Chargement du vehicule" />
      </section>
    )
  }

  if (vehicleQuery.isError) {
    const { title, message, is404 } = getApiErrorMessage(vehicleQuery.error)

    return (
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant={is404 ? 'warning' : 'danger'} title={title} message={message} />
        <Link to={`${basePath}/vehicles`}>
          <Button type="button" variant="secondary">Retour</Button>
        </Link>
      </section>
    )
  }

  const brandOptions = (brandsQuery.data ?? []).map((brand) => ({ value: String(brand.id), label: brand.name }))
  const categoryOptions = (categoriesQuery.data ?? []).map((category) => ({ value: String(category.id), label: category.name }))
  const parkingSpaceOptions = (parkingSpacesQuery.data ?? []).map((space) => ({
    value: String(space.id),
    label: `${space.parking_name} - ${space.number}`,
  }))
  const equipmentCatalog = equipmentCatalogQuery.data ?? []
  const selectedCategory = (categoriesQuery.data ?? []).find((category) => String(category.id) === formState.category)

  const photoVehicle = photosQuery.data ?? null
  const gallery = photoVehicle?.photos ?? []
  const mainPhoto = photoVehicle ? getMainPhoto(photoVehicle) : null
  const mainPhotoUrl = resolveMediaUrl(mainPhoto?.file)
  const conditions = photoVehicle?.conditions
  const clientCategoryLabel = photoVehicle?.category ?? selectedCategory?.name ?? 'Non renseigné'
  const clientVehicleName = photoVehicle ? `${photoVehicle.brand} ${photoVehicle.model_name}` : formState.model_name
  const clientRecommendedUse = photoVehicle?.recommended_use?.trim() || 'Non renseigné'

  const isSaving = updateMutation.isPending

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold text-[#0F172A]">Modifier un véhicule</h1>
        <Link to={`${basePath}/vehicles`}>
          <Button type="button" variant="secondary">Retour</Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {apiError ? <Alert variant="danger" title="Enregistrement impossible" message={apiError} /> : null}
        {successMessage ? <Alert variant="success" title="Modifications enregistrées" message={successMessage} /> : null}

        <div className="space-y-5 rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-[#0F172A]">Informations internes</h2>

          <div className="grid gap-5 md:grid-cols-2">
            <Input
              label="Immatriculation"
              maxLength={30}
              value={formState.registration_number}
              onChange={(event) => updateField('registration_number', event.target.value)}
              error={fieldErrors.registration_number}
            />
            <Select
              label="Parking / place"
              options={parkingSpaceOptions}
              value={formState.parking_space}
              onChange={(event) => updateField('parking_space', event.target.value)}
              error={fieldErrors.parking_space}
              disabled={parkingSpacesQuery.isLoading}
            />
            <Select
              label="Statut interne"
              options={statusOptions}
              value={formState.status}
              onChange={(event) => updateField('status', event.target.value as VehicleManagementStatus)}
              error={fieldErrors.status}
            />
            <Input
              type="text"
              inputMode="numeric"
              label="Kilométrage réel"
              value={formState.mileage}
              onChange={(event) => updateField('mileage', event.target.value)}
              error={fieldErrors.mileage}
            />
            <Select
              label="Actif / inactif"
              options={[{ value: 'true', label: 'Actif' }, { value: 'false', label: 'Inactif' }]}
              value={formState.is_active ? 'true' : 'false'}
              onChange={(event) => updateField('is_active', event.target.value === 'true')}
              error={fieldErrors.is_active}
            />
            <Select
              label="Marque"
              options={brandOptions}
              value={formState.brand}
              onChange={(event) => updateField('brand', event.target.value)}
              error={fieldErrors.brand}
              disabled={brandsQuery.isLoading}
            />
            <Select
              label="Catégorie"
              options={categoryOptions}
              value={formState.category}
              onChange={(event) => updateField('category', event.target.value)}
              error={fieldErrors.category}
              disabled={categoriesQuery.isLoading}
            />
            <Input
              label="Modèle"
              maxLength={150}
              value={formState.model_name}
              onChange={(event) => updateField('model_name', event.target.value)}
              error={fieldErrors.model_name}
            />
            <Input
              type="text"
              inputMode="numeric"
              label="Année"
              value={formState.year}
              onChange={(event) => updateField('year', event.target.value)}
              error={fieldErrors.year}
            />
          </div>
        </div>

        <div className="space-y-5 rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 sm:p-6">
          <h2 className="text-xl font-semibold text-[#0F172A]">Fiche visible par le client</h2>

          <Card>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.55fr_0.95fr]">
              <div>
                {photosQuery.isLoading ? (
                  <div className="flex min-h-[20rem] items-center justify-center rounded-[1.25rem] bg-slate-100">
                    <LoadingSpinner size="md" aria-label="Chargement des photos du vehicule" />
                  </div>
                ) : mainPhotoUrl && photoVehicle ? (
                  <img
                    src={mainPhotoUrl}
                    alt={`${photoVehicle.brand} ${photoVehicle.model_name}`}
                    className="h-72 w-full rounded-[1.25rem] object-cover sm:h-[26rem]"
                  />
                ) : (
                  <div className="flex h-72 w-full items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-slate-100 to-slate-200 sm:h-[26rem]">
                    <p className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-600">
                      Aucune photo principale disponible
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-medium text-[#2563EB]">{clientCategoryLabel}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Nom du véhicule</p>
                  <p className="mt-1 text-2xl font-semibold text-[#1F2937]">{clientVehicleName}</p>
                </div>

                <Input
                  label="Usage conseillé"
                  value={formState.recommended_use}
                  onChange={(event) => updateField('recommended_use', event.target.value)}
                  error={fieldErrors.recommended_use}
                  placeholder="Ex: Famille, confortable et polyvalente"
                />

                <Input
                  label="Tarif journalier"
                  value={formState.category_daily_rate}
                  onChange={(event) => updateField('category_daily_rate', event.target.value)}
                  error={fieldErrors.category_daily_rate}
                  helperText="TVA 21 % comprise"
                  className="bg-[#EFF6FF] font-semibold"
                />

                {vehicleId !== null ? (
                  <Link to={`/vehicles/${vehicleId}`} target="_blank" rel="noreferrer">
                    <Button type="button" variant="secondary" className="w-full">Voir la fiche client</Button>
                  </Link>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2">
            {photoDeleteError ? <Alert variant="danger" title="Suppression impossible" message={photoDeleteError} /> : null}
            {photoUploadError ? <Alert variant="danger" title="Upload impossible" message={photoUploadError} /> : null}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <h3 className="shrink-0 text-sm font-semibold text-[#1F2937] lg:w-44">Photos visibles par le client</h3>

              <div className="flex shrink-0 items-center gap-2">
                {photosQuery.isLoading ? (
                  <LoadingSpinner size="sm" aria-label="Chargement des photos du vehicule" />
                ) : mainPhotoUrl && mainPhoto && photoVehicle ? (
                  <div className="relative">
                    <img
                      src={mainPhotoUrl}
                      alt={`Photo principale du vehicule ${photoVehicle.brand} ${photoVehicle.model_name}`}
                      className="h-14 w-20 rounded-lg border border-[#E5E7EB] object-cover"
                      loading="lazy"
                    />
                    <span className="absolute left-1 top-1 rounded-full bg-[#2563EB] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      Principale
                    </span>
                  </div>
                ) : (
                  <div className="flex h-14 w-20 items-center justify-center rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] text-[11px] text-slate-500">
                    Aucune
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1" />

              <div className="flex shrink-0 gap-2">
                <label
                  htmlFor="vehicle-photo-file"
                  className="inline-flex h-8 w-24 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#2563EB] px-3 text-xs font-medium text-white transition hover:bg-[#1D4ED8]"
                >
                  {uploadPhotoMutation.isPending ? 'Upload...' : 'Modifier'}
                </label>
                <input
                  id="vehicle-photo-file"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  disabled={uploadPhotoMutation.isPending}
                  onChange={handlePhotoFileChange}
                  className="sr-only"
                />
                <button
                  type="button"
                  disabled={!mainPhoto || deletePhotoMutation.isPending}
                  onClick={() => {
                    if (mainPhoto) {
                      void handlePhotoDelete(mainPhoto.id)
                    }
                  }}
                  className="h-8 w-24 shrink-0 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                >
                  {deletePhotoMutation.isPending ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 p-3">
              {[
                { id: 'features' as const, label: 'Caractéristiques' },
                { id: 'equipment' as const, label: 'Équipements' },
                { id: 'conditions' as const, label: 'Conditions' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveClientTab(tab.id)}
                  className={[
                    'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                    activeClientTab === tab.id
                      ? 'bg-[#2563EB] text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-5 sm:p-6">
              {activeClientTab === 'features' ? (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <Input
                    type="text"
                    inputMode="numeric"
                    label="Nombre de places"
                    value={formState.seats}
                    onChange={(event) => updateField('seats', event.target.value)}
                    error={fieldErrors.seats}
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    label="Nombre de portes"
                    value={formState.doors}
                    onChange={(event) => updateField('doors', event.target.value)}
                    error={fieldErrors.doors}
                  />
                  <Input
                    label="Motorisation"
                    value={formState.fuel_type}
                    onChange={(event) => updateField('fuel_type', event.target.value)}
                    error={fieldErrors.fuel_type}
                  />
                  <Input
                    label="Boîte de vitesses"
                    maxLength={60}
                    value={formState.transmission}
                    onChange={(event) => updateField('transmission', event.target.value)}
                    error={fieldErrors.transmission}
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    label="Puissance (ch)"
                    placeholder="Ex: 130"
                    value={formState.power_hp}
                    onChange={(event) => updateField('power_hp', event.target.value)}
                    error={fieldErrors.power_hp}
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    label="Consommation (L/100km)"
                    placeholder="Ex: 5.5"
                    value={formState.consumption}
                    onChange={(event) => updateField('consumption', event.target.value)}
                    error={fieldErrors.consumption}
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    label="Coffre / volume (L)"
                    placeholder="Ex: 400"
                    value={formState.trunk_volume}
                    onChange={(event) => updateField('trunk_volume', event.target.value)}
                    error={fieldErrors.trunk_volume}
                  />
                  <Input
                    label="Norme Euro"
                    placeholder="Ex: Euro 6"
                    value={formState.euro_standard}
                    onChange={(event) => updateField('euro_standard', event.target.value)}
                    error={fieldErrors.euro_standard}
                  />
                  <Input
                    label="Couleur"
                    maxLength={60}
                    value={formState.color}
                    onChange={(event) => updateField('color', event.target.value)}
                    error={fieldErrors.color}
                  />
                </div>
              ) : null}

              {activeClientTab === 'equipment' ? (
                <div>
                  {equipmentCatalogQuery.isLoading ? (
                    <LoadingSpinner size="sm" aria-label="Chargement des equipements" />
                  ) : equipmentCatalog.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun équipement disponible dans le catalogue.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {equipmentCatalog.map((item) => (
                        <label
                          key={item.id}
                          className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#1F2937] transition hover:border-[#2563EB]"
                        >
                          <input
                            type="checkbox"
                            checked={formState.equipment.includes(item.id)}
                            onChange={() => toggleEquipment(item.id)}
                            className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-2 focus:ring-blue-100"
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  )}
                  {fieldErrors.equipment ? <p className="mt-3 text-sm text-[#EF4444]">{fieldErrors.equipment}</p> : null}
                </div>
              ) : null}

              {activeClientTab === 'conditions' ? (
                <div className="space-y-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      label="Kilométrage inclus / jour"
                      placeholder="Ex: 200"
                      value={formState.included_km_per_day}
                      onChange={(event) => updateField('included_km_per_day', event.target.value)}
                      error={fieldErrors.included_km_per_day}
                    />
                    <Input
                      type="text"
                      inputMode="decimal"
                      label="Prix du kilomètre supplémentaire"
                      placeholder="Ex: 0.25"
                      value={formState.extra_km_price}
                      onChange={(event) => updateField('extra_km_price', event.target.value)}
                      error={fieldErrors.extra_km_price}
                    />
                    <Input
                      type="text"
                      inputMode="numeric"
                      label="Âge minimum"
                      placeholder="Ex: 21"
                      value={formState.minimum_age}
                      onChange={(event) => updateField('minimum_age', event.target.value)}
                      error={fieldErrors.minimum_age}
                    />
                    <Input
                      label="Permis requis"
                      placeholder="Ex: Permis B"
                      value={formState.required_license}
                      onChange={(event) => updateField('required_license', event.target.value)}
                      error={fieldErrors.required_license}
                    />
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <Input
                      label="Caution"
                      value={conditionDraft.caution}
                      onChange={(event) => updateConditionDraft('caution', event.target.value)}
                    />
                    <Input
                      label="Documents requis"
                      value={conditionDraft.documents}
                      onChange={(event) => updateConditionDraft('documents', event.target.value)}
                    />
                    <Input
                      label="Carburant"
                      value={conditionDraft.fuel}
                      onChange={(event) => updateConditionDraft('fuel', event.target.value)}
                    />
                    <Input
                      label="Retard"
                      value={conditionDraft.late}
                      onChange={(event) => updateConditionDraft('late', event.target.value)}
                    />
                    <Input
                      label="Annulation"
                      value={conditionDraft.cancellation}
                      onChange={(event) => updateConditionDraft('cancellation', event.target.value)}
                    />
                    <Input
                      label="État des lieux"
                      value={conditionDraft.inspection}
                      onChange={(event) => updateConditionDraft('inspection', event.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
            {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </Button>
        </div>
      </form>
    </section>
  )
}
