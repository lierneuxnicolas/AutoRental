import type { ReservationDetail } from '../types/reservation'

export function isReturnCompleted(reservation: ReservationDetail | undefined): boolean {
  const inspection = reservation?.return_inspection
  return inspection?.status === 'TERMINE' && (
    (reservation?.status === 'A_CONTROLER' && inspection.return_access_secured)
    || reservation?.status === 'TERMINEE'
  )
}

export type ReturnFinalizationResult =
  | { kind: 'verified'; reservation: ReservationDetail; submissionError: unknown | null }
  | { kind: 'unverified'; submissionError: unknown | null; verificationError: unknown }

export async function finalizeReturnAndRead(
  submit: () => Promise<unknown>,
  read: () => Promise<ReservationDetail>,
): Promise<ReturnFinalizationResult> {
  let submissionError: unknown | null = null
  try {
    await submit()
  } catch (error) {
    submissionError = error
  }

  try {
    return { kind: 'verified', reservation: await read(), submissionError }
  } catch (verificationError) {
    return { kind: 'unverified', submissionError, verificationError }
  }
}
