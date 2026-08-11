import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Link, useParams } from 'react-router-dom'
import Alert from '../../components/feedback/Alert'
import EmptyState from '../../components/feedback/EmptyState'
import LoadingSpinner from '../../components/feedback/LoadingSpinner'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { deleteVehiclePhoto, uploadVehiclePhoto } from '../../services/managementVehicleService'
import { getVehicleById } from '../../services/vehicleService'
import type { VehiclePhotoPublic } from '../../types/managementVehicle'
import type { PublicVehicle } from '../../types/vehicle'
import { resolveMediaUrl } from '../../utils/media'

interface ManagerVehiclePhotosPageProps {
  basePath?: string
}

interface UploadPhotoFormState {
  file: File | null
  caption: string
  position: string
}

interface ApiDetailPayload {
  detail?: string
  file?: string[]
  caption?: string[]
  position?: string[]
}

function getLoadErrorMessage(error: unknown): { title: string; message: string; is404: boolean } {
  if (!axios.isAxiosError(error)) {
    return {
      title: 'Erreur API',
      message: 'Une erreur inattendue est survenue lors du chargement du vehicule.',
      is404: false,
    }
  }

  if (error.response?.status === 404) {
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
    message: detail.trim().length > 0 ? detail : 'Impossible de charger les photos du vehicule pour le moment.',
    is404: false,
  }
}

function getUploadErrorMessage(error: unknown): string {
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

  const payload = error.response.data as ApiDetailPayload | undefined

  if (payload?.detail && payload.detail.trim().length > 0) {
    return payload.detail
  }

  if (Array.isArray(payload?.file) && payload.file.length > 0) {
    return payload.file[0]
  }

  if (Array.isArray(payload?.caption) && payload.caption.length > 0) {
    return payload.caption[0]
  }

  if (Array.isArray(payload?.position) && payload.position.length > 0) {
    return payload.position[0]
  }

  return 'Impossible d\'ajouter la photo pour le moment.'
}

