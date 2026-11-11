import type { Inspection, InspectionPhoto, InspectionDamage } from './inspection'

export interface ReservationCreateRequest {
  vehicle_id: number
  start_at: string
  end_at: string
  insurance_type?: 'STANDARD' | 'COMPLEMENTAIRE' | 'DUO' | 'OMNIUM'
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
  | 'REAFFECTATION_REQUIRED'
  | 'EN_COURS'
  | 'A_CONTROLER'
  | 'TERMINEE'
  | 'NON_UTILISEE'
  | 'ANNULEE'
  | 'PAIEMENT_ECHOUE'

export interface ReservationVehicleSummary {
  id: number
  mileage?: number
  brand: string
  model_name: string
  category: string
  year: number
  color: string
  fuel_type: string
  transmission: string
  seats: number
  doors: number
  registration_number: string
  parking_name: string
  parking_address: string | null
  parking_space_number: string
}

export interface ReservationCreateResponse {
  id: number
  reference: string
  vehicle: ReservationVehicleSummary
  start_at: string
  end_at: string
  is_daily_rate_booking: boolean
  status?: ReservationStatus
  rental_amount: string
  insurance_type?: 'STANDARD' | 'COMPLEMENTAIRE' | 'DUO' | 'OMNIUM'
  deposit_amount: string
  total_amount: string
  invoice_id?: number | null
  invoice_pdf_available?: boolean
  actual_pickup_at?: string | null
  actual_return_at?: string | null
  unlock_availability?: { allowed: boolean; code: string | null; message: string | null } | null
  created_at: string
  confirmed_at?: string | null
  cancelled_at?: string | null
  cancellation_reason?: string
  cancellation_source?: 'CLIENT' | 'GESTIONNAIRE' | 'SYSTEME' | null
}

export interface ReservationInspectionDetail extends Inspection {
  photos: InspectionPhoto[]
  damages: InspectionDamage[]
  return_access_secured: boolean
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
  confirm_no_refund?: boolean
}

export interface ReservationCancellationFinancials {
  amount_paid: string | number
  cancellation_fee: string | number
  refundable_amount: string | number
  deposit_release: string
}

export interface ReservationCancellationPreview extends ReservationCancellationFinancials {
  can_cancel: boolean
  no_refund: boolean
}

export interface ReservationCancelResponse {
  message: string
  reservation: ReservationDetail
  cancellation_financials: ReservationCancellationFinancials
}
