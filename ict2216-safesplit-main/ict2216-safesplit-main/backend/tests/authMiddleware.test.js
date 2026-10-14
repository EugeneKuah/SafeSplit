const { test } = require('node:test');
const assert = require('node:assert');
const { requireAdmin } = require('../src/middleware/authMiddleware');

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

test('requireAdmin rejects request with no user', () => {
  const req = {};
  const res = mockResponse();
  let nextCalled = false;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.jsonBody.error, 'Authentication required');
});

test('requireAdmin rejects non-admin user', () => {
  const req = {
    user: {
      id: 1,
      role: 'user'
    }
  };
  const res = mockResponse();
  let nextCalled = false;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.jsonBody.error, 'Admin privileges required');
});

test('requireAdmin allows admin user', () => {
  const req = {
    user: {
      id: 1,
      role: 'admin'
    }
  };
  const res = mockResponse();
  let nextCalled = false;

  requireAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, null);
  assert.strictEqual(res.jsonBody, null);
});