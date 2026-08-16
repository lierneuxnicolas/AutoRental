import { useRef } from 'react'
import Alert from '../feedback/Alert'
import LoadingSpinner from '../feedback/LoadingSpinner'
import Button from '../ui/Button'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import type { PhotoType } from '../../types/inspection'

export interface InspectionPhotoSlotProps {
  photoType: PhotoType
  label: string
  previewUrl: string | null
  uploadedUrl: string | null
  isUploading: boolean
  errorMessage: string | null
  onFileChange: (file: File | null) => void
}

export default function InspectionPhotoSlot({
  photoType,
  label,
  previewUrl,
  uploadedUrl,
  isUploading,
  errorMessage,
  onFileChange,
}: InspectionPhotoSlotProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isUploaded = Boolean(uploadedUrl)
  const status = isUploading
    ? { variant: 'info' as const, label: 'Envoi...' }
    : errorMessage
      ? { variant: 'danger' as const, label: "Erreur d'envoi" }
      : isUploaded
        ? { variant: 'success' as const, label: 'Envoyee ✓' }
        : { variant: 'warning' as const, label: 'A envoyer' }

  return (
    <Card
      className="h-full"
      header={
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#1F2937]">
            {label}
            {isUploaded ? <span className="ml-2 text-[#16A34A]">✓</span> : null}
          </h3>
          <StatusBadge variant={status.variant} label={status.label} />
        </div>
      }
    >
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={isUploading}
          className="hidden"
          onChange={(event) => {
            const selectedFile = event.target.files?.[0] ?? null
            onFileChange(selectedFile)
          }}
        />

        {previewUrl ? (
          <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC]">
            <img src={previewUrl} alt={`Previsualisation ${label}`} className="h-44 w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 text-center text-sm text-slate-500">
            Selectionnez une photo {photoType.toLowerCase().replace(/_/g, ' ')}.
          </div>
        )}

        {errorMessage ? <Alert variant="danger" message={errorMessage} /> : null}

        <Button
          className="w-full"
          disabled={isUploading}
          onClick={() => {
            fileInputRef.current?.click()
          }}
        >
          {isUploading ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner size="sm" aria-label="Envoi de photo" />
              Envoi en cours...
            </span>
          ) : isUploaded ? (
            'Remplacer la photo'
          ) : (
            'Sélectionner la photo'
          )}
        </Button>
      </div>
    </Card>
  )
}
