import type { Inspection, InspectionPhoto } from './inspection'

export interface ReservationCreateRequest {
  vehicle_id: number
  start_at: string
  end_at: string
  insurance_type?: 'STANDARD' | 'DUO' | 'OMNIUM'
}

export interface ReservationListQueryParams {
  ordering?: string
  page?: number
  search?: string
  status?: string
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
  insurance_type?: 'STANDARD' | 'DUO' | 'OMNIUM'
  deposit_amount: string
  total_amount: string
  created_at: string
  confirmed_at?: string | null
  cancelled_at?: string | null
  cancellation_reason?: string
}

export interface ReservationInspectionDetail extends Inspection {
  photos: InspectionPhoto[]
}

export interface ReservationDetail extends ReservationCreateResponse {
  departure_inspection?: ReservationInspectionDetail | null
  return_inspection?: ReservationInspectionDetail | null
}

export interface PaginatedReservationListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ReservationDetail[]
}

export interface ReservationCancelRequest {
  reason: string
}

export interface ReservationCancellationFinancials {
  amount_paid: string | number
  cancellation_fee: string | number
  refundable_amount: string | number
  deposit_release: string
}

export interface ReservationCancellationPreview extends ReservationCancellationFinancials {
  can_cancel: boolean
}

export interface ReservationCancelResponse {
  message: string
  reservation: ReservationDetail
  cancellation_financials: ReservationCancellationFinancials
}
