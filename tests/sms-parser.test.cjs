const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../mobile-app/src/lib/sms-parser.ts');
const moduleObject = { exports: {} };
new vm.Script(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { filename }).runInNewContext({
  module: moduleObject, exports: moduleObject.exports,
  require(name) { throw new Error(`SMS parsing must not use network/native dependencies: ${name}`); },
});
const { parseSmsTransaction, smsFingerprint } = moduleObject.exports;
const timestamp = Date.parse('2026-10-17T20:00:00Z');
function sms(body, overrides = {}) { return { _id: '42', address: 'VM-HDFCBK-S', date: timestamp, body, ...overrides }; }

test('UPI debit selects the transaction amount rather than an available balance', () => {
  const parsed = parseSmsTransaction(sms('HDFC A/c XX1234 debited INR 1,234.50 to AMAZON on 17-10-2026. UPI Ref No 629112345678. Avl Bal INR 50,000.00'));
  assert.equal(parsed.type, 'EXPENSE');
  assert.equal(parsed.amount, 1234.5);
  assert.equal(parsed.amountPaise, 123450);
  assert.equal(parsed.source, 'UPI');
  assert.equal(parsed.merchant, 'AMAZON');
  assert.equal(parsed.reference, '629112345678');
  assert.equal(parsed.account, 'XX1234');
  assert.equal(parsed.bank, 'HDFC');
  assert.equal(parsed.id, '42');
  assert.equal(parsed.date, '2026-10-18', 'received timestamp is shown in the India calendar day');
  assert.equal(parsed.rawDateMillis, timestamp);
});

test('common Indian debit and credit formats retain exact paise', async t => {
  for (const [body, amountPaise, type, source] of [
    ['ICICI card XX9876 spent \u20b9 1,23,456.78 at FLIPKART on 18-10-2026', 12345678, 'EXPENSE', 'Card'],
    ['SBI account XX4567 credited Rs. 2500.00 via NEFT Ref ABC123456', 250000, 'INCOME', 'Transfer'],
    ['Your a/c XX1234 received INR 400.50 via UPI Ref 123456789012', 40050, 'INCOME', 'UPI'],
    ['HDFC Rs 50.00 refunded to account XX1234 Ref 123456789013', 5000, 'INCOME', 'Bank'],
    ['Rs. 1000 withdrawn at ATM in CHENNAI from A/c XX1234', 100000, 'EXPENSE', 'ATM'],
    ['Your card XX1234 transaction of INR 150.25 at CAFE was successful', 15025, 'EXPENSE', 'Card'],
    ['500.50 has been debited from A/c XX1234', 50050, 'EXPENSE', 'Bank'],
    ['HDFC A/c XX1234 debited INR 0.10 to Shop via UPI', 10, 'EXPENSE', 'UPI'],
  ]) {
    await t.test(body, () => {
      const parsed = parseSmsTransaction(sms(body));
      assert.ok(parsed);
      assert.equal(parsed.amountPaise, amountPaise);
      assert.equal(parsed.type, type);
      assert.equal(parsed.source, source);
    });
  }
});

test('OTP, balance-only, promotions, future requests, and failed/reversed transactions are not imported', async t => {
  for (const body of [
    'OTP 123456 for card transaction INR 500.00 is valid for 10 minutes.',
    '123456 is your OTP for payment of Rs 1200.00.',
    'One-time password for INR 500 card purchase is 123456.',
    'Your available balance is Rs 5000.00. Debit card limit Rs 10000.',
    'Spend Rs 5000 and get cashback up to Rs 500. Offer valid today.',
    'Your account will be debited INR 1500 tomorrow.',
    'You received a payment request for INR 1500 via UPI.',
    'UPI transaction of INR 1500 failed. Account not debited.',
    'Rs 500 debited transaction reversed. Balance restored.',
    'Card payment of INR 500 declined.',
    'Reminder: payment due INR 5000 for credit card.',
    'Transaction reference 12345678; available balance INR 5000.',
  ]) await t.test(body, () => assert.equal(parseSmsTransaction(sms(body)), null));
});

test('invalid, excessive, or malformed amounts and timestamps fail safely', async t => {
  for (const message of [
    sms('Account debited INR 1,2,3.00'), sms('Account debited INR 100.123'),
    sms('Account debited INR 0.00'), sms('Account debited INR 100000001.00'),
    sms('Account debited INR 50', { date: 'not-a-date' }), sms('Account debited INR 50', { date: -1 }),
    sms('Account debited INR 50', { truncated: true }), sms('Account debited INR 50' + 'x'.repeat(33000)),
    sms('', {}), sms(null),
  ]) await t.test(String(message.body).slice(0, 45), () => assert.equal(parseSmsTransaction(message), null));
});

test('reference-based fingerprints ignore rescan IDs and redelivery time but distinguish genuine transactions', () => {
  const body = 'HDFC A/c XX1234 debited INR 500 to SHOP via UPI Ref 123456789012';
  const first = parseSmsTransaction(sms(body));
  const redelivered = parseSmsTransaction(sms(body, { _id: '100', date: timestamp + 60_000, address: 'AX-HDFCBK-P' }));
  assert.equal(first.fingerprint, redelivered.fingerprint);
  assert.notEqual(first.id, redelivered.id, 'native inbox IDs are not the deduplication identity');
  for (const changed of [
    body.replace('123456789012', '123456789013'), body.replace('XX1234', 'XX5678'),
    body.replace('INR 500', 'INR 600'), body.replace('debited', 'credited'),
  ]) assert.notEqual(parseSmsTransaction(sms(changed)).fingerprint, first.fingerprint);
  assert.equal(smsFingerprint(sms(body)), first.fingerprint);
});

test('messages without a reference do not merge distinct same-amount transactions on the same day', () => {
  const body = 'HDFC A/c XX1234 debited INR 500 to SHOP via UPI';
  const first = parseSmsTransaction(sms(body));
  assert.notEqual(parseSmsTransaction(sms(body, { date: timestamp + 1000 })).fingerprint, first.fingerprint);
  assert.notEqual(parseSmsTransaction(sms(body.replace('SHOP', 'OTHER SHOP'))).fingerprint, first.fingerprint);
  assert.equal(parseSmsTransaction(sms(body.replace(/ /g, '  '))).fingerprint, first.fingerprint);
  const noInboxId = parseSmsTransaction(sms(body, { _id: undefined }));
  assert.equal(noInboxId.id, first.fingerprint, 'missing native IDs have a deterministic fallback');
});

test('opaque fingerprints match standard SHA-256 for the documented canonical identity', () => {
  const message = sms('HDFC account XX1234 paid INR 50 to Caf\u00e9 \u{1f600} via UPI');
  const canonical = JSON.stringify(['message-v1', 'HDFCBK', String(timestamp), message.body.normalize('NFKC')]);
  const expected = 'sms-v1:' + crypto.createHash('sha256').update(canonical).digest('hex');
  assert.equal(smsFingerprint(message), expected);
  assert.match(expected, /^sms-v1:[a-f0-9]{64}$/);
  assert.ok(!expected.includes('1234'));
});
