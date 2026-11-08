const router = require('express').Router();
const { wrapAll } = require('../utils/asyncHandler');
const { requireStudent } = require('../middleware/auth');
const { documentUpload, avatarUpload } = require('../middleware/upload');
const { verify } = require('../middleware/csrf');
const student = wrapAll(require('../controllers/studentController'));
const docs = wrapAll(require('../controllers/documentController'));
const orders = wrapAll(require('../controllers/orderController'));
const pub = wrapAll(require('../controllers/publicController'));

router.use(requireStudent);

router.get('/dashboard', student.dashboard);

// profile
router.get('/profile', student.showProfile);
router.post('/profile', student.updateProfile);
router.post('/profile/avatar', avatarUpload, verify, student.updateAvatar); // multipart: multer first, then CSRF check
router.post('/profile/password', student.changePassword);

// documents
router.get('/documents', docs.library);
router.post('/documents', documentUpload, verify, docs.upload);
router.post('/documents/:id/pages', docs.setPages);
router.post('/documents/:id/delete', docs.remove);
router.get('/documents/:id/file', docs.file);

// customise, cart, checkout
router.get('/services', (req, res) => res.redirect('/services'));
router.get('/customize', orders.customize);
router.post('/cart', orders.addToCart);
router.get('/cart', orders.cart);
router.post('/cart/:id/remove', orders.removeFromCart);
router.get('/checkout', orders.checkout);
router.post('/checkout', orders.placeOrder);

// orders
router.get('/orders', orders.list);
router.get('/orders/:id', orders.detail);
router.post('/orders/:id/cancel', orders.cancel);
router.get('/orders/:id/qr', orders.qr);
router.get('/orders/:id/receipt', orders.receipt);

// notifications, history, feedback
router.get('/notifications', student.notifications);
router.post('/notifications/read-all', student.readAll);
router.post('/notifications/:id/read', student.readNotification);
router.get('/api/unread', student.unreadCount);
router.get('/history', student.history);
router.get('/feedback', student.showFeedback);
router.post('/feedback', student.submitFeedback);

module.exports = router;
