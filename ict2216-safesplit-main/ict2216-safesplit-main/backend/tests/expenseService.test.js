const { test } = require('node:test');
const assert = require('node:assert');
const {
  splitEqually,
  validateCustomSplits
} = require('../src/services/expenseService');

test('splitEqually splits amount equally between members', () => {
  const result = splitEqually(30, [1, 2, 3]);

  assert.deepStrictEqual(result, [
    { userId: 1, amountOwed: 10 },
    { userId: 2, amountOwed: 10 },
    { userId: 3, amountOwed: 10 }
  ]);
});

test('splitEqually handles cents remainder correctly', () => {
  const result = splitEqually(10, [1, 2, 3]);

  assert.deepStrictEqual(result, [
    { userId: 1, amountOwed: 3.34 },
    { userId: 2, amountOwed: 3.33 },
    { userId: 3, amountOwed: 3.33 }
  ]);
});

test('validateCustomSplits accepts valid custom split', () => {
  const result = validateCustomSplits(
    [
      { userId: 1, amount: 6 },
      { userId: 2, amount: 4 }
    ],
    [1, 2],
    10
  );

  assert.deepStrictEqual(result, [
    { userId: 1, amountOwed: 6 },
    { userId: 2, amountOwed: 4 }
  ]);
});

test('validateCustomSplits rejects split for non-group member', () => {
  assert.throws(
    () => validateCustomSplits(
      [
        { userId: 1, amount: 5 },
        { userId: 99, amount: 5 }
      ],
      [1, 2],
      10
    ),
    /not in this group/
  );
});

test('validateCustomSplits rejects totals that do not match expense amount', () => {
  assert.throws(
    () => validateCustomSplits(
      [
        { userId: 1, amount: 3 },
        { userId: 2, amount: 3 }
      ],
      [1, 2],
      10
    ),
    /don't add up/
  );
});