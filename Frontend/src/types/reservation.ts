export interface ReservationCreateRequest {
  vehicle_id: number
  start_at: string
  end_at: string
}

export type ReservationStatus =
  | 'BROUILLON'
  | 'EN_ATTENTE_CAUTION'
  | 'EN_ATTENTE_PAIEMENT'
  | 'CONFIRMEE'
  | 'EN_COURS'
  | 'A_CONTROLER'
  | 'TERMINEE'
  | 'ANNULEE'
  | 'PAIEMENT_ECHOUE'

export interface ReservationVehicleSummary {
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
}

export interface ReservationCreateResponse {
  id: number
  reference: string
  vehicle: ReservationVehicleSummary
  start_at: string
  end_at: string
  status?: ReservationStatus
  rental_amount: string
  deposit_amount: string
  created_at: string
  confirmed_at?: string | null
  cancelled_at?: string | null
  cancellation_reason?: string
}
