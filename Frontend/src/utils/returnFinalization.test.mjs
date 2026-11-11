import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finalizeReturnAndRead, isReturnCompleted } from './returnFinalization.ts'

const completed = {
  status: 'A_CONTROLER',
  return_inspection: { status: 'TERMINE', return_access_secured: true },
}
const pending = {
  status: 'EN_COURS',
  return_inspection: { status: 'EN_COURS', return_access_secured: false },
}

test('reads the server after a successful lock', async () => {
  const calls = []
  const result = await finalizeReturnAndRead(
    async () => { calls.push('lock') },
    async () => { calls.push('read'); return completed },
  )
  assert.deepEqual(calls, ['lock', 'read'])
  assert.equal(result.kind, 'verified')
  assert.equal(isReturnCompleted(result.reservation), true)
})

test('recognizes a successful return despite a lost lock response', async () => {
  const lostResponse = new Error('network error')
  const result = await finalizeReturnAndRead(
    async () => { throw lostResponse },
    async () => completed,
  )
  assert.equal(result.kind, 'verified')
  assert.equal(result.submissionError, lostResponse)
  assert.equal(isReturnCompleted(result.reservation), true)
})

test('does not infer success from a lock response or stale incomplete data', async () => {
  const result = await finalizeReturnAndRead(async () => {}, async () => pending)
  assert.equal(result.kind, 'verified')
  assert.equal(isReturnCompleted(result.reservation), false)
  assert.equal(isReturnCompleted({ ...completed, return_inspection: { ...completed.return_inspection, return_access_secured: false } }), false)
})

test('reports verification failure rather than reusing a cached reservation', async () => {
  const failure = new Error('read failed')
  const result = await finalizeReturnAndRead(async () => {}, async () => { throw failure })
  assert.equal(result.kind, 'unverified')
  assert.equal(result.verificationError, failure)
})
