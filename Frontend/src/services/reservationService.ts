import api from './api'
import type { ReservationCreateRequest, ReservationCreateResponse } from '../types/reservation'

export async function createReservation(payload: ReservationCreateRequest): Promise<ReservationCreateResponse> {
  const { data } = await api.post<ReservationCreateResponse>('/reservations/', payload)
  return data
}
