export type ReservationResume = {
  from: string
  reservationDraft: {
    vehicleId: number
    start: string
    end: string
    insurance: 'standard' | 'complementary'
  }
}

const storageKey = 'getacarReservationResume'
const maxAgeMs = 24 * 60 * 60 * 1000

export function getReservationResume(value: unknown): ReservationResume | null {
  if (!value || typeof value !== 'object' || !('from' in value) || !('reservationDraft' in value)) return null
  const { from, reservationDraft } = value
  if (typeof from !== 'string' || !reservationDraft || typeof reservationDraft !== 'object') return null
  if (!('vehicleId' in reservationDraft) || !('start' in reservationDraft) || !('end' in reservationDraft) || !('insurance' in reservationDraft)) return null
  const { vehicleId, start, end, insurance } = reservationDraft
  if (typeof vehicleId !== 'number' || !Number.isInteger(vehicleId) || vehicleId <= 0 ||
      typeof start !== 'string' || typeof end !== 'string' || !start || !end ||
      (insurance !== 'standard' && insurance !== 'complementary')) return null
  const [path, query] = from.split('?')
  const params = new URLSearchParams(query)
  if (path !== `/vehicles/${vehicleId}/reservation` || params.get('start') !== start || params.get('end') !== end) return null
  return { from, reservationDraft: { vehicleId, start, end, insurance } }
}

export function saveReservationResume(resume: ReservationResume): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ resume, savedAt: Date.now() }))
  } catch (error) {
    console.warn('Impossible de conserver le contexte de réservation dans ce navigateur.', error)
  }
}

export function readReservationResume(): ReservationResume | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const stored: unknown = JSON.parse(raw)
    if (!stored || typeof stored !== 'object' || !('savedAt' in stored) || !('resume' in stored) ||
        typeof stored.savedAt !== 'number' || Date.now() - stored.savedAt > maxAgeMs || stored.savedAt > Date.now()) return null
    return getReservationResume(stored.resume)
  } catch (error) {
    console.warn('Impossible de retrouver le contexte de réservation dans ce navigateur.', error)
    return null
  }
}

export function clearReservationResume(): void {
  try {
    localStorage.removeItem(storageKey)
  } catch (error) {
    console.warn('Impossible de supprimer le contexte de réservation dans ce navigateur.', error)
  }
}
