const groupsService = require('../services/groupsService')
const { createAuditLog } = require('../services/auditService')
const { requireAuth } = require('../controllers/authController')
const { createInvite } = require('../services/inviteService')

// GET /api/groups
const getGroups = async (req, res) => {
  try {
    const groups = await groupsService.getGroupsForUser(req.user.id)
    res.json({ groups })
  } catch (err) {
    console.error('getGroups error:', err)
    res.status(500).json({ error: 'Failed to load groups' })
  }
}

// POST /api/groups
const createGroup = async (req, res) => {
  const { name, base_currency, settle_currency } = req.body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' })
  }

  const CURRENCY_RE = /^[A-Z]{3}$/
  const resolvedBase   = base_currency   && CURRENCY_RE.test(base_currency)   ? base_currency   : 'SGD'
  const resolvedSettle = settle_currency && CURRENCY_RE.test(settle_currency) ? settle_currency : resolvedBase

  try {
    const group = await groupsService.createGroup({
      name: name.trim(),
      base_currency: resolvedBase,
      settle_currency: resolvedSettle,
      ownerId: req.user.id,
    })

    await createAuditLog({
      userId: req.user.id, req, actionType: 'CREATE_GROUP',
      affectedResource: 'groups', resourceId: group.id, outcome: 'success',
    })

    res.status(201).json({ group })
  } catch (err) {
    console.error('createGroup error:', err)
    await createAuditLog({
      userId: req.user.id, req, actionType: 'CREATE_GROUP',
      affectedResource: 'groups', outcome: 'failure',
    })
    res.status(500).json({ error: 'Failed to create group' })
  }
}

