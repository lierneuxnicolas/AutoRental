import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import Button from '../../components/ui/Button'
import VehicleManagementForm from '../../components/vehicles/VehicleManagementForm'
import { createVehicle, uploadVehiclePhoto } from '../../services/managementVehicleService'
import type { VehicleManagementCreateRequest, VehicleManagementStatus } from '../../types/managementVehicle'

interface ManagerVehicleCreatePageProps {
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
  status?: string[]
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
  | 'status'
  | 'is_active'

type VehicleFormFieldErrors = Partial<Record<VehicleFieldName, string>>

function toGeneralError(payload: BackendValidationErrorPayload | undefined): string {
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
    'status',
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

export default function ManagerVehicleCreatePage({ basePath = '/manager' }: ManagerVehicleCreatePageProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [apiError, setApiError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<VehicleFormFieldErrors>({})
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([])

  const createMutation = useMutation({
    mutationFn: (payload: VehicleManagementCreateRequest) => createVehicle(payload),
  })

  const handleSubmit = async (payload: VehicleManagementCreateRequest) => {
    setApiError(null)
    setFieldErrors({})

    const normalizedPayload: VehicleManagementCreateRequest = {
      ...payload,
      status: 'DISPONIBLE' as VehicleManagementStatus,
    }

    try {
      const createdVehicle = await createMutation.mutateAsync(normalizedPayload)

      let uploadedPhotos = 0
      if (selectedPhotos.length > 0) {
        const uploadResults = await Promise.allSettled(
          selectedPhotos.map((photo, index) =>
            uploadVehiclePhoto(createdVehicle.id, {
              file: photo,
              is_primary: index === 0,
              position: index,
            }),
          ),
        )

        uploadedPhotos = uploadResults.filter((result) => result.status === 'fulfilled').length
      }

      setApiError(null)
      setFieldErrors({})
      setSelectedPhotos([])
      await queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] })

      const successMessage =
        selectedPhotos.length > 0
          ? uploadedPhotos === selectedPhotos.length
            ? 'Le vehicule et ses photos ont ete ajoutes avec succes.'
            : `Le vehicule a ete ajoute. Photos importees: ${uploadedPhotos}/${selectedPhotos.length}.`
          : 'Le vehicule a ete ajoute avec succes.'

      navigate(`${basePath}/vehicles`, {
        state: { successMessage },
      })
    } catch (error) {
      if (!axios.isAxiosError(error)) {
        setApiError('Une erreur inattendue est survenue.')
        return
      }

      const statusCode = error.response?.status
      const backendPayload = error.response?.data as BackendValidationErrorPayload | undefined

      if (statusCode === 403) {
        setApiError('Vous n\'avez pas les permissions pour ajouter un vehicule.')
        return
      }

      if (statusCode === 400) {
        const mappedFieldErrors = mapBackendFieldErrors(backendPayload)
        if (Object.keys(mappedFieldErrors).length > 0) {
          setFieldErrors(mappedFieldErrors)
        }

        setApiError(toGeneralError(backendPayload))
        return
      }

      setApiError(toGeneralError(backendPayload))
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Gestion vehicules</p>
        <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Ajouter un vehicule</h1>
        <p className="mt-2 text-sm text-slate-600">
          Saisissez les informations du vehicule selon le contrat API de creation.
        </p>
      </div>

      <Alert
        variant="info"
        title="Important"
        message="Le statut est force a DISPONIBLE a la creation dans cette etape."
      />

      <div className="flex justify-end">
        <Link to={`${basePath}/vehicles`}>
          <Button type="button" variant="secondary">Annuler</Button>
        </Link>
      </div>

      <VehicleManagementForm
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        submitLabel="Ajouter le vehicule"
        apiError={apiError}
        fieldErrors={fieldErrors}
        enablePhotoUpload
        selectedPhotos={selectedPhotos}
        onPhotosChange={setSelectedPhotos}
      />
    </section>
  )
}