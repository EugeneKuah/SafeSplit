const { requireAuth } = require('./authController');
const { getDashboardData } = require('../services/dashboardService');

function registerDashboardRoutes(app) {
  app.get('/api/dashboard', requireAuth, async (req, res) => {
    try {
      const dashboard = await getDashboardData(req.user.id);

      return res.json(dashboard);
    } catch (err) {
      console.error(err);

      return res.status(500).json({
        error: 'Unable to load dashboard'
      });
    }
  });
}

module.exports = {
  registerDashboardRoutes
};