import { useId } from 'react'
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
  hasSelectedFile: boolean
  onFileChange: (file: File | null) => void
  onUpload: () => void
}

export default function InspectionPhotoSlot({
  photoType,
  label,
  previewUrl,
  uploadedUrl,
  isUploading,
  errorMessage,
  hasSelectedFile,
  onFileChange,
  onUpload,
}: InspectionPhotoSlotProps) {
  const inputId = useId()

  const isUploaded = Boolean(uploadedUrl)
  const canUpload = hasSelectedFile && !isUploading

  return (
    <Card
      className="h-full"
      header={
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#1F2937]">{label}</h3>
          <StatusBadge variant={isUploaded ? 'success' : 'warning'} label={isUploaded ? 'Envoyee' : 'A envoyer'} />
        </div>
      }
    >
      <div className="space-y-4">
        <input
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="block w-full rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-slate-600 shadow-sm file:mr-3 file:rounded-full file:border-0 file:bg-[#DBEAFE] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#2563EB]"
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

        <Button className="w-full" disabled={!canUpload} onClick={onUpload}>
          {isUploading ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner size="sm" aria-label="Envoi de photo" />
              Envoi en cours...
            </span>
          ) : isUploaded ? (
            'Remplacer la photo'
          ) : (
            'Envoyer la photo'
          )}
        </Button>
      </div>
    </Card>
  )
}
