// @ts-nocheck - Node test file (run with: node --test lib/helpbot.test.ts), not part of the app build.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { matchTopicId, formatBillAnswer, formatPlanAnswer } from './helpbot.ts'

const TOPICS = [
  { id: 'gcash', keywords: ['gcash', 'how to pay', 'pay', 'qr'] },
  { id: 'verify', keywords: ['verify', 'verified', 'verification', 'status'] },
  { id: 'plans', keywords: ['plan', 'plans', 'price', 'how much'] },
  { id: 'repair', keywords: ['no internet', 'slow', 'internet', 'broken', 'repair'] },
  { id: 'human', keywords: ['human', 'staff', 'talk'] },
]

test('matches an exact english question', () => {
  assert.equal(matchTopicId('how do I pay with gcash', TOPICS), 'gcash')
})

test('matches a Bisaya phrasing via synonyms', () => {
  assert.equal(matchTopicId('wala koy internet', TOPICS), 'repair')
})

test('matches despite a one-character typo', () => {
  assert.equal(matchTopicId('verfy my payment', TOPICS), 'verify')
})

test('matches a Bisaya price question', () => {
  assert.equal(matchTopicId('pila ang plan', TOPICS), 'plans')
})

test('returns null when nothing is relevant', () => {
  assert.equal(matchTopicId('what is the weather today', TOPICS), null)
})

test('bill answer shows real balance and due date', () => {
  const out = formatBillAnswer({ planName: '1500', balance: 1500, dueLabel: 'Nov 30', disconnect: false })
  assert.match(out, /1,500/)
  assert.match(out, /Nov 30/)
})

test('bill answer warns when flagged for disconnection', () => {
  const out = formatBillAnswer({ planName: '1500', balance: 1500, dueLabel: null, disconnect: true })
  assert.match(out, /disconnection/)
})

test('bill answer is reassuring when nothing is owed', () => {
  const out = formatBillAnswer({ planName: '1500', balance: 0, dueLabel: null, disconnect: false })
  assert.match(out, /no outstanding balance/)
})

test('plan answer names the current plan', () => {
  const out = formatPlanAnswer({ planName: '2000', balance: 0, dueLabel: null, disconnect: false })
  assert.match(out, /2000 plan/)
})

test('plan answer handles no plan set', () => {
  const out = formatPlanAnswer({ planName: null, balance: 0, dueLabel: null, disconnect: false })
  assert.match(out, /don’t have a plan/)
})
