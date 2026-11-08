const router = require('express').Router();
const { wrapAll } = require('../utils/asyncHandler');
const pub = wrapAll(require('../controllers/publicController'));
const auth = wrapAll(require('../controllers/authController'));
const { redirectIfAuth, requireLogin } = require('../middleware/auth');

router.get('/', pub.home);
router.get('/about', pub.about);
router.get('/services', pub.services);
router.get('/contact', pub.showContact);
router.post('/contact', pub.contact);
router.get('/api/price', pub.price);

router.get('/login', redirectIfAuth, auth.showLogin);
router.post('/login', redirectIfAuth, auth.login);
router.get('/register', redirectIfAuth, auth.showRegister);
router.post('/register', redirectIfAuth, auth.register);
router.post('/logout', requireLogin, auth.logout);

module.exports = router;
