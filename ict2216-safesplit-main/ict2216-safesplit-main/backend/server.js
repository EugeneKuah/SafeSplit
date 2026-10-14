const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { initDb } = require('./src/config/db');
const { registerAuthRoutes, requireAuth } = require('./src/controllers/authController');
const { registerUserRoutes } = require('./src/controllers/userController');
const { registerDashboardRoutes } = require('./src/controllers/dashboardController');
const { registerSettlementRoutes } = require('./src/controllers/settlementController');
const { registerGroupsRoutes } = require('./src/controllers/groupsController');
const { registerAdminRoutes } = require('./src/controllers/adminController');
const { registerExpenseRoutes } = require('./src/controllers/expensesController');
const { registerInviteRoutes } = require('./src/controllers/inviteController');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'no-referrer' }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Authentication responses must not be stored by browsers or shared caches.
app.use('/api/auth', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  return next();
});

app.use(morgan('combined', {
  skip: (req) => req.path.startsWith('/api/auth')
}));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
app.use(generalLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SafeSplit backend is running!', timestamp: new Date().toISOString() });
});

registerAuthRoutes(app);
registerUserRoutes(app);
registerDashboardRoutes(app);
registerSettlementRoutes(app);
registerGroupsRoutes(app);
registerAdminRoutes(app);
registerExpenseRoutes(app);
registerInviteRoutes(app);

app.get('/api/users', requireAuth, (req, res) => {
  res.json({ message: 'Authenticated users route', user: req.user });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error');
  res.status(500).json({ error: 'Internal server error' });
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`SafeSplit backend running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Database initialisation failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });