/**
 * Multer configuration for document and avatar uploads.
 * Files are stored under random names, outside the public folder, per-student sub-directory.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const C = require('../config/constants');

const randomName = (ext) => `${crypto.randomBytes(16).toString('hex')}${ext}`;

const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(C.DOC_DIR, String(req.user.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, randomName(path.extname(file.originalname).toLowerCase())),
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: C.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!C.ALLOWED_EXT.includes(ext) || !C.ALLOWED_MIME.includes(file.mimetype)) {
      const err = new Error('Only PDF, DOC, DOCX, PPT and PPTX files are allowed.');
      err.code = 'BAD_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
}).single('document');

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { fs.mkdirSync(C.AVATAR_DIR, { recursive: true }); cb(null, C.AVATAR_DIR); },
    filename: (req, file, cb) => cb(null, randomName(path.extname(file.originalname).toLowerCase())),
  }),
  limits: { fileSize: C.MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext) || !/^image\/(png|jpe?g)$/.test(file.mimetype)) {
      const err = new Error('Profile picture must be a PNG or JPG image.');
      err.code = 'BAD_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
}).single('avatar');

/** Wraps a multer middleware so upload errors become friendly messages instead of crashing. */
const safe = (mw) => (req, res, next) => mw(req, res, (err) => {
  if (!err) return next();
  req.uploadError = err.code === 'LIMIT_FILE_SIZE'
    ? `File is too large (max ${Math.round((err.field === 'avatar' ? C.MAX_AVATAR_BYTES : C.MAX_UPLOAD_BYTES) / 1048576)} MB).`
    : err.message;
  next();
});

module.exports = { documentUpload: safe(documentUpload), avatarUpload: safe(avatarUpload) };
