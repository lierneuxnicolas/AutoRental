import type { ReservationStatus } from '../types/reservation'

export function isReservationCancellable(status: ReservationStatus | undefined, startAt: string): boolean {
  if (!status) {
    return false
  }

  if (status === 'BROUILLON' || status === 'EN_ATTENTE_CAUTION' || status === 'EN_ATTENTE_PAIEMENT') {
    return true
  }

  if (status === 'CONFIRMEE') {
    const startDate = new Date(startAt)
    return !Number.isNaN(startDate.getTime()) && startDate.getTime() > Date.now()
  }

  return false
}