// GET /api/groups/:id
const getGroupById = async (req, res) => {
  try {
    const group = await groupsService.getGroupById(req.params.id, req.user.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    if (!group.my_role) return res.status(403).json({ error: 'You are not a member of this group' })  // ADD THIS LINE
    res.json({ group })
  } catch (err) {
    console.error('getGroupById error:', err)
    res.status(500).json({ error: 'Failed to load group' })
  }
}

// DELETE /api/groups/:id
const deleteGroup = async (req, res) => {
  try {
    const group = await groupsService.getGroupById(req.params.id, req.user.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    if (group.my_role !== 'owner') return res.status(403).json({ error: 'Only the owner can delete this group' })

    await groupsService.deleteGroup(req.params.id)

    await createAuditLog({
      userId: req.user.id, req, actionType: 'DELETE_GROUP',
      affectedResource: 'groups', resourceId: req.params.id, outcome: 'success',
    })

    res.json({ message: 'Group deleted' })
  } catch (err) {
    if (err.code === '23503') {
      await createAuditLog({
        userId: req.user.id, req, actionType: 'DELETE_GROUP',
        affectedResource: 'groups', resourceId: req.params.id, outcome: 'failure',
      })
      return res.status(409).json({ error: 'Cannot delete a group that has expenses or settlements. Remove them first or archive the group instead.' })
    }
    console.error('deleteGroup error:', err)
    res.status(500).json({ error: 'Failed to delete group' })
  }
}

// PATCH /api/groups/:id/archive
const archiveGroup = async (req, res) => {
  try {
    const group = await groupsService.getGroupById(req.params.id, req.user.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    if (group.my_role !== 'owner') return res.status(403).json({ error: 'Only the owner can archive this group' })
    if (!group.is_active) return res.status(409).json({ error: 'This group is already archived' })

    await groupsService.archiveGroup(req.params.id)

    await createAuditLog({
      userId: req.user.id, req, actionType: 'ARCHIVE_GROUP',
      affectedResource: 'groups', resourceId: req.params.id, outcome: 'success',
    })

    const updated = await groupsService.getGroupById(req.params.id, req.user.id)
    res.json({ group: updated })
  } catch (err) {
    console.error('archiveGroup error:', err)
    res.status(500).json({ error: 'Failed to archive group' })
  }
}

// PATCH /api/groups/:id/unarchive
const unarchiveGroup = async (req, res) => {
  try {
    const group = await groupsService.getGroupById(req.params.id, req.user.id)
    if (!group) return res.status(404).json({ error: 'Group not found' })
    if (group.my_role !== 'owner') return res.status(403).json({ error: 'Only the owner can reactivate this group' })
    if (group.is_active) return res.status(409).json({ error: 'This group is already active' })

    await groupsService.unarchiveGroup(req.params.id)

    await createAuditLog({
      userId: req.user.id, req, actionType: 'UNARCHIVE_GROUP',
      affectedResource: 'groups', resourceId: req.params.id, outcome: 'success',
    })

    const updated = await groupsService.getGroupById(req.params.id, req.user.id)
    res.json({ group: updated })
  } catch (err) {
    console.error('unarchiveGroup error:', err)
    res.status(500).json({ error: 'Failed to reactivate group' })
  }
}

// GET /api/groups/:id/members
const getMembers = async (req, res) => {
  try {
    const isMember = await groupsService.isMember(req.params.id, req.user.id)
    if (!isMember) return res.status(403).json({ error: 'You are not a member of this group' })

    const members = await groupsService.getMembers(req.params.id)
    res.json({ members })
  } catch (err) {
    console.error('getMembers error:', err)
    res.status(500).json({ error: 'Failed to load members' })
  }
}

// POST /api/groups/:id/members — invite a user by email
const addMember = async (req, res) => {
  const { email } = req.body

  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' })
  }

  try {
    const result = await createInvite({
      groupId: req.params.id,
      inviterId: req.user.id,
      inviteeEmail: email.trim(),
      req,
    })
    // 202 Accepted — the user has been invited but not yet added
    return res.status(202).json({
      message: `Invite sent to ${result.invitee.email}. They'll be added once they accept.`,
      invitee: result.invitee,
    })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error('addMember error:', err)
    return res.status(500).json({ error: 'Failed to send invite' })
  }
}

// DELETE /api/groups/:id/members/:userId
const removeMember = async (req, res) => {
  const { id: groupId, userId: targetUserId } = req.params

  try {
    await groupsService.removeMember({
      groupId,
      requesterId: req.user.id,
      targetUserId,
    })

    await createAuditLog({
      userId: req.user.id, req,
      actionType: req.user.id === targetUserId ? 'LEAVE_GROUP' : 'REMOVE_MEMBER',
      affectedResource: 'group_members',
      resourceId: groupId,
      outcome: 'success',
    })

    return res.json({
      message: req.user.id === targetUserId ? 'You have left the group' : 'Member removed',
    })
  } catch (err) {
    await createAuditLog({
      userId: req.user.id, req,
      actionType: req.user.id === targetUserId ? 'LEAVE_GROUP' : 'REMOVE_MEMBER',
      affectedResource: 'group_members',
      resourceId: groupId,
      outcome: 'failure',
    })
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error('removeMember error:', err)
    return res.status(500).json({ error: 'Failed to remove member' })
  }
}

const registerGroupsRoutes = (app) => {
  app.get('/api/groups',                requireAuth, getGroups)
  app.post('/api/groups',               requireAuth, createGroup)
  app.get('/api/groups/:id',            requireAuth, getGroupById)
  app.delete('/api/groups/:id',         requireAuth, deleteGroup)
  app.patch('/api/groups/:id/archive',  requireAuth, archiveGroup)
  app.patch('/api/groups/:id/unarchive', requireAuth, unarchiveGroup)
  app.get('/api/groups/:id/members',    requireAuth, getMembers)
  app.post('/api/groups/:id/members',   requireAuth, addMember)
  app.delete('/api/groups/:id/members/:userId', requireAuth, removeMember)
}

module.exports = { getGroups, createGroup, getGroupById, deleteGroup, archiveGroup, unarchiveGroup, getMembers, addMember, removeMember, registerGroupsRoutes }