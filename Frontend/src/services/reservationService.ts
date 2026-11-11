import api from './api'
import type {
  PaginatedReservationListResponse,
  ReservationCancelRequest,
  ReservationCancelResponse,
  ReservationCancellationPreview,
  ReservationCreateRequest,
  ReservationCreateResponse,
  ReservationDetail,
  ReservationListQueryParams,
} from '../types/reservation'

export type PaymentCheck = { valid: boolean; message: string; state?: 'pending' }
export type PaymentChecks = {
  account: PaymentCheck
  identity: PaymentCheck
  license: PaymentCheck
  compatibility: PaymentCheck
  availability: PaymentCheck
}

export async function getPaymentChecks(payload: {
  vehicle_id: number
  start_at: string
  end_at: string
  reservation_id?: number
}): Promise<PaymentChecks> {
  const { data } = await api.post<PaymentChecks>('/reservations/payment-checks/', payload)
  return data
}

export async function getReservations(params?: ReservationListQueryParams): Promise<PaginatedReservationListResponse> {
  const { data } = await api.get<PaginatedReservationListResponse>('/reservations/', { params })
  return data
}

export async function getDashboardReservations(): Promise<ReservationDetail[]> {
  const { data } = await api.get<ReservationDetail[]>('/reservations/dashboard/')
  return data
}

export async function createReservation(payload: ReservationCreateRequest): Promise<ReservationCreateResponse> {
  const { data } = await api.post<ReservationCreateResponse>('/reservations/', payload)
  return data
}

export async function getReservationById(id: number | string): Promise<ReservationDetail> {
  const { data } = await api.get<ReservationDetail>(`/reservations/${id}/`)
  return data
}

export async function cancelReservation(
  id: number | string,
  payload: ReservationCancelRequest,
): Promise<ReservationCancelResponse> {
  const { data } = await api.post<ReservationCancelResponse>(`/reservations/${id}/cancel/`, payload)
  return data
}

export async function getReservationCancellationPreview(id: number | string): Promise<ReservationCancellationPreview> {
  const { data } = await api.get<ReservationCancellationPreview>(`/reservations/${id}/cancel-preview/`)
  return data
}

export async function cancelReservationForCriticalCheckinAnomaly(
  id: number | string,
): Promise<ReservationCancelResponse> {
  const { data } = await api.post<ReservationCancelResponse>(
    `/reservations/${id}/cancel-critical-checkin-anomaly/`,
  )
  return data
}
