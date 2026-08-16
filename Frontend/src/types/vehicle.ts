export interface VehiclePhoto {
  id: number
  file: string
  uploaded_at?: string
}

export interface VehicleEquipment {
  id: number
  code: string
  label: string
}

export interface VehicleReservationProfileValidation {
  documents_must_be_valid?: boolean
  required_documents?: string[]
}

export interface VehicleFuelTracking {
  managed_in_inspections?: boolean
  field?: string
}

export interface VehicleLatePolicy {
  managed_in_departure_inspection_window?: boolean
  early_tolerance_minutes?: number
  late_tolerance_minutes?: number
}

export interface VehicleCancellationPolicy {
  allowed_statuses?: string[]
  confirmed_requires_future_start?: boolean
}

export interface VehicleInspectionPolicy {
  departure_required?: boolean
  return_required?: boolean
  mandatory_photo_count?: number
}

export interface VehicleConditions {
  included_km_per_day?: number | null
  extra_km_price?: string | number | null
  minimum_deposit?: string | number | null
  minimum_age?: number | null
  required_license?: string | null
  reservation_profile_validation?: VehicleReservationProfileValidation
  fuel_tracking?: VehicleFuelTracking
  late_policy?: VehicleLatePolicy
  cancellation_policy?: VehicleCancellationPolicy
  inspection_policy?: VehicleInspectionPolicy
}

export interface PublicVehicle {
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
  power_hp?: number | null
  consumption?: string | number | null
  trunk_volume?: number | null
  euro_standard?: string | null
  included_km_per_day?: number | null
  extra_km_price?: string | number | null
  minimum_age?: number | null
  required_license?: string | null
  recommended_use?: string | null
  description: string
  public_status: string
  category_daily_rate: string
  equipment?: VehicleEquipment[]
  main_photo: VehiclePhoto | null
  photos: VehiclePhoto[]
  parking_name: string | null
  parking_address: string | null
  parking_space_number: string | null
  conditions?: VehicleConditions
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type VehiclesApiResponse = PublicVehicle[] | PaginatedResponse<PublicVehicle>