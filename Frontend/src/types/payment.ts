import type { ReservationDetail } from './reservation'

export type DepositMode = 'SIMULATED' | 'STRIPE_TEST'

export interface ReservationDepositRequest {
  mode: DepositMode
}

export interface ReservationDepositResponse {
  message: string
  reservation: ReservationDetail
  deposit_id: number
  deposit_mode: string
  deposit_status: string
  deposit_amount: string
  currency: string
  stripe_payment_intent_id: string | null
  authorization_expires_at: string | null
  authorized_at: string | null
  client_secret: string | null
  authorization_note: string
}

export interface ReservationPaymentIntentResponse {
  client_secret: string | null
  payment_id: number
}
