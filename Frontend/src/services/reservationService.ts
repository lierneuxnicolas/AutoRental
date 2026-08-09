import api from './api'
import type { ReservationCreateRequest, ReservationCreateResponse, ReservationDetail } from '../types/reservation'

export async function createReservation(payload: ReservationCreateRequest): Promise<ReservationCreateResponse> {
  const { data } = await api.post<ReservationCreateResponse>('/reservations/', payload)
  return data
}

export async function getReservationById(id: number | string): Promise<ReservationDetail> {
  const { data } = await api.get<ReservationDetail>(`/reservations/${id}/`)
  return data
}
