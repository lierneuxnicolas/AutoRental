import { useEffect, type ChangeEvent } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import Alert from '../feedback/Alert'
import Button from '../ui/Button'
import Card from '../ui/Card'
import Input from '../ui/Input'
import Select from '../ui/Select'
import type { VehicleManagementCreateRequest, VehicleManagementStatus } from '../../types/managementVehicle'

const statusOptions: Array<{ value: VehicleManagementStatus; label: string }> = [
  { value: 'DISPONIBLE', label: 'Disponible' },
  { value: 'RESERVE', label: 'Reserve' },
  { value: 'LOUE', label: 'Loue' },
  { value: 'A_CONTROLER', label: 'A controler' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'NETTOYAGE', label: 'Nettoyage' },
  { value: 'ACCIDENTE', label: 'Accidente' },
  { value: 'INDISPONIBLE', label: 'Indisponible' },
]

const isActiveOptions = [
  { value: 'true', label: 'Oui' },
  { value: 'false', label: 'Non' },
] as const

const positiveIntegerString = (requiredMessage: string, invalidMessage: string) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .refine((value) => {
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed > 0
    }, invalidMessage)

const positiveOrZeroIntegerString = (message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => value ?? '')
    .refine((value) => value === '' || Number.isInteger(Number(value)) && Number(value) >= 0, message)

const formSchema = z.object({
  brand: positiveIntegerString('La marque est obligatoire.', 'La marque doit etre un entier positif.'),
  category: positiveIntegerString('La categorie est obligatoire.', 'La categorie doit etre un entier positif.'),
  parking_space: positiveIntegerString('La place de parking est obligatoire.', 'La place de parking doit etre un entier positif.'),
  registration_number: z.string().trim().min(1, 'L\'immatriculation est obligatoire.').max(30, 'Maximum 30 caracteres.'),
  model_name: z.string().trim().min(1, 'Le modele est obligatoire.').max(150, 'Maximum 150 caracteres.'),
  year: z
    .string()
    .trim()
    .min(1, 'L\'annee est obligatoire.')
    .refine((value) => {
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed >= 1886 && parsed <= 4294967295
    }, 'L\'annee doit etre comprise entre 1886 et 4294967295.'),
  color: z.string().trim().min(1, 'La couleur est obligatoire.').max(60, 'Maximum 60 caracteres.'),
  fuel_type: z.string().trim().min(1, 'Le type de carburant est obligatoire.'),
  transmission: z.string().trim().min(1, 'La transmission est obligatoire.').max(60, 'Maximum 60 caracteres.'),
  seats: positiveIntegerString('Le nombre de places est obligatoire.', 'Le nombre de places doit etre un entier positif.'),
  doors: positiveIntegerString('Le nombre de portes est obligatoire.', 'Le nombre de portes doit etre un entier positif.'),
  mileage: positiveOrZeroIntegerString('Le kilometrage doit etre positif ou nul.'),
  description: z.string().trim().optional(),
  status: z.enum([
    'DISPONIBLE',
    'RESERVE',
    'LOUE',
    'A_CONTROLER',
    'MAINTENANCE',
    'NETTOYAGE',
    'ACCIDENTE',
    'INDISPONIBLE',
  ]),
  is_active: z.union([z.literal(''), z.literal('true'), z.literal('false')]).optional(),
})

type VehicleManagementFormValues = z.input<typeof formSchema>

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

export interface VehicleManagementFormProps {
  initialValues?: Partial<VehicleManagementCreateRequest>
  onSubmit: (payload: VehicleManagementCreateRequest) => Promise<void> | void
  isSubmitting?: boolean
  submitLabel: string
  apiError?: string | null
  submitError?: string | null
  fieldErrors?: VehicleFormFieldErrors
  categoryOptions?: Array<{ value: string; label: string }>
  parkingSpaceOptions?: Array<{ value: string; label: string }>
  cancelHref?: string
  enablePhotoUpload?: boolean
  selectedPhotos?: File[]
  onPhotosChange?: (files: File[]) => void
}

function toStringOrEmpty(value: number | undefined): string {
  if (typeof value !== 'number') {
    return ''
  }

  return String(value)
}

