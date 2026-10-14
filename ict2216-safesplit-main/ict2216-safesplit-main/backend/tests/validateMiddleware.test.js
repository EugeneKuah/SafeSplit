const { test } = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');
const { validate } = require('../src/middleware/validate');

function mockResponse() {
  return {
    statusCode: null,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    }
  };
}

test('validate passes valid request body to next()', () => {
  const schema = z.object({
    name: z.string().min(1),
    amount: z.number().positive()
  });

  const req = {
    body: {
      name: 'Dinner',
      amount: 12.5
    }
  };

  const res = mockResponse();
  let nextCalled = false;

  validate(schema)(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.deepStrictEqual(req.validatedBody, {
    name: 'Dinner',
    amount: 12.5
  });
});

test('validate rejects invalid request body with 400', () => {
  const schema = z.object({
    name: z.string().min(1),
    amount: z.number().positive()
  });

  const req = {
    body: {
      name: '',
      amount: -5
    }
  };

  const res = mockResponse();
  let nextCalled = false;

  validate(schema)(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.jsonBody.error, 'Invalid request input');
  assert.ok(Array.isArray(res.jsonBody.details));
  assert.ok(res.jsonBody.details.length >= 1);
});

test('validate does not call next() when required field is missing', () => {
  const schema = z.object({
    email: z.string().email()
  });

  const req = {
    body: {}
  };

  const res = mockResponse();
  let nextCalled = false;

  validate(schema)(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.jsonBody.error, 'Invalid request input');
});