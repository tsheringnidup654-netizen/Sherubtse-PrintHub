/**
 * Flash messages + variables available in every view.
 */
const C = require('../config/constants');
const { viewHelpers } = require('../utils/helpers');

module.exports = function locals(req, res, next) {
  req.flash = (type, message) => { req.session.flash = { type, message }; };
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  Object.assign(res.locals, viewHelpers, {
    APP_NAME: C.APP_NAME,
    TAGLINE: C.TAGLINE,
    currentPath: req.path,
    serverNow: Date.now(),
    pageCss: [],
    pageJs: [],
    errors: [],
    form: {},
    enforceCollegeEmail: process.env.ENFORCE_COLLEGE_EMAIL === 'true',
    collegeDomain: process.env.COLLEGE_EMAIL_DOMAIN || 'rub.edu.bt',
  });
  next();
};
