export interface VehiclePhoto {
  id: number
  file: string
  uploaded_at?: string
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
  description: string
  public_status: string
  category_daily_rate: string
  main_photo: VehiclePhoto | null
  photos: VehiclePhoto[]
  parking_name: string | null
  parking_address: string | null
  parking_space_number: string | null
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type VehiclesApiResponse = PublicVehicle[] | PaginatedResponse<PublicVehicle>