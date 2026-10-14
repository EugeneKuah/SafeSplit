const { test } = require('node:test');
const assert = require('node:assert');
const { round2, isSupportedCurrency, SUPPORTED_CURRENCIES } = require('../src/services/currencyService');

test('round2 rounds to 2 decimal places', () => {
  assert.strictEqual(round2(10.005), 10.01);
  assert.strictEqual(round2(10.004), 10);
  assert.strictEqual(round2(10), 10);
});

test('round2 handles floating point edge cases', () => {
  assert.strictEqual(round2(0.1 + 0.2), 0.3);
});

test('isSupportedCurrency accepts valid currency codes', () => {
  assert.strictEqual(isSupportedCurrency('SGD'), true);
  assert.strictEqual(isSupportedCurrency('USD'), true);
  assert.strictEqual(isSupportedCurrency('sgd'), true); // case-insensitive
});

test('isSupportedCurrency rejects invalid currency codes', () => {
  assert.strictEqual(isSupportedCurrency('XXX'), false);
  assert.strictEqual(isSupportedCurrency(''), false);
  assert.strictEqual(isSupportedCurrency(null), false);
  assert.strictEqual(isSupportedCurrency(123), false);
});

test('SUPPORTED_CURRENCIES contains expected structure', () => {
  assert.ok(Array.isArray(SUPPORTED_CURRENCIES));
  assert.ok(SUPPORTED_CURRENCIES.length > 0);
  const sgd = SUPPORTED_CURRENCIES.find(c => c.code === 'SGD');
  assert.ok(sgd);
  assert.strictEqual(sgd.name, 'Singapore Dollar');
});