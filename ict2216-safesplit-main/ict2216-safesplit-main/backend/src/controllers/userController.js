const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const { getProfile, updateProfile, changePassword , deleteAccount} = require('../services/userService');

// Same shape as authController's authLimiter — these endpoints mutate the
// account itself (email, password), so they get the stricter limit rather
// than the general 100/15min applied app-wide.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many account changes. Please try again later.' }
});

// Mirrors authController's registerSchema fields exactly, so a username
// or email that was rejected at registration can't somehow slip through
// on a later profile edit.
const updateProfileSchema = z.object({
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores'),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase())
});

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128)
});


const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password is too long')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number')
    .regex(/[^A-Za-z0-9]/, 'Password must include a symbol')
});

function registerUserRoutes(app) {
  // View — backs the "view your details" half of the profile page.
  app.get('/api/users/me', requireAuth, async (req, res) => {
    try {
      const profile = await getProfile(req.user.id);
      return res.json({ user: profile });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Unable to load profile' });
    }
  });

  // Edit & save — username/email only. Changing email resets verification
  // (see UserService.UpdateProfile for why) so the response message
  // differs in that case.
  app.patch('/api/users/me', accountLimiter, requireAuth, validate(updateProfileSchema), async (req, res) => {
    const { username, email } = req.validatedBody;
    try {
      const { profile, emailChanged } = await updateProfile({ userId: req.user.id, username, email, req });
      return res.json({
        message: emailChanged
          ? 'Profile updated. Check your new email address for a verification link.'
          : 'Profile updated successfully',
        user: profile
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Unable to update profile' });
    }
  });

  // Change password — kept separate from the profile PATCH above so a
  // stolen/expired form can't accidentally resubmit a password change,
  // and so it can carry its own current-password check.
  app.patch('/api/users/me/password', accountLimiter, requireAuth, validate(changePasswordSchema), async (req, res) => {
    const { currentPassword, newPassword } = req.validatedBody;
    try {
      await changePassword({
        userId: req.user.id,
        currentPassword,
        newPassword,
        currentSessionJti: req.sessionJti,
        req
      });
      return res.json({ message: 'Password updated successfully' });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Unable to update password' });
    }
  });

  app.delete('/api/users/me', accountLimiter, requireAuth, validate(deleteAccountSchema), async (req, res) => {
    const { password } = req.validatedBody;
    try {
      await deleteAccount({ userId: req.user.id, password, currentSessionJti: req.sessionJti, req });
      res.clearCookie('session', { httpOnly: true, sameSite: 'strict', path: '/' });
      return res.json({ message: 'Account deleted' });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Unable to delete account' });
    }
  });
}

module.exports = { registerUserRoutes };
