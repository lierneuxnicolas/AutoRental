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
  category_daily_rate?: number
  description?: string
  is_active?: boolean
  power_hp?: number
  consumption?: number
  trunk_volume?: number
  euro_standard?: string
  included_km_per_day?: number
  extra_km_price?: number
  minimum_age?: number
  required_license?: string
  recommended_use?: string
  equipment?: number[]
}

export type VehicleReferencePhotoKey =
  | 'reference_front_left'
  | 'reference_front_right'
  | 'reference_rear_left'
  | 'reference_rear_right'
  | 'reference_dashboard'
  | 'reference_front_seats'
  | 'reference_rear_seats'
  | 'reference_trunk'

export interface VehicleInitialDamageDraft {
  description: string
  severity: 'ACCEPTABLE' | 'GRAVE' | ''
  photo: File | null
}

export interface VehicleInitialStateDraft {
  energyLevelPercent: string
  photos: Record<VehicleReferencePhotoKey, File | null>
  damage: VehicleInitialDamageDraft | null
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
  category_daily_rate?: number
  description?: string
  status?: VehicleManagementStatus
  is_active?: boolean
  power_hp?: number | null
  consumption?: number | null
  trunk_volume?: number | null
  euro_standard?: string
  included_km_per_day?: number | null
  extra_km_price?: number | null
  minimum_age?: number | null
  required_license?: string
  recommended_use?: string
  equipment?: number[]
}

export interface ManagementVehicleDetailResponse {
  id: number
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
  category_daily_rate?: string
  description?: string
  is_active?: boolean
  power_hp?: number | null
  consumption?: string | null
  trunk_volume?: number | null
  euro_standard?: string | null
  included_km_per_day?: number | null
  extra_km_price?: string | null
  minimum_age?: number | null
  required_license?: string | null
  recommended_use?: string | null
  equipment?: number[]
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

export interface ManagementVehicleListItem {
  id: number
  brand: string
  model_name: string
  category: string
  registration_number: string
  is_active: boolean
  public_status: string
  needs_supervision: boolean
  has_urgent_checkin_anomaly: boolean
  parking_name: string | null
  parking_space_number: string | null
  main_photo: VehiclePhotoPublic | null
}

export interface BrandOption {
  id: number
  name: string
}

export interface VehicleCategoryOption {
  id: number
  name: string
  description: string
  daily_rate: string
  minimum_deposit: string
}

export interface ParkingSpaceOption {
  id: number
  number: string
  parking_id: number
  parking_name: string
  occupied_by_vehicle_id: number | null
}

export interface VehicleEquipmentOption {
  id: number
  code: string
  label: string
}