export default function VehicleManagementForm({
  initialValues,
  onSubmit,
  isSubmitting = false,
  submitLabel,
  apiError,
  submitError,
  fieldErrors,
  enablePhotoUpload = false,
  selectedPhotos,
  onPhotosChange,
}: VehicleManagementFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting: isFormSubmitting },
  } = useForm<VehicleManagementFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      brand: toStringOrEmpty(initialValues?.brand),
      category: toStringOrEmpty(initialValues?.category),
      parking_space: toStringOrEmpty(initialValues?.parking_space),
      registration_number: initialValues?.registration_number ?? '',
      model_name: initialValues?.model_name ?? '',
      year: toStringOrEmpty(initialValues?.year),
      color: initialValues?.color ?? '',
      fuel_type: initialValues?.fuel_type ?? '',
      transmission: initialValues?.transmission ?? '',
      seats: toStringOrEmpty(initialValues?.seats),
      doors: toStringOrEmpty(initialValues?.doors),
      mileage: typeof initialValues?.mileage === 'number' ? String(initialValues.mileage) : '',
      description: initialValues?.description ?? '',
      status: initialValues?.status ?? 'DISPONIBLE',
      is_active:
        typeof initialValues?.is_active === 'boolean'
          ? (initialValues.is_active ? 'true' : 'false')
          : '',
    },
  })

  useEffect(() => {
    if (!fieldErrors) {
      return
    }

    ;(Object.entries(fieldErrors) as Array<[VehicleFieldName, string | undefined]>).forEach(([name, message]) => {
      if (typeof message === 'string' && message.trim().length > 0) {
        setError(name, { type: 'server', message })
      }
    })
  }, [fieldErrors, setError])

  const disabled = isSubmitting || isFormSubmitting
  const displayedApiError = apiError ?? submitError ?? null

  const handlePhotoInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!onPhotosChange) {
      return
    }

    const files = event.target.files ? Array.from(event.target.files) : []
    onPhotosChange(files)
  }

  const onValidSubmit = async (values: VehicleManagementFormValues) => {
    const payload: VehicleManagementCreateRequest = {
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
    }

    if (values.mileage && values.mileage.trim() !== '') {
      payload.mileage = Number(values.mileage)
    }

    const normalizedDescription = values.description?.trim()
    if (normalizedDescription) {
      payload.description = normalizedDescription
    }

    if (values.is_active === 'true') {
      payload.is_active = true
    }

    if (values.is_active === 'false') {
      payload.is_active = false
    }

    await onSubmit(payload)
  }

  return (
    <Card>
      <div className="space-y-6">
        {displayedApiError ? <Alert variant="danger" title="Enregistrement impossible" message={displayedApiError} /> : null}

        <form onSubmit={handleSubmit(onValidSubmit)} noValidate className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <Input
              type="text"
              label="ID marque"
              placeholder="Ex: 1"
              inputMode="numeric"
              error={errors.brand?.message}
              {...register('brand')}
            />

            <Input type="text" label="ID categorie" placeholder="Ex: 2" inputMode="numeric" error={errors.category?.message} {...register('category')} />

            <Input
              type="text"
              label="ID place de parking"
              placeholder="Ex: 3"
              inputMode="numeric"
              error={errors.parking_space?.message}
              {...register('parking_space')}
            />

            <Input
              label="Immatriculation"
              placeholder="AA-123-AA"
              maxLength={30}
              error={errors.registration_number?.message}
              {...register('registration_number')}
            />

            <Input
              label="Modele"
              placeholder="Clio"
              maxLength={150}
              error={errors.model_name?.message}
              {...register('model_name')}
            />

            <Input
              type="text"
              label="Annee"
              placeholder="2024"
              inputMode="numeric"
              error={errors.year?.message}
              {...register('year')}
            />

            <Input
              label="Couleur"
              placeholder="Noir"
              maxLength={60}
              error={errors.color?.message}
              {...register('color')}
            />

            <Input
              label="Carburant"
              placeholder="Essence"
              error={errors.fuel_type?.message}
              {...register('fuel_type')}
            />

            <Input
              label="Transmission"
              placeholder="Automatique"
              maxLength={60}
              error={errors.transmission?.message}
              {...register('transmission')}
            />

            <Input
              type="text"
              label="Nombre de places"
              placeholder="5"
              inputMode="numeric"
              error={errors.seats?.message}
              {...register('seats')}
            />

            <Input
              type="text"
              label="Nombre de portes"
              placeholder="5"
              inputMode="numeric"
              error={errors.doors?.message}
              {...register('doors')}
            />

            <Input
              type="text"
              label="Kilometrage (optionnel)"
              placeholder="25000"
              inputMode="numeric"
              error={errors.mileage?.message}
              {...register('mileage')}
            />

            <Select
              label="Statut"
              options={statusOptions}
              error={errors.status?.message}
              {...register('status')}
            />

            <Select
              label="Actif (optionnel)"
              placeholder="Conserver la valeur par defaut"
              options={[...isActiveOptions]}
              error={errors.is_active?.message}
              {...register('is_active')}
            />
          </div>

          <Input
            label="Description (optionnel)"
            placeholder="Description du vehicule"
            error={errors.description?.message}
            {...register('description')}
          />

          {enablePhotoUpload ? (
            <div className="space-y-2">
              <label htmlFor="vehicle-photos" className="block text-sm font-medium text-[#1F2937]">
                Photos du vehicule (optionnel)
              </label>
              <input
                id="vehicle-photos"
                type="file"
                accept="image/*"
                multiple
                disabled={disabled}
                onChange={handlePhotoInputChange}
                className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition file:mr-3 file:rounded-xl file:border-0 file:bg-[#F5F5F5] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#1F2937] hover:file:bg-[#E5E7EB] focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
              />
              <p className="text-sm text-slate-500">
                {selectedPhotos && selectedPhotos.length > 0
                  ? `${selectedPhotos.length} photo(s) selectionnee(s).`
                  : 'Formats images acceptes. La premiere photo sera definie comme principale.'}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={disabled} className="w-full sm:w-auto">
              {disabled ? 'Enregistrement...' : submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}