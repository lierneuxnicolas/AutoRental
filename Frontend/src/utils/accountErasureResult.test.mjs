import assert from 'node:assert/strict'
import test from 'node:test'
import { accountErasureErrorMessage, accountErasureOutcome } from './accountErasureResult.ts'

test('confirms only a completed erasure', () => {
  const result = { httpStatus: 200, status: 'CLOSED', processing_status: 'COMPLETED' }
  assert.equal(accountErasureOutcome(result).completed, true)
  assert.equal(accountErasureOutcome({ ...result, httpStatus: 202 }).completed, false)
  assert.equal(accountErasureOutcome({ ...result, processing_status: 'FAILED' }).completed, false)
  assert.equal(accountErasureOutcome({ httpStatus: 200 }).completed, false)
})

test('keeps the reason for repeated deferred requests', () => {
  const result = { httpStatus: 202, status: 'PENDING', processing_status: 'PENDING', reason_detail: 'Caution active.' }
  const first = accountErasureOutcome(result)
  assert.equal(first.completed, false)
  assert.match(first.message, /Caution active/)
  assert.deepEqual(accountErasureOutcome(result), first)
})

test('distinguishes a closed account from pending file cleanup', () => {
  const result = { httpStatus: 202, status: 'CLOSED', processing_status: 'FAILED', detail: 'Effacement incomplet.' }
  assert.deepEqual(accountErasureOutcome(result), { completed: false, message: result.detail })
})

test('shows specific HTTP, database and timeout messages', () => {
  assert.match(accountErasureErrorMessage(400), /mot de passe/)
  assert.match(accountErasureErrorMessage(401), /session a expiré/)
  assert.match(accountErasureErrorMessage(403), /ne permet pas/)
  assert.match(accountErasureErrorMessage(404), /indisponible sur ce serveur/)
  assert.match(accountErasureErrorMessage(429), /Trop de tentatives/)
  assert.equal(accountErasureErrorMessage(503, 'Clôture indisponible.'), 'Clôture indisponible.')
  assert.match(accountErasureErrorMessage(undefined, undefined, 'ECONNABORTED'), /résultat.*inconnu/)
})
