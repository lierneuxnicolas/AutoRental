export type VehicleManagementStatus =
  | 'DISPONIBLE'
  | 'RESERVE'
  | 'LOUE'
  | 'A_CONTROLER'
  | 'MAINTENANCE'
  | 'NETTOYAGE'
  | 'ACCIDENTE'
  | 'INDISPONIBLE'

export interface VehicleManagementCreateRequest {
  brand: number
  category: number
  parking_space: number
  registration_number: string
  model_name: string
  year: number
  color: string
  fuel_type: string
  transmission: string
  seats: number
  doors: number
  status: VehicleManagementStatus
  mileage?: number
  description?: string
  is_active?: boolean
}

export interface VehicleManagementUpdateRequest {
  brand?: number
  category?: number
  parking_space?: number
  registration_number?: string
  model_name?: string
  year?: number
  color?: string
  fuel_type?: string
  transmission?: string
  seats?: number
  doors?: number
  mileage?: number
  description?: string
  status?: VehicleManagementStatus
  is_active?: boolean
}

export interface VehicleManagementStatusUpdateRequest {
  status?: VehicleManagementStatus
  reason?: string
}

export interface VehiclePhotoCreateRequest {
  file: File
  is_primary?: boolean
  position?: number
  caption?: string
}

export interface VehiclePhotoPublic {
  id: number
  file: string | null
  caption: string
  position: number
}

export interface VehiclePhotoRead {
  id: number
  file: string | null
  created_at: string
  updated_at: string
  is_primary?: boolean
  position?: number
  caption?: string
}

export interface ManagementVehicleResponse {
  id: number
  brand: string
  model_name: string
  category: string
  year: number
  color: string
  fuel_type: string
  transmission: string
  seats: number
  doors: number
  category_daily_rate: string
  public_status: string
  photos: VehiclePhotoPublic[]
  main_photo: VehiclePhotoPublic | null
  parking_name: string | null
  parking_address: string | null
  parking_space_number: string | null
  description?: string
}
