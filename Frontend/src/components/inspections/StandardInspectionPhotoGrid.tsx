import InspectionPhotoSlot from './InspectionPhotoSlot'
import { STANDARD_INSPECTION_PHOTO_SLOTS } from './standardInspectionPhotos'

interface StandardInspectionPhotoGridProps {
  title: string
  photoState: Record<string, { previewUrl: string | null }>
  disabled?: boolean
  onFileChange: (slotKey: string, file: File | null) => void
}

export default function StandardInspectionPhotoGrid({
  title,
  photoState,
  disabled = false,
  onFileChange,
}: StandardInspectionPhotoGridProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">Extérieur, habitacle et tableau de bord.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {STANDARD_INSPECTION_PHOTO_SLOTS.map((slot) => (
          <InspectionPhotoSlot
            key={slot.key}
            photoType={slot.photoType}
            label={slot.label}
            previewUrl={photoState[slot.key]?.previewUrl ?? null}
            uploadedUrl={photoState[slot.key]?.previewUrl ?? null}
            isUploading={disabled}
            errorMessage={null}
            onFileChange={(file) => onFileChange(slot.key, file)}
          />
        ))}
      </div>
    </section>
  )
}
