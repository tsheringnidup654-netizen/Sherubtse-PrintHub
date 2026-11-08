const router = require('express').Router();
const { wrapAll } = require('../utils/asyncHandler');
const pub = wrapAll(require('../controllers/publicController'));
const auth = wrapAll(require('../controllers/authController'));
const { forceGuest, redirectIfAuth, requireLogin } = require('../middleware/auth');

router.get('/', forceGuest, pub.home);
router.get('/about', pub.about);
router.get('/services', pub.services);
router.get('/contact', pub.showContact);
router.post('/contact', pub.contact);
router.get('/api/price', pub.price);

router.get('/login', forceGuest, auth.showLogin);
router.post('/login', redirectIfAuth, auth.login);
router.get('/register', forceGuest, auth.showRegister);
router.post('/register', redirectIfAuth, auth.register);
router.post('/logout', requireLogin, auth.logout);

module.exports = router;
