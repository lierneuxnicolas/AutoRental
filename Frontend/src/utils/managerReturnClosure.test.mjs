import assert from 'node:assert/strict'
import test from 'node:test'
import { canEditManagerReturnCharges, closeManagerReturn } from './managerReturnClosure.ts'

const pending = {
  deposit_id: 12,
  deposit_status: 'A_VERIFIER',
  deposit_amount: '350.00',
  maximum_charge: '350.00',
  captured_amount: null,
  released_amount: null,
}
const payload = {
  charges: [
    { charge_type: 'RETARD', amount: '0.00', justification: '' },
    { charge_type: 'CARBURANT', amount: '0.00', justification: '' },
    { charge_type: 'KILOMETRAGE', amount: '0.00', justification: '' },
    { charge_type: 'DEGATS', amount: '25.00', justification: 'Rayure' },
  ],
}
const closed = { reservation: { status: 'TERMINEE', invoice_pdf_available: true } }

function closureActions(readiness) {
  const calls = []
  return {
    calls,
    read: async () => { calls.push('read'); return readiness },
    save: async (charges) => { calls.push(['save', charges]) },
    settle: async (confirmation) => { calls.push(['settle', confirmation]) },
    complete: async () => { calls.push('complete'); return closed },
  }
}

test('an eligible deposit allows editing even while closure readiness is unavailable', () => {
  for (const deposit_status of ['AUTORISEE', 'A_VERIFIER']) {
    const reservation = { return_charges_editable: true, deposit_status }
    assert.equal(canEditManagerReturnCharges(reservation, undefined), true)
    assert.equal(canEditManagerReturnCharges(reservation, { ...pending, deposit_status }), true)
    assert.equal(canEditManagerReturnCharges({ ...reservation, return_charges_editable: false }, pending), false)
  }
  for (const deposit_status of ['LIBEREE', 'CAPTUREE', 'EXPIREE']) {
    assert.equal(canEditManagerReturnCharges({ return_charges_editable: true, deposit_status: 'A_VERIFIER' }, { ...pending, deposit_status }), false)
    assert.equal(canEditManagerReturnCharges({ return_charges_editable: false, deposit_status }), false)
  }
})

test('saves the four confirmed charges before settlement and completion', async () => {
  const actions = closureActions(pending)
  assert.equal(await closeManagerReturn(pending, payload, actions), closed.reservation)
  assert.deepEqual(actions.calls, ['read', ['save', payload], ['settle', { ...payload, deposit_id: 12, deposit_amount: '350.00' }], 'complete'])
})

test('continues with completion only after the deposit has been settled', async () => {
  for (const [deposit_status, captured_amount, released_amount] of [
    ['CAPTUREE', '25.00', '325.00'],
    ['LIBEREE', '0.00', '350.00'],
  ]) {
    const settled = { ...pending, deposit_status, captured_amount, released_amount }
    const actions = closureActions(settled)
    await closeManagerReturn(settled, payload, actions)
    assert.deepEqual(actions.calls, ['read', 'complete'])
  }
})

test('requires a new confirmation when the deposit changes', async () => {
  const actions = closureActions({ ...pending, deposit_id: 13 })
  await assert.rejects(closeManagerReturn(pending, payload, actions), /confirmez à nouveau/)
  assert.deepEqual(actions.calls, ['read'])
})

test('stops on settlement failure and treats a missing invoice as unverified', async () => {
  const actions = closureActions(pending)
  const failure = new Error('Stripe unavailable')
  actions.settle = async () => { throw failure }
  await assert.rejects(closeManagerReturn(pending, payload, actions), { cause: failure })
  assert.deepEqual(actions.calls, ['read', ['save', payload]])

  actions.settle = async () => {}
  actions.complete = async () => ({ reservation: { status: 'TERMINEE', invoice_pdf_available: false } })
  await assert.rejects(closeManagerReturn(pending, payload, actions), /facture restent à vérifier/)
})
