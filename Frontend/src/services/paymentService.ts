import { RENTAL_TERMS_VERSION } from '../config/termsVersion'
import api from './api'
import type {
  ReservationDepositRequest,
  ReservationDepositResponse,
  ReservationPaymentIntentResponse,
} from '../types/payment'

export async function createReservationDeposit(
  reservationId: number,
  payload: ReservationDepositRequest,
): Promise<ReservationDepositResponse> {
  const { data } = await api.post<ReservationDepositResponse>(`/reservations/${reservationId}/deposit/`, payload)
  return data
}

export async function createReservationPaymentIntent(
  reservationId: number,
): Promise<ReservationPaymentIntentResponse> {
  const { data } = await api.post<ReservationPaymentIntentResponse>(
    `/reservations/${reservationId}/payment-intent/`,
    { rental_terms_accepted: true, rental_terms_version: RENTAL_TERMS_VERSION },
  )
  return data
}
