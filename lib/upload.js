// Photo uploads (jpeg/png/webp, 3 MB). Files get random names; the original filename is never trusted.
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { ValidationError } = require('./validate');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadPath,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + EXT[file.mimetype]),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 3 },
  fileFilter: (req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(new ValidationError('Photos must be JPEG, PNG or WebP images.'))),
});

// Middleware for a resource: accepts its image fields and exposes req.uploaded = { field: filename }.
function forResource(def) {
  if (!def.hasImage) return (req, res, next) => next();
  const names = def.fields.filter((f) => f.type === 'image').map((f) => ({ name: f.name, maxCount: 1 }));
  const mw = upload.fields(names);
  return (req, res, next) => mw(req, res, (err) => {
    if (err) return next(err);
    req.uploaded = {};
    for (const [field, files] of Object.entries(req.files || {})) req.uploaded[field] = files[0].filename;
    next();
  });
}

module.exports = { forResource };
