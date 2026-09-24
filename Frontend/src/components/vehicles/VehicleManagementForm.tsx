import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import Alert from '../feedback/Alert'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import VehicleFormTabs, { type VehicleFormTab } from './VehicleFormTabs'
import VehicleFormSection from './VehicleFormSection'
import type { VehicleManagementCreateRequest } from '../../types/managementVehicle'

const isActiveOptions = [
  { value: 'true', label: 'Actif' },
  { value: 'false', label: 'Inactif' },
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

const optionalNonNegativeNumberString = (message: string) =>
  z.string().trim().optional().transform((value) => value ?? '').refine(
    (value) => value === '' || Number.isFinite(Number(value)) && Number(value) >= 0,
    message,
  )

const formSchema = z.object({
  brand: positiveIntegerString('La marque est obligatoire.', 'La marque doit etre un entier positif.'),
  category: positiveIntegerString('La categorie est obligatoire.', 'La categorie doit etre un entier positif.'),
  parking_space: positiveIntegerString('La place de parking est obligatoire.', 'La place de parking doit être sélectionnée.'),
  registration_number: z.string().trim().min(1, 'L\'immatriculation est obligatoire.').max(30, 'Maximum 30 caracteres.'),
  model_name: z.string().trim().min(1, 'Le modele est obligatoire.').max(150, 'Maximum 150 caracteres.'),
  year: z
    .string()
    .trim()
    .min(1, 'L\'annee est obligatoire.')
    .refine((value) => {
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed >= 1886 && parsed <= new Date().getFullYear() + 1
    }, `L'année doit être comprise entre 1886 et ${new Date().getFullYear() + 1}.`),
  color: z.string().trim().min(1, 'La couleur est obligatoire.').max(60, 'Maximum 60 caracteres.'),
  fuel_type: z.string().trim().min(1, 'Le type de carburant est obligatoire.'),
  transmission: z.string().trim().min(1, 'La transmission est obligatoire.').max(60, 'Maximum 60 caracteres.'),
  seats: positiveIntegerString('Le nombre de places est obligatoire.', 'Le nombre de places doit etre un entier positif.'),
  doors: positiveIntegerString('Le nombre de portes est obligatoire.', 'Le nombre de portes doit etre un entier positif.'),
  mileage: positiveOrZeroIntegerString('Le kilometrage doit etre positif ou nul.'),
  description: z.string().trim().optional(),
  recommended_use: z.string().trim().optional(),
  power_hp: positiveOrZeroIntegerString('La puissance doit être positive ou nulle.'),
  consumption: optionalNonNegativeNumberString('La consommation doit être positive ou nulle.'),
  trunk_volume: positiveOrZeroIntegerString('Le volume du coffre doit être positif ou nul.'),
  euro_standard: z.string().trim().optional(),
  included_km_per_day: positiveOrZeroIntegerString('Le kilométrage inclus doit être positif ou nul.'),
  extra_km_price: optionalNonNegativeNumberString('Le prix supplémentaire doit être positif ou nul.'),
  minimum_age: positiveOrZeroIntegerString('L’âge minimum doit être positif ou nul.'),
  required_license: z.string().trim().optional(),
  equipment: z.array(z.number()),
  is_active: z.enum(['true', 'false']),
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
  | 'recommended_use'
  | 'power_hp'
  | 'consumption'
  | 'trunk_volume'
  | 'euro_standard'
  | 'included_km_per_day'
  | 'extra_km_price'
  | 'minimum_age'
  | 'required_license'
  | 'equipment'
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
  brandOptions?: Array<{ value: string; label: string }>
  categoryOptions?: Array<{ value: string; label: string; dailyRate: string }>
  parkingSpaceOptions?: Array<{ value: string; label: string }>
  equipmentOptions?: Array<{ value: number; label: string }>
  isLoadingOptions?: boolean
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
  brandOptions = [],
  categoryOptions = [],
  parkingSpaceOptions = [],
  equipmentOptions = [],
  isLoadingOptions = false,
  enablePhotoUpload = false,
  selectedPhotos,
  onPhotosChange,
}: VehicleManagementFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
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
      recommended_use: initialValues?.recommended_use ?? '',
      power_hp: typeof initialValues?.power_hp === 'number' ? String(initialValues.power_hp) : '',
      consumption: typeof initialValues?.consumption === 'number' ? String(initialValues.consumption) : '',
      trunk_volume: typeof initialValues?.trunk_volume === 'number' ? String(initialValues.trunk_volume) : '',
      euro_standard: initialValues?.euro_standard ?? '',
      included_km_per_day: typeof initialValues?.included_km_per_day === 'number' ? String(initialValues.included_km_per_day) : '',
      extra_km_price: typeof initialValues?.extra_km_price === 'number' ? String(initialValues.extra_km_price) : '',
      minimum_age: typeof initialValues?.minimum_age === 'number' ? String(initialValues.minimum_age) : '',
      required_license: initialValues?.required_license ?? '',
      equipment: initialValues?.equipment ?? [],
      is_active:
        typeof initialValues?.is_active === 'boolean'
          ? (initialValues.is_active ? 'true' : 'false')
          : 'true',
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
  const selectedCategory = useWatch({ control, name: 'category' })
  const selectedBrand = useWatch({ control, name: 'brand' })
  const selectedModel = useWatch({ control, name: 'model_name' })
  const selectedEquipment = useWatch({ control, name: 'equipment' }) ?? []
  const [activeTab, setActiveTab] = useState<VehicleFormTab>('features')
  const selectedCategoryRate = categoryOptions.find((option) => option.value === selectedCategory)?.dailyRate ?? null
  const selectedBrandLabel = brandOptions.find((option) => option.value === selectedBrand)?.label ?? ''
  const vehicleName = [selectedBrandLabel, selectedModel?.trim()].filter(Boolean).join(' ') || 'Nouveau véhicule'
  const photoPreviews = useMemo(
    () => (selectedPhotos ?? []).map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedPhotos],
  )

  useEffect(() => () => {
    photoPreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
  }, [photoPreviews])

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
      status: 'DISPONIBLE',
      is_active: values.is_active === 'true',
    }

    if (values.mileage && values.mileage.trim() !== '') {
      payload.mileage = Number(values.mileage)
    }

    const normalizedDescription = values.description?.trim()
    if (normalizedDescription) {
      payload.description = normalizedDescription
    }

    const recommendedUse = values.recommended_use?.trim()
    if (recommendedUse) payload.recommended_use = recommendedUse

    const assignOptionalNumber = (key: 'power_hp' | 'consumption' | 'trunk_volume' | 'included_km_per_day' | 'extra_km_price' | 'minimum_age', value: string | undefined) => {
      if (value?.trim()) payload[key] = Number(value)
    }
    assignOptionalNumber('power_hp', values.power_hp)
    assignOptionalNumber('consumption', values.consumption)
    assignOptionalNumber('trunk_volume', values.trunk_volume)
    assignOptionalNumber('included_km_per_day', values.included_km_per_day)
    assignOptionalNumber('extra_km_price', values.extra_km_price)
    assignOptionalNumber('minimum_age', values.minimum_age)
    if (values.euro_standard?.trim()) payload.euro_standard = values.euro_standard.trim()
    if (values.required_license?.trim()) payload.required_license = values.required_license.trim()
    payload.equipment = values.equipment

    await onSubmit(payload)
  }

  return (
    <div className="space-y-6">
      {displayedApiError ? <Alert variant="danger" title="Enregistrement impossible" message={displayedApiError} /> : null}

      <form onSubmit={handleSubmit(onValidSubmit)} noValidate className="space-y-6">
        <VehicleFormSection title="Informations internes">
          <div className="grid gap-5 md:grid-cols-2">
            <Input label="Immatriculation" placeholder="GAC-ABC-001" maxLength={30} error={errors.registration_number?.message} {...register('registration_number')} />
            <div className="space-y-2">
              <Select
                label="Parking / place"
                placeholder={isLoadingOptions ? 'Chargement...' : parkingSpaceOptions.length > 0 ? 'Sélectionner une place' : 'Aucune place disponible'}
                options={parkingSpaceOptions}
                error={errors.parking_space?.message}
                disabled={disabled || isLoadingOptions || parkingSpaceOptions.length === 0}
                {...register('parking_space')}
              />
            </div>
            <Input type="text" label="Kilométrage initial" placeholder="0" inputMode="numeric" error={errors.mileage?.message} {...register('mileage')} />
            <Select label="Actif / inactif" options={[...isActiveOptions]} error={errors.is_active?.message} disabled={disabled} {...register('is_active')} />
            <Select label="Marque" placeholder="Sélectionner une marque" options={brandOptions} error={errors.brand?.message} disabled={disabled || isLoadingOptions} {...register('brand')} />
            <Select label="Catégorie" placeholder="Sélectionner une catégorie" options={categoryOptions} error={errors.category?.message} disabled={disabled || isLoadingOptions} {...register('category')} />
            <Input label="Modèle" placeholder="Rafale" maxLength={150} error={errors.model_name?.message} {...register('model_name')} />
            <Input type="text" label="Année" placeholder={String(new Date().getFullYear())} inputMode="numeric" error={errors.year?.message} {...register('year')} />
          </div>
        </VehicleFormSection>

        <VehicleFormSection title="Fiche visible par le client">

          <div className="grid grid-cols-1 gap-6 rounded-3xl border border-[#E5E7EB] bg-white p-5 lg:grid-cols-[1.55fr_0.95fr]">
            <div>
              {photoPreviews[0] ? (
                <img src={photoPreviews[0].url} alt="Aperçu principal" className="h-72 w-full rounded-[1.25rem] object-cover sm:h-[26rem]" />
              ) : (
                <div className="flex h-72 w-full items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-slate-100 to-slate-200 sm:h-[26rem]">
                  <p className="rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-600">Aucune photo principale disponible</p>
                </div>
              )}
            </div>
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-slate-500">Nom du véhicule</p>
                <p className="mt-1 text-2xl font-semibold text-[#1F2937]">{vehicleName}</p>
              </div>
              <Input label="Usage conseillé" placeholder="Famille, confortable et polyvalente" error={errors.recommended_use?.message} {...register('recommended_use')} />
              <div className="space-y-2">
                <p className="text-sm font-medium text-[#1F2937]">Tarif journalier</p>
                <div className="flex h-12 items-center rounded-2xl border border-[#E5E7EB] bg-[#EFF6FF] px-4 text-sm font-semibold text-[#1F2937]">
                  {selectedCategoryRate ? `${selectedCategoryRate} EUR / jour` : 'Sélectionnez une catégorie'}
                </div>
                <p className="text-xs text-slate-500">Tarif défini par la catégorie sélectionnée.</p>
              </div>
              <Input label="Description" placeholder="Description visible par les clients" error={errors.description?.message} {...register('description')} />
            </div>
          </div>

          {enablePhotoUpload ? (
            <div className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
              <div className="space-y-2">
                <label htmlFor="vehicle-photos" className="block text-sm font-medium text-[#1F2937]">Photos</label>
                <input
                  id="vehicle-photos"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={disabled}
                  onChange={handlePhotoInputChange}
                  className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm file:mr-3 file:rounded-xl file:border-0 file:bg-[#F5F5F5] file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-[#E5E7EB]"
                />
                <p className="text-xs text-slate-500">La première image sera la photo principale.</p>
              </div>

              {photoPreviews.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {photoPreviews.map((preview, index) => (
                    <div key={`${preview.file.name}-${index}`} className="space-y-1">
                      <img src={preview.url} alt={`Aperçu ${index + 1}`} className="aspect-[4/3] w-full rounded-xl border border-slate-200 object-cover" />
                      <p className="truncate text-xs text-slate-500">{preview.file.name}</p>
                    </div>
                  ))}
                </div>
              ) : null}

            </div>
          ) : null}

          <VehicleFormTabs activeTab={activeTab} onTabChange={setActiveTab}>
            {activeTab === 'features' ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                <Input type="text" inputMode="numeric" label="Nombre de places" placeholder="5" error={errors.seats?.message} {...register('seats')} />
                <Input type="text" inputMode="numeric" label="Nombre de portes" placeholder="5" error={errors.doors?.message} {...register('doors')} />
                <Input label="Motorisation" placeholder="Hybride essence" error={errors.fuel_type?.message} {...register('fuel_type')} />
                <Input label="Boîte de vitesses" placeholder="Automatique" error={errors.transmission?.message} {...register('transmission')} />
                <Input type="text" inputMode="numeric" label="Puissance (ch)" placeholder="130" error={errors.power_hp?.message} {...register('power_hp')} />
                <Input type="text" inputMode="decimal" label="Consommation (L/100km)" placeholder="5.5" error={errors.consumption?.message} {...register('consumption')} />
                <Input type="text" inputMode="numeric" label="Coffre / volume (L)" placeholder="400" error={errors.trunk_volume?.message} {...register('trunk_volume')} />
                <Input label="Norme Euro" placeholder="Euro 6" error={errors.euro_standard?.message} {...register('euro_standard')} />
                <Input label="Couleur" placeholder="Noir" error={errors.color?.message} {...register('color')} />
              </div>
            ) : null}

            {activeTab === 'equipment' ? (
              equipmentOptions.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {equipmentOptions.map((equipment) => (
                    <label key={equipment.value} className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#1F2937] transition hover:border-[#2563EB]">
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(equipment.value)}
                        onChange={() => setValue(
                          'equipment',
                          selectedEquipment.includes(equipment.value)
                            ? selectedEquipment.filter((value) => value !== equipment.value)
                            : [...selectedEquipment, equipment.value],
                          { shouldDirty: true },
                        )}
                        className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB]"
                      />
                      {equipment.label}
                    </label>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">Aucun équipement disponible dans le catalogue.</p>
            ) : null}

            {activeTab === 'conditions' ? (
              <div className="grid gap-5 md:grid-cols-2">
                <Input type="text" inputMode="numeric" label="Kilométrage inclus / jour" placeholder="200" error={errors.included_km_per_day?.message} {...register('included_km_per_day')} />
                <Input type="text" inputMode="decimal" label="Prix du kilomètre supplémentaire" placeholder="0.25" error={errors.extra_km_price?.message} {...register('extra_km_price')} />
                <Input type="text" inputMode="numeric" label="Âge minimum" placeholder="21" error={errors.minimum_age?.message} {...register('minimum_age')} />
                <Input label="Permis requis" placeholder="Permis B" error={errors.required_license?.message} {...register('required_license')} />
              </div>
            ) : null}
          </VehicleFormTabs>
        </VehicleFormSection>

        <div className="flex justify-end">
          <Button type="submit" disabled={disabled || isLoadingOptions || parkingSpaceOptions.length === 0} className="w-full sm:w-auto">
            {disabled ? 'Enregistrement...' : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  )
}