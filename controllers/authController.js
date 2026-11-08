
const bcrypt = require('bcrypt');
const User = require('../models/User');
const { isEmail, clean, strongPassword } = require('../utils/helpers');
const limiter = require('../utils/rateLimit');

const home = (u) =>
  u.role === 'admin' ? '/admin/dashboard' : '/student/dashboard';

exports.showLogin = (req, res) => {
  res.render('public/login', {
    title: 'Login',
    pageCss: ['auth'],
    form: {},
    errors: []
  });
};

exports.login = async (req, res, next) => {
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || '');
  const key = `${req.ip}|${email}`;

  const fail = (msg) => {
    return res.status(401).render('public/login', {
      title: 'Login',
      pageCss: ['auth'],
      errors: [msg],
      form: { email }
    });
  };

  try {
    if (limiter.tooMany(key)) {
      return fail(
        'Too many failed attempts. Please wait 15 minutes and try again.'
      );
    }

    if (!isEmail(email) || !password) {
      limiter.record(key);
      return fail('Incorrect e-mail or password.');
    }

    const user = await User.findByEmail(email);

    const ok =
      user &&
      user.password_hash &&
      await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      limiter.record(key);
      return fail('Incorrect e-mail or password.');
    }

    if (!user.is_active) {
      return fail(
        'This account has been deactivated. Please contact the print shop.'
      );
    }

    limiter.reset(key);

    const returnTo = req.session.returnTo;

    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.userId = user.id;

      req.flash(
        'success',
        `Welcome back, ${user.full_name.split(' ')[0]}!`
      );

      const area =
        user.role === 'admin' ? '/admin/' : '/student/';

      const destination =
        returnTo && returnTo.startsWith(area)
          ? returnTo
          : home(user);

      res.redirect(destination);
    });

  } catch (err) {
    next(err);
  }
};

exports.showRegister = (req, res) => {
  res.render('public/register', {
    title: 'Create account',
    pageCss: ['auth'],
    form: {}
  });
};

exports.register = async (req, res, next) => {
  try {
    const f = {
      full_name: clean(req.body.full_name, 120),
      student_id: clean(req.body.student_id, 20),
      email: clean(req.body.email, 160).toLowerCase(),
      phone: clean(req.body.phone, 20),
      programme: clean(req.body.programme, 120)
    };

    const errors = [];

    if (f.full_name.length < 3) {
      errors.push('Please enter your full name.');
    }

    if (!isEmail(f.email)) {
      errors.push('Please enter a valid e-mail address.');
    }

    const domain =
      process.env.COLLEGE_EMAIL_DOMAIN || 'rub.edu.bt';

    if (
      process.env.ENFORCE_COLLEGE_EMAIL === 'true' &&
      !f.email.endsWith(`@${domain}`)
    ) {
      errors.push(
        `Please use your college e-mail (e.g. 02230001.sherubtse@${domain}).`
      );
    }

    if (
      f.student_id &&
      !/^[A-Za-z0-9]{4,20}$/.test(f.student_id)
    ) {
      errors.push(
        'Student ID may only contain letters and numbers (4-20 characters).'
      );
    }

    if (
      f.phone &&
      !/^[+\d][\d\s-]{6,18}$/.test(f.phone)
    ) {
      errors.push('Please enter a valid phone number.');
    }

    if (!strongPassword(req.body.password)) {
      errors.push(
        'Password must be at least 8 characters and include a letter and a number.'
      );
    }

    if (req.body.password !== req.body.confirm_password) {
      errors.push('Passwords do not match.');
    }

    if (!errors.length) {
      if (await User.findByEmail(f.email)) {
        errors.push(
          'An account with this e-mail already exists.'
        );
      }

      if (
        f.student_id &&
        await User.findByStudentId(f.student_id)
      ) {
        errors.push(
          'This student ID is already registered.'
        );
      }
    }

    if (errors.length) {
      return res.status(400).render('public/register', {
        title: 'Create account',
        pageCss: ['auth'],
        errors,
        form: f
      });
    }

    const user = await User.create({
      ...f,
      password_hash: await bcrypt.hash(req.body.password, 10)
    });

    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.userId = user.id;

      req.flash(
        'success',
        'Your account has been created. Welcome to Sherubtse PrintHub!'
      );

      res.redirect('/student/dashboard');
    });

  } catch (err) {
    next(err);
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('printhub.sid');
    res.redirect('/');
  });
};
