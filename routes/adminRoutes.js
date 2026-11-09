const router = require('express').Router();
const { wrapAll } = require('../utils/asyncHandler');
const { requireAdmin } = require('../middleware/auth');
const admin = wrapAll(require('../controllers/adminController'));
const shared = wrapAll(require('../controllers/studentController')); // notification handlers are role-aware

router.use(requireAdmin);

router.get('/dashboard', admin.dashboard);
router.get('/notifications', shared.notifications);
router.post('/notifications/read-all', shared.readAll);
router.post('/notifications/:id/read', shared.readNotification);
router.get('/api/unread', shared.unreadCount);
router.get('/api/dashboard-stats', admin.dashboardStats);

router.get('/students', admin.students);
router.post('/students/:id/toggle', admin.toggleStudent);

router.get('/services', admin.services);
router.post('/services', admin.saveService);
router.post('/services/settings', admin.saveSettings);
router.post('/services/:id', admin.saveService);
router.post('/services/:id/toggle', admin.toggleService);

router.get('/orders', admin.orders);
router.get('/orders/:id', admin.orderDetail);
router.get('/orders/:id/invoice', admin.invoice);
router.post('/orders/:id/status', admin.updateStatus);
router.post('/orders/:id/urgent', admin.decideUrgent);
router.post('/orders/:id/schedule', admin.schedule);

router.get('/documents', admin.documents);
router.get('/documents/:id/file', admin.documentFile);

router.get('/deadlines', admin.deadlines);

router.get('/payments', admin.payments);
router.post('/payments/methods', admin.savePaymentMethods);
router.post('/payments/:id', admin.updatePayment);

router.get('/feedback', admin.feedback);
router.post('/feedback/:id', admin.moderateFeedback);
router.post('/messages/:id/read', admin.readMessage);

router.get('/reports', admin.reports);
router.get('/reports/export.csv', admin.exportCsv);

router.get('/collect', admin.collectHome);
router.get('/collect/:token', admin.collectOrder);
router.post('/collect/:token', admin.collectConfirm);

module.exports = router;
