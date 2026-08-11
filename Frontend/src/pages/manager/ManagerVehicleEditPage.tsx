import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import VehicleManagementForm from '../../components/vehicles/VehicleManagementForm'
import { getManagementVehicleById, updateVehicle, uploadVehiclePhoto } from '../../services/managementVehicleService'
import type {
  ManagementVehicleDetailResponse,
  VehicleManagementCreateRequest,
  VehicleManagementUpdateRequest,
} from '../../types/managementVehicle'

interface ManagerVehicleEditPageProps {
  basePath?: string
}

interface BackendValidationErrorPayload {
  detail?: string
  non_field_errors?: string[]
  brand?: string[]
  category?: string[]
  parking_space?: string[]
  registration_number?: string[]
  model_name?: string[]
  year?: string[]
  color?: string[]
  fuel_type?: string[]
  transmission?: string[]
  seats?: string[]
  doors?: string[]
  mileage?: string[]
  description?: string[]
  is_active?: string[]
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
  | 'description'
  | 'is_active'

type VehicleFormFieldErrors = Partial<Record<VehicleFieldName, string>>

function mapVehicleToInitialValues(vehicle: ManagementVehicleDetailResponse): Partial<VehicleManagementCreateRequest> {
  return {
    brand: vehicle.brand,
    category: vehicle.category,
    parking_space: vehicle.parking_space,
    registration_number: vehicle.registration_number,
    model_name: vehicle.model_name,
    year: vehicle.year,
    color: vehicle.color,
    fuel_type: vehicle.fuel_type,
    transmission: vehicle.transmission,
    seats: vehicle.seats,
    doors: vehicle.doors,
    mileage: vehicle.mileage,
    description: vehicle.description,
    status: vehicle.status,
    is_active: vehicle.is_active,
  }
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
  if (!payload) {
    return 'Une erreur est survenue. Veuillez reessayer.'
  }

  if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length > 0) {
    return payload.non_field_errors.join(' ')
  }

  return 'Une erreur est survenue. Veuillez reessayer.'
}

function mapBackendFieldErrors(payload: BackendValidationErrorPayload | undefined): VehicleFormFieldErrors {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const acceptedFields = new Set<VehicleFieldName>([
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
    'description',
    'is_active',
  ])

  const fieldErrors: VehicleFormFieldErrors = {}

  Object.entries(payload).forEach(([key, value]) => {
    if (!acceptedFields.has(key as VehicleFieldName)) {
      return
    }

    if (Array.isArray(value) && value.length > 0) {
      fieldErrors[key as VehicleFieldName] = String(value[0])
      return
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      fieldErrors[key as VehicleFieldName] = value
    }
  })

  return fieldErrors
}

function toPatchPayload(values: VehicleManagementCreateRequest): VehicleManagementUpdateRequest {
  return {
    brand: values.brand,
    category: values.category,
    parking_space: values.parking_space,
    registration_number: values.registration_number,
    model_name: values.model_name,
    year: values.year,
    color: values.color,
    fuel_type: values.fuel_type,
    transmission: values.transmission,
    seats: values.seats,
    doors: values.doors,
    mileage: values.mileage,
    description: values.description,
    is_active: values.is_active,
  }
}

export default function ManagerVehicleEditPage({ basePath = '/manager' }: ManagerVehicleEditPageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id } = useParams<{ id: string }>()
  const [apiError, setApiError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<VehicleFormFieldErrors>({})
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])

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

  const updateMutation = useMutation({
    mutationFn: ({ targetId, payload }: { targetId: number; payload: VehicleManagementUpdateRequest }) =>
      updateVehicle(targetId, payload),
  })

  const handleSubmit = async (formValues: VehicleManagementCreateRequest) => {
    if (vehicleId === null) {
      setApiError('Identifiant de vehicule invalide.')
      return
    }

    setApiError(null)
    setFieldErrors({})

    try {
      const updatedVehicle = await updateMutation.mutateAsync({
        targetId: vehicleId,
        payload: toPatchPayload(formValues),
      })

      if (selectedPhotos.length > 0) {
        const uploadResults = await Promise.allSettled(
          selectedPhotos.map((photo, index) =>
            uploadVehiclePhoto(updatedVehicle.id, {
              file: photo,
              is_primary: index === 0,
              position: index,
            }),
          ),
        )

        const uploadedPhotos = uploadResults.filter((result) => result.status === 'fulfilled').length
        const successMessage =
          uploadedPhotos === selectedPhotos.length
            ? 'Le vehicule et ses nouvelles photos ont ete enregistres avec succes.'
            : `Le vehicule a ete mis a jour. Photos importees: ${uploadedPhotos}/${selectedPhotos.length}.`

        setSelectedPhotos([])
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
          queryClient.invalidateQueries({ queryKey: ['manager-vehicle-edit', vehicleId] }),
        ])

        navigate(`${basePath}/vehicles`, {
          state: { successMessage },
        })

        return
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-edit', vehicleId] }),
      ])

      navigate(`${basePath}/vehicles`, {
        state: { successMessage: 'Le vehicule a ete modifie avec succes.' },
      })
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        setApiError('Une erreur inattendue est survenue.')
        return
      }

      if (!error.response) {
        setApiError('Erreur reseau: impossible de contacter le serveur.')
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
        setApiError('Vous n\'avez pas les permissions pour modifier ce vehicule.')
        return
      }

      if (statusCode === 404) {
        setApiError('Le vehicule est introuvable ou a ete supprime.')
        return
      }

      setApiError(toGeneralSubmitError(backendPayload))
    }
  }

  if (vehicleId === null) {
    return (
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Identifiant invalide" message="L\'identifiant du vehicule est invalide." />
        <Link to={`${basePath}/vehicles`}>
          <Button type="button" variant="secondary">Retour a la liste</Button>
        </Link>
      </section>
    )
  }

  if (vehicleQuery.isLoading) {
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
          <Button type="button" variant="secondary">Retour a la liste</Button>
        </Link>
      </section>
    )
  }

  if (!vehicleQuery.data) {
    return (
      <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Alert variant="danger" title="Erreur API" message="Aucune donnee vehicule disponible." />
        <Link to={`${basePath}/vehicles`}>
          <Button type="button" variant="secondary">Retour a la liste</Button>
        </Link>
      </section>
    )
  }

  const initialValues = mapVehicleToInitialValues(vehicleQuery.data)

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Gestion vehicules</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Modifier un vehicule</h1>
          <p className="mt-2 text-sm text-slate-600">Modifiez les informations du vehicule puis enregistrez.</p>
        </div>

        <Link to={`${basePath}/vehicles`}>
          <Button type="button" variant="secondary">Annuler</Button>
        </Link>
      </div>

      <VehicleManagementForm
        initialValues={initialValues}
        onSubmit={handleSubmit}
        isSubmitting={updateMutation.isPending}
        submitLabel="Enregistrer les modifications"
        apiError={apiError}
        fieldErrors={fieldErrors}
        enablePhotoUpload
        selectedPhotos={selectedPhotos}
        onPhotosChange={setSelectedPhotos}
      />
    </section>
  )
}
