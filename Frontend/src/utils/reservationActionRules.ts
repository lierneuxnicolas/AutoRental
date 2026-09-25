import type { ReservationStatus } from '../types/reservation'

export const UNLOCK_EARLY_WINDOW_MINUTES = 15

export interface UnlockWindowAvailability {
  isVisible: boolean
  isEnabled: boolean
  showTooEarlyMessage: boolean
}

export function getUnlockWindowAvailability(
  status: ReservationStatus | undefined,
  startAt: string,
  endAt: string,
): UnlockWindowAvailability {
  if (status !== 'CONFIRMEE') {
    return {
      isVisible: false,
      isEnabled: false,
      showTooEarlyMessage: false,
    }
  }

  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return {
      isVisible: true,
      isEnabled: false,
      showTooEarlyMessage: false,
    }
  }

  const unlockWindowStart = startDate.getTime() - (UNLOCK_EARLY_WINDOW_MINUTES * 60 * 1000)
  const now = Date.now()
  const isEnabled = now >= unlockWindowStart && now <= endDate.getTime()

  return {
    isVisible: true,
    isEnabled,
    showTooEarlyMessage: now < unlockWindowStart,
  }
}

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
