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

export async function getReservations(params?: ReservationListQueryParams): Promise<PaginatedReservationListResponse> {
  const { data } = await api.get<PaginatedReservationListResponse>('/reservations/', { params })
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
