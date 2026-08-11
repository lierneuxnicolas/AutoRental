import type { CompleteInspectionRequest, Inspection } from './inspection'
import type { PaginatedResponse } from './vehicle'

export type ManagementReservationStatus =
  | 'BROUILLON'
  | 'EN_ATTENTE_CAUTION'
  | 'EN_ATTENTE_PAIEMENT'
  | 'CONFIRMEE'
  | 'EN_COURS'
  | 'A_CONTROLER'
  | 'TERMINEE'
  | 'ANNULEE'
  | 'PAIEMENT_ECHOUE'

export interface ReservationManagementClientSummary {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string
  profile_status: string
  date_of_birth: string | null
}

export interface ReservationManagementVehicleSummary {
  id: number
  brand: string
  model_name: string
  category: string
  year: number
  color: string
  registration_plate: string
  energy_type: string
  transmission: string
  seats: number
}

export interface ReservationManagementDetail {
  id: number
  reference: string
  client_summary: ReservationManagementClientSummary
  vehicle: ReservationManagementVehicleSummary
  start_at: string
  end_at: string
  status: ManagementReservationStatus
  rental_amount: string
  deposit_amount: string
  created_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  cancellation_reason?: string
}

// The schema does not expose a dedicated 200 list payload for this endpoint,
// so we model it as a paginated collection of management reservation details.
export type PaginatedManagementReservationListResponse = PaginatedResponse<ReservationManagementDetail>

export interface ManagementReservationListQueryParams {
  client?: number
  client_email?: string
  client_first_name?: string
  client_last_name?: string
  end_at?: string
  end_at_from?: string
  end_at_to?: string
  ordering?:
    | 'created_at'
    | '-created_at'
    | 'start_at'
    | '-start_at'
    | 'rental_amount'
    | '-rental_amount'
  page?: number
  page_size?: number
  reference?: string
  search?: string
  start_at?: string
  start_at_from?: string
  start_at_to?: string
  status?: string
  vehicle?: number
  vehicle_registration_plate?: string
}

export interface ManagementReservationDetailPathParams {
  id: number
}

export type ManagementReservationClosureRequest = CompleteInspectionRequest

export type ManagementReservationClosureResponse = Inspection
