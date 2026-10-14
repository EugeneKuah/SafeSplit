const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const expenseService = require('../services/expenseService');
const groupService = require('../services/groupService');
const currencyService = require('../services/currencyService');
const { createAuditLog } = require('../services/auditService');

const splitEntrySchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().nonnegative()
});

const expenseBodySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().trim().max(2000).optional(),
  amount: z.number().positive().max(9999999.99),
  currency: z.string().refine(currencyService.isSupportedCurrency, 'Unsupported currency'),
  paidBy: z.string().uuid().optional(),
  splitMethod: z.enum(['equal', 'custom']),
  splits: z.array(splitEntrySchema).optional(),
  expenseDate: z.string().date().optional()
});

function handleServiceError(err, res, fallbackMessage) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(fallbackMessage, err);
  return res.status(500).json({ error: fallbackMessage });
}

function registerExpenseRoutes(app) {
  // GET /api/expenses — the global "every expense across every group I'm
  // in" list the Expenses page is built around. ?groupId= and ?search=
  // narrow it down; both are optional.
  app.get('/api/expenses', requireAuth, async (req, res) => {
    try {
      const { groupId, search } = req.query;
      const expenses = await expenseService.listExpensesForUser(req.user.id, { groupId, search });
      return res.json({ expenses });
    } catch (err) {
      return handleServiceError(err, res, 'Unable to load expenses');
    }
  });

  // Live FX lookup used both for the inline "≈ X SGD" preview while
  // someone fills in the Add Expense form, and for the page-level
  // "show totals in ___" display-currency selector.
  app.get('/api/currency/rate', requireAuth, async (req, res) => {
    const { from, to } = req.query;
    if (!currencyService.isSupportedCurrency(from) || !currencyService.isSupportedCurrency(to)) {
      return res.status(400).json({ error: 'Unsupported currency' });
    }
    const amt = req.query.amount ? Number(req.query.amount) : 1;
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).json({ error: 'amount must be a non-negative number' });
    }
    try {
      const rate = await currencyService.getRate(from, to);
      return res.json({ from, to, rate, amount: amt, converted: currencyService.round2(amt * rate) });
    } catch (err) {
      return handleServiceError(err, res, 'Unable to fetch exchange rate');
    }
  });

  app.post('/api/groups/:groupId/expenses', requireAuth, validate(expenseBodySchema), async (req, res) => {
    const { groupId } = req.params;
    const body = req.validatedBody;

    if (body.splitMethod === 'custom' && !body.splits) {
      return res.status(400).json({ error: 'Custom split requires a splits array' });
    }

    try {
      const member = await groupService.isMember(groupId, req.user.id);
      if (!member) return res.status(403).json({ error: 'You are not a member of this group' });

      const expenseId = await expenseService.createExpense({
        groupId,
        creatorId: req.user.id,
        title: body.title,
        description: body.description,
        amount: body.amount,
        currency: body.currency,
        paidBy: body.paidBy,
        splitMethod: body.splitMethod,
        splits: body.splits,
        expenseDate: body.expenseDate
      });

      await createAuditLog({
        userId: req.user.id, req, actionType: 'CREATE_EXPENSE',
        affectedResource: 'expenses', resourceId: expenseId, outcome: 'success'
      });

      const expense = await expenseService.getExpenseForUser(expenseId, req.user.id);
      return res.status(201).json({ expense });
    } catch (err) {
      await createAuditLog({
        userId: req.user.id, req, actionType: 'CREATE_EXPENSE',
        affectedResource: 'expenses', outcome: 'failure'
      });
      return handleServiceError(err, res, 'Unable to create expense');
    }
  });

  app.put('/api/expenses/:id', requireAuth, validate(expenseBodySchema), async (req, res) => {
    const body = req.validatedBody;
    if (body.splitMethod === 'custom' && !body.splits) {
      return res.status(400).json({ error: 'Custom split requires a splits array' });
    }

    try {
      await expenseService.updateExpense({
        expenseId: req.params.id,
        requesterId: req.user.id,
        title: body.title,
        description: body.description,
        amount: body.amount,
        currency: body.currency,
        splitMethod: body.splitMethod,
        splits: body.splits,
        expenseDate: body.expenseDate
      });

      await createAuditLog({
        userId: req.user.id, req, actionType: 'UPDATE_EXPENSE',
        affectedResource: 'expenses', resourceId: req.params.id, outcome: 'success'
      });

      const expense = await expenseService.getExpenseForUser(req.params.id, req.user.id);
      return res.json({ expense });
    } catch (err) {
      await createAuditLog({
        userId: req.user.id, req, actionType: 'UPDATE_EXPENSE',
        affectedResource: 'expenses', resourceId: req.params.id, outcome: 'failure'
      });
      return handleServiceError(err, res, 'Unable to update expense');
    }
  });

  app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
      await expenseService.deleteExpense({ expenseId: req.params.id, requesterId: req.user.id });

      await createAuditLog({
        userId: req.user.id, req, actionType: 'DELETE_EXPENSE',
        affectedResource: 'expenses', resourceId: req.params.id, outcome: 'success'
      });

      return res.json({ message: 'Expense deleted' });
    } catch (err) {
      await createAuditLog({
        userId: req.user.id, req, actionType: 'DELETE_EXPENSE',
        affectedResource: 'expenses', resourceId: req.params.id, outcome: 'failure'
      });
      return handleServiceError(err, res, 'Unable to delete expense');
    }
  });
}

module.exports = { registerExpenseRoutes };
