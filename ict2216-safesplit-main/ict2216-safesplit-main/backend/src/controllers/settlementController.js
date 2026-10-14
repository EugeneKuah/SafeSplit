const { requireAuth } = require('./authController');
const {
  recordSettlement,
  confirmSettlement,
  getSettlements,
  writeOffSettlement,
} = require('../services/settlementService');

// Maps internal error codes to HTTP status + a safe, generic message.
// NFR-8: never leak stack traces, DB errors, or internals to the client.
const ERROR_STATUS = {
  NOT_GROUP_MEMBER: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_SETTLEMENT: 400,
  INVALID_AMOUNT: 400,
  NO_BALANCE: 400,
  AMOUNT_EXCEEDS_BALANCE: 400,
  INVALID_STATE: 409,
};

function registerSettlementRoutes(app) {
  // POST /api/settlements
  // SR-15: recording a settlement is a sensitive action. requireAuth here
  // checks session validity; if your auth layer supports step-up
  // re-authentication (e.g. password re-entry token), gate this route with
  // that middleware too before this reaches the handler.
  app.post('/api/settlements', requireAuth, async (req, res) => {
    try {
      const { groupId, payeeId, amount, currency } = req.body;

      if (!groupId || !payeeId || amount === undefined) {
        return res.status(400).json({ error: 'groupId, payeeId, and amount are required' });
      }

      const settlement = await recordSettlement(req.user.id, {
        groupId,
        payeeId,
        amount,
        currency,
      });

      return res.status(201).json(settlement);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;

      // Only the curated error.message for known error codes is ever sent
      // to the client; unknown errors get a generic message (NFR-8).
      const message = ERROR_STATUS[err.code] ? err.message : 'Unable to record settlement';

      if (status === 500) console.error(err);

      return res.status(status).json({ error: message });
    }
  });

  // POST /api/settlements/:id/confirm
  // Only the payee may call this — enforced in the service layer, not just
  // by hiding the button in the UI.
  app.post('/api/settlements/:id/confirm', requireAuth, async (req, res) => {
    try {
      const result = await confirmSettlement(req.user.id, req.params.id);
      return res.json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      const message = ERROR_STATUS[err.code] ? err.message : 'Unable to confirm settlement';

      if (status === 500) console.error(err);

      return res.status(status).json({ error: message });
    }
  });

  // GET /api/settlements — history, scoped to the authenticated user
  app.get('/api/settlements', requireAuth, async (req, res) => {
    try {
      const settlements = await getSettlements(req.user.id);
      return res.json(settlements);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Unable to load settlements' });
    }
  });

  app.post('/api/settlements/writeoff', requireAuth, async (req, res) => {
    try {
      const { groupId, payerId, amount } = req.body;
      if (!groupId || !payerId || amount === undefined) {
        return res.status(400).json({ error: 'groupId, payerId, and amount are required' });
      }
      const result = await writeOffSettlement(req.user.id, { groupId, payerId, amount });
      return res.status(201).json(result);
    } catch (err) {
      const status = ERROR_STATUS[err.code] || 500;
      const message = ERROR_STATUS[err.code] ? err.message : 'Unable to write off settlement';
      if (status === 500) console.error(err);
      return res.status(status).json({ error: message });
    }
  });
}

module.exports = {
  registerSettlementRoutes,
};