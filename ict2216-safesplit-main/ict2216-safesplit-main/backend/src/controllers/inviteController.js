const { requireAuth } = require('../middleware/authMiddleware');
const { createInvite, getPendingInvites, acceptInvite, declineInvite } = require('../services/inviteService');

function registerInviteRoutes(app) {
  // GET /api/invites/pending — what the logged-in user needs to act on
  app.get('/api/invites/pending', requireAuth, async (req, res) => {
    try {
      const invites = await getPendingInvites(req.user.id);
      return res.json({ invites });
    } catch (err) {
      return res.status(500).json({ error: 'Unable to load invites' });
    }
  });

  // POST /api/invites/:id/accept
  app.post('/api/invites/:id/accept', requireAuth, async (req, res) => {
    try {
      const { groupId } = await acceptInvite({ inviteId: req.params.id, userId: req.user.id, req });
      return res.json({ message: 'Invite accepted', groupId });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Unable to accept invite' });
    }
  });

  // POST /api/invites/:id/decline
  app.post('/api/invites/:id/decline', requireAuth, async (req, res) => {
    try {
      await declineInvite({ inviteId: req.params.id, userId: req.user.id, req });
      return res.json({ message: 'Invite declined' });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Unable to decline invite' });
    }
  });
}

module.exports = { registerInviteRoutes };