import type {
  ManagementAdditionalChargesUpdateRequest,
  ManagementReservationValidationResponse,
  ManagementSettlementConfirmation,
  ManagementReturnClosureReadiness,
  ReservationManagementDetail,
} from '../types/managementReservation'

export const isDepositSettled = (status: ManagementReturnClosureReadiness['deposit_status']) =>
  status === 'CAPTUREE' || status === 'LIBEREE'

export function canEditManagerReturnCharges(
  reservation: Pick<ReservationManagementDetail, 'return_charges_editable' | 'deposit_status'>,
  readiness?: ManagementReturnClosureReadiness,
) {
  const depositStatus = readiness?.deposit_status ?? reservation.deposit_status
  return reservation.return_charges_editable
    && (depositStatus === 'AUTORISEE' || depositStatus === 'A_VERIFIER')
}

export class ReturnClosureError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
  }
}

export async function closeManagerReturn(
  confirmed: ManagementReturnClosureReadiness,
  payload: ManagementAdditionalChargesUpdateRequest,
  actions: {
    read: () => Promise<ManagementReturnClosureReadiness>
    save: (charges: ManagementAdditionalChargesUpdateRequest) => Promise<unknown>
    settle: (charges: ManagementSettlementConfirmation) => Promise<unknown>
    complete: () => Promise<ManagementReservationValidationResponse>
  },
) {
  let step = 'Vérification de la réservation impossible.'
  try {
    const current = await actions.read()
    if (current.deposit_id !== confirmed.deposit_id
      || current.deposit_status !== confirmed.deposit_status
      || current.maximum_charge !== confirmed.maximum_charge
      || current.deposit_amount !== confirmed.deposit_amount
      || current.captured_amount !== confirmed.captured_amount
      || current.released_amount !== confirmed.released_amount) {
      throw new ReturnClosureError('La caution a changé. Vérifiez les montants et confirmez à nouveau.')
    }
    if (!isDepositSettled(current.deposit_status)) {
      step = 'Enregistrement des frais impossible.'
      await actions.save(payload)
      step = 'Régularisation de la caution impossible.'
      await actions.settle({ ...payload, deposit_id: current.deposit_id, deposit_amount: current.deposit_amount })
    }
    step = 'Clôture ou vérification des factures impossible.'
    const { reservation } = await actions.complete()
    if (reservation.status !== 'TERMINEE' || !reservation.invoice_pdf_available) {
      throw new ReturnClosureError('La clôture et la facture restent à vérifier. Actualisez la réservation avant de réessayer.')
    }
    return reservation
  } catch (error) {
    if (error instanceof ReturnClosureError) throw error
    throw new ReturnClosureError(step, error)
  }
}
