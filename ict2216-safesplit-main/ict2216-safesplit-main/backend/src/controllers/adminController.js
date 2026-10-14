const { z } = require('zod');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { listUsers, setUserSuspended, listAuditLogs } = require('../services/adminService');
const { createAuditLog } = require('../services/auditService');

const suspendSchema = z.object({
  is_suspended: z.boolean()
});

const userIdSchema = z.string().uuid('Invalid user id');

function registerAdminRoutes(app) {
  app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await listUsers();
      return res.json({ users });
    } catch (err) {
      return res.status(500).json({ error: 'Unable to load users' });
    }
  });

  app.patch('/api/admin/users/:id/suspend', requireAuth, requireAdmin, validate(suspendSchema), async (req, res) => {
    const parsed = userIdSchema.safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid user id' });
    const { is_suspended } = req.validatedBody;

    try {
      const updated = await setUserSuspended({
        targetId: parsed.data,
        suspended: is_suspended,
        adminId: req.user.id
      });
      await createAuditLog({
        userId: req.user.id, req,
        actionType: is_suspended ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
        affectedResource: 'users', outcome: 'success'
      });
      return res.json({ user: updated });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      await createAuditLog({
        userId: req.user.id, req,
        actionType: is_suspended ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
        affectedResource: 'users', outcome: 'failure'
      });
      return res.status(500).json({ error: 'Unable to update user' });
    }
  });

    app.get('/api/admin/audit-logs', requireAuth, requireAdmin, async (req, res) => {
    const { limit, userId, actionType, from, to } = req.query;
    try {
      const logs = await listAuditLogs({
        limit,
        userId:     userId     || null,
        actionType: actionType || null,
        from:       from       || null,
        to:         to         || null,
      });
      return res.json({ logs });
    } catch (err) {
      return res.status(500).json({ error: 'Unable to load audit logs' });
    }
  });
}
module.exports = { registerAdminRoutes };