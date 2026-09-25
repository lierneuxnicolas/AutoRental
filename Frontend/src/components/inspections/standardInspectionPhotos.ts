import type { PhotoType } from '../../types/inspection'

export interface StandardInspectionPhotoSlot {
  key: string
  label: string
  photoType: PhotoType
  position?: number
}

export const STANDARD_INSPECTION_PHOTO_SLOTS: StandardInspectionPhotoSlot[] = [
  { key: 'front_left', label: 'Avant gauche', photoType: 'AVANT' },
  { key: 'front_right', label: 'Avant droit', photoType: 'COTE_DROIT' },
  { key: 'rear_left', label: 'Arrière gauche', photoType: 'COTE_GAUCHE' },
  { key: 'rear_right', label: 'Arrière droit', photoType: 'ARRIERE' },
  { key: 'dashboard', label: 'Tableau de bord', photoType: 'TABLEAU_DE_BORD' },
  { key: 'front_seats', label: 'Sièges avant', photoType: 'INTERIEUR', position: 1 },
  { key: 'rear_seats', label: 'Sièges arrière', photoType: 'INTERIEUR', position: 2 },
  { key: 'trunk', label: 'Coffre', photoType: 'AUTRE', position: 1 },
]