function getDeleteErrorMessage(error: unknown): string {
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

  const payload = error.response.data as ApiDetailPayload | undefined

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

function toPhotoGallery(photos: PublicVehicle['photos']): VehiclePhotoPublic[] {
  return photos.map((photo, index) => ({
    id: photo.id,
    file: photo.file,
    caption: '',
    position: index,
  }))
}

export default function ManagerVehiclePhotosPage({ basePath = '/manager' }: ManagerVehiclePhotosPageProps) {
  const queryClient = useQueryClient()
  const { id } = useParams<{ id: string }>()
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null)
  const [formState, setFormState] = useState<UploadPhotoFormState>({
    file: null,
    caption: '',
    position: '',
  })

  const vehicleId = useMemo(() => {
    if (!id) {
      return null
    }

    const parsed = Number(id)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }, [id])

  const vehicleQuery = useQuery({
    queryKey: ['manager-vehicle-photos', vehicleId],
    queryFn: async () => {
      if (vehicleId === null) {
        throw new Error('INVALID_ID')
      }

      return getVehicleById(vehicleId)
    },
    enabled: vehicleId !== null,
  })

  const uploadMutation = useMutation({
    mutationFn: async ({ targetId, payload }: { targetId: number; payload: Parameters<typeof uploadVehiclePhoto>[1] }) =>
      uploadVehiclePhoto(targetId, payload),
    onSuccess: async () => {
      setUploadError(null)
      setUploadSuccess('La photo a ete ajoutee avec succes.')
      setDeleteError(null)
      setFormState({ file: null, caption: '', position: '' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-photos', vehicleId] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
      ])
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ targetId, photoId }: { targetId: number; photoId: number }) =>
      deleteVehiclePhoto(targetId, photoId),
    onSuccess: async () => {
      setDeleteError(null)
      setDeleteSuccess('La photo a ete supprimee avec succes.')
      setUploadError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['manager-vehicle-photos', vehicleId] }),
        queryClient.invalidateQueries({ queryKey: ['manager-vehicles'] }),
      ])
    },
  })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null
    setFormState((current) => ({
      ...current,
      file: nextFile,
    }))
    setUploadError(null)
    setUploadSuccess(null)
    setDeleteError(null)
    setDeleteSuccess(null)
  }

  const handleCaptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((current) => ({
      ...current,
      caption: event.target.value,
    }))
  }

  const handlePositionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((current) => ({
      ...current,
      position: event.target.value,
    }))
  }

  const handleUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (vehicleId === null) {
      setUploadError('Identifiant de vehicule invalide.')
      return
    }

    if (!formState.file) {
      setUploadError('Le fichier image est obligatoire.')
      return
    }

    setUploadError(null)
    setUploadSuccess(null)
    setDeleteError(null)
    setDeleteSuccess(null)

    try {
      await uploadMutation.mutateAsync({
        targetId: vehicleId,
        payload: {
          file: formState.file,
          caption: formState.caption.trim() || undefined,
          position: formState.position.trim() === '' ? undefined : Number(formState.position),
        },
      })
    } catch (error) {
      setUploadError(getUploadErrorMessage(error))
    }
  }

  const handleDeletePhoto = async (photoId: number) => {
    if (vehicleId === null) {
      setDeleteError('Identifiant de vehicule invalide.')
      return
    }

    const confirmed = window.confirm('Confirmer la suppression de cette photo ?')
    if (!confirmed) {
      return
    }

    setDeleteError(null)
    setDeleteSuccess(null)
    setUploadError(null)

    try {
      await deleteMutation.mutateAsync({
        targetId: vehicleId,
        photoId,
      })
    } catch (error) {
      setDeleteError(getDeleteErrorMessage(error))
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
        <LoadingSpinner size="lg" aria-label="Chargement des photos du vehicule" />
      </section>
    )
  }

  if (vehicleQuery.isError) {
    const { title, message, is404 } = getLoadErrorMessage(vehicleQuery.error)

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
      </section>
    )
  }

  const vehicle = vehicleQuery.data
  const gallery = toPhotoGallery(vehicle.photos)
  const mainPhoto = getMainPhoto(vehicle)
  const mainPhotoMetadata = gallery.find((photo) => photo.id === mainPhoto?.id) ?? null
  const mainPhotoUrl = resolveMediaUrl(mainPhoto?.file)

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#2563EB]">Gestion vehicules</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#0F172A]">Photos du vehicule</h1>
          <p className="mt-2 text-sm text-slate-600">
            {vehicle.brand} {vehicle.model_name} - {vehicle.year}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to={`${basePath}/vehicles/${vehicle.id}/edit`}>
            <Button type="button" variant="secondary">Retour a la fiche</Button>
          </Link>
          <Link to={`${basePath}/vehicles`}>
            <Button type="button" variant="secondary">Retour a la liste</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Galerie existante</h2>}>
          {deleteError ? <Alert variant="danger" title="Suppression impossible" message={deleteError} className="mb-4" /> : null}
          {deleteSuccess ? <Alert variant="success" title="Suppression reussie" message={deleteSuccess} className="mb-4" /> : null}

          {mainPhotoUrl ? (
            <div className="space-y-4">
              <div>
                <p className="mb-3 text-sm font-medium text-slate-600">Photo principale</p>
                <img
                  src={mainPhotoUrl}
                  alt={`${vehicle.brand} ${vehicle.model_name}`}
                  className="h-72 w-full rounded-2xl border border-[#E5E7EB] object-cover"
                />
                {mainPhotoMetadata?.caption ? <p className="mt-3 text-sm text-slate-600">{mainPhotoMetadata.caption}</p> : null}
              </div>

              {vehicle.photos.length > 1 ? (
                <div>
                  <p className="mb-3 text-sm font-medium text-slate-600">Galerie</p>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {gallery.map((photo) => {
                      const photoUrl = resolveMediaUrl(photo.file)

                      if (!photoUrl) {
                        return null
                      }

                      return (
                        <div key={photo.id} className="space-y-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                          <img
                            src={photoUrl}
                            alt={`Photo ${photo.id} du vehicule ${vehicle.brand} ${vehicle.model_name}`}
                            className="h-40 w-full rounded-xl object-cover"
                            loading="lazy"
                          />
                          <div className="text-sm text-slate-600">
                            <p>Position: {photo.position}</p>
                            <p>{photo.caption || 'Aucune legende'}</p>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              disabled={deleteMutation.isPending}
                              onClick={() => void handleDeletePhoto(photo.id)}
                            >
                              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Aucune photo"
              description="Ce vehicule ne possede encore aucune photo enregistree."
            />
          )}
        </Card>

        <Card header={<h2 className="text-lg font-semibold text-[#1F2937]">Ajouter une photo</h2>}>
          <div className="space-y-4">
            {uploadError ? <Alert variant="danger" title="Upload impossible" message={uploadError} /> : null}
            {uploadSuccess ? <Alert variant="success" title="Upload reussi" message={uploadSuccess} /> : null}

            <form onSubmit={handleUploadSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <label htmlFor="vehicle-photo-file" className="block text-sm font-medium text-[#1F2937]">
                  Fichier image
                </label>
                <input
                  id="vehicle-photo-file"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  disabled={uploadMutation.isPending}
                  onChange={handleFileChange}
                  className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#1F2937] shadow-sm outline-none transition file:mr-3 file:rounded-xl file:border-0 file:bg-[#F5F5F5] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[#1F2937] hover:file:bg-[#E5E7EB] focus:border-[#2563EB] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-[#F5F5F5]"
                />
                <p className="text-sm text-slate-500">Formats supportes: JPG, JPEG, PNG, WEBP.</p>
              </div>

              <Input
                label="Legende (optionnel)"
                placeholder="Ex: Vue avant"
                maxLength={255}
                value={formState.caption}
                onChange={handleCaptionChange}
                disabled={uploadMutation.isPending}
              />

              <Input
                type="number"
                label="Position (optionnel)"
                placeholder="Ex: 0"
                min={0}
                value={formState.position}
                onChange={handlePositionChange}
                disabled={uploadMutation.isPending}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={uploadMutation.isPending} className="w-full sm:w-auto">
                  {uploadMutation.isPending ? 'Upload en cours...' : 'Ajouter la photo'}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      </div>
    </section>
  )
}