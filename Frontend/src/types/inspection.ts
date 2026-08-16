export type InspectionStatus = 'BROUILLON' | 'EN_COURS' | 'TERMINE' | 'ANNULE'

export type InspectionType = 'INITIAL' | 'FINAL'

export type PhotoType =
  | 'AVANT'
  | 'ARRIERE'
  | 'COTE_GAUCHE'
  | 'COTE_DROIT'
  | 'INTERIEUR'
  | 'TABLEAU_DE_BORD'
  | 'DOMMAGE'
  | 'AUTRE'

export type Severity = 'MINEUR' | 'MODERE' | 'MAJEUR' | 'CRITIQUE'

export interface Inspection {
  id: number
  reservation: number
  inspection_type: InspectionType
  status?: InspectionStatus
  mileage?: number | null
  energy_level_percent?: number | null
  comments?: string
  has_critical_issue?: boolean
  critical_issue_description?: string
  started_at?: string | null
  completed_at?: string | null
  completed_by?: number | null
  created_at: string
  updated_at: string
}

export interface CreateInspectionResponse {
  inspection: Inspection
  mandatory_photo_types: string[]
  missing_fields: string[]
}

export interface CompleteInspectionRequest {
  mileage: number
  energy_level_percent: number
  comments?: string
  has_critical_issue?: boolean
  critical_issue_description?: string
}

export interface InspectionPhoto {
  id: number
  inspection: number
  photo_type: PhotoType
  file: string | null
  position?: number
  created_at: string
}

export interface UploadInspectionPhotoRequest {
  file: File
  photo_type: PhotoType
  position?: number
}

export interface InspectionDamageCreateRequest {
  description: string
  severity: Severity
  location: string
  photo_ids?: number[]
}

export interface InspectionDamage {
  id: number
  inspection: number
  vehicle: number
  reported_by: number
  description: string
  severity: Severity
  location: string
  photo_ids: number[]
  created_at: string
  updated_at: string
}

export interface DepartureVehicleStateRequest {
  mileage: number
  energy_level_percent: number
  anomaly_present: boolean
  anomaly_description?: string
  anomaly_severity?: Severity
  photo_ids?: number[]
}

export interface DepartureVehicleStateResponse {
  inspection: Inspection
  damage: InspectionDamage | null
  vehicle_status: string
}

export interface VehicleAccessActionResponse {
  message: string
  state: string
  timestamp: string
}

export type UnlockVehicleResponse = VehicleAccessActionResponse

export type LockVehicleResponse = VehicleAccessActionResponse
