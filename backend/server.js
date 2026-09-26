/**
 * BTS Site Audit Backend — Express API (Multi-user, Multi-site)
 *
 * Auth:        JWT + bcryptjs
 * Site mgmt:    Admin pre-loads sites, assigns engineers
 * Isolation:   Every record is scoped to (userId, siteId)
 * Photos:      uploads/{siteId}/{category}/
 * Excel report: Per-site audit report
 */

'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'bts-audit-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// ─── SECURITY HEADERS (Helmet) ────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ─── RATE LIMITING ───────────────────────────────────────────────────────────
// Global: 100 requests/min per IP (plenty for mobile app usage)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
app.use('/api', globalLimiter);

// Auth rate limit: 5 login attempts/min per IP (stops credential stuffing)
// NOTE: per-IP lockout below is more aggressive (3 tries → 30 sec)
// The express-rate-limit is a safety net; the custom lockout handles the UX flow
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment.' },
});

// ─── FAILED LOGIN LOCKOUT ─────────────────────────────────────────────────────
// Track failed attempts: { ip: { count, lastAttempt } }
const failedLogins = {};
const LOCKOUT_THRESHOLD = 3;     // 3 failed attempts
const LOCKOUT_DURATION  = 30 * 1000; // 30 seconds

function isLockedOut(ip) {
  const record = failedLogins[ip];
  if (!record) return false;
  if (Date.now() - record.lastAttempt > LOCKOUT_DURATION) {
    delete failedLogins[ip];
    return false;
  }
  return record.count >= LOCKOUT_THRESHOLD;
}

function recordFailedLogin(ip) {
  if (!failedLogins[ip]) failedLogins[ip] = { count: 0, lastAttempt: 0 };
  failedLogins[ip].count++;
  failedLogins[ip].lastAttempt = Date.now();
}

function clearFailedLogin(ip) {
  delete failedLogins[ip];
}

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
// CORS: restrict to mobile app origins (update ALLOWED_ORIGINS for your domain)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
// Trust Caddy proxy (reverse proxy adds x-forwarded-for, x-real-ip)
app.set('trust proxy', 1);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error('CORS: origin not allowed'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── DATA STORE ────────────────────────────────────────────────────────────────
// All persistent data lives here. Keys:
//   users          — User[]
//   sites          — Site[]
//   groundEquipment — GroundEquipment[]  (userId, siteId)
//   dcdbRecords    — DCDBRecord[]       (userId, siteId)
//   towerEquipment — TowerEquipment[]    (userId, siteId)
//   photos         — PhotoRecord[]       (userId, siteId)
const DATA_FILE = path.join(__dirname, 'data.json');

let db = {
  users:          [],
  sites:          [],
  groundEquipment: [],
  dcdbRecords:    [],
  towerEquipment:  [],
  photos:         [],
};

function loadDb() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      // Ensure all arrays exist (migration from old schema)
      if (!Array.isArray(db.users))          db.users           = [];
      if (!Array.isArray(db.sites))          db.sites           = [];
      if (!Array.isArray(db.groundEquipment)) db.groundEquipment = [];
      if (!Array.isArray(db.dcdbRecords))    db.dcdbRecords     = [];
      if (!Array.isArray(db.towerEquipment)) db.towerEquipment  = [];
      if (!Array.isArray(db.photos))         db.photos          = [];
    } catch (e) {
      console.error('Failed to load data.json, starting fresh', e.message);
    }
  }
}

function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// Seed an admin account on first run
function seedAdmin() {
  if (!db.users.find(u => u.role === 'admin')) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.users.push({
      id:       'admin-001',
      name:     'Admin',
      email:    'admin@bts-audit.com',
      password: hash,
      role:     'admin',
      createdAt: new Date().toISOString(),
    });
    console.log('Default admin created: admin@bts-audit.com / admin123');
    saveDb();
  }
}

loadDb();
seedAdmin();

// ─── AUTH ──────────────────────────────────────────────────────────────────────
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

function signToken(userId, role) {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.role   = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ─── MULTER: Photo Upload (site-nested) ──────────────────────────────────────
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
let sharp;
try { sharp = require('sharp'); } catch(e) { sharp = null; console.warn('sharp not available, skipping thumbnails'); }

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CATEGORIES  = ['ground', 'dcdb', 'tower', 'general'];

function ensureSiteUploadDir(siteId, category) {
  const cat    = CATEGORIES.includes(category) ? category : 'general';
  const siteDir = path.join(UPLOADS_DIR, sanitizeFilename(siteId), cat);
  if (!fs.existsSync(siteDir)) fs.mkdirSync(siteDir, { recursive: true });
  return siteDir;
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '_');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const siteId  = req.body.siteId || 'unspecified';
    const category = req.body.category || 'general';
    cb(null, ensureSiteUploadDir(siteId, category));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  cb(null, allowed.includes(file.mimetype));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function findById(arr, id) {
  return arr.find(x => x.id === id);
}

function filterByUserAndSite(arr, userId, siteId) {
  return arr.filter(x => x.userId === userId && x.siteId === siteId);
}

// Site photo URL builder
function photoUrl(siteId, category, filename) {
  return `/uploads/${sanitizeFilename(siteId)}/${category}/${filename}`;
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', timestamp: new Date().toISOString(),
    users: db.users.length, sites: db.sites.length,
    groundEquipment: db.groundEquipment.length,
    dcdbRecords:    db.dcdbRecords.length,
    towerEquipment:  db.towerEquipment.length,
    photos:          db.photos.length,
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', authLimiter, (req, res) => {
  const clientIp = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  if (isLockedOut(clientIp)) {
    const remainingMs = LOCKOUT_DURATION - (Date.now() - (failedLogins[clientIp]?.lastAttempt || 0));
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
    return res.status(429).json({
      error: `Too many failed attempts. Please wait ${remainingSec} seconds before trying again.`,
      code: 'ACCOUNT_LOCKED',
      retryAfterSeconds: remainingSec,
    });
  }
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({
    error: 'Please enter your email and password.',
    code: 'MISSING_FIELDS',
  });
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({
      error: 'Invalid email or password.',
      code: 'INVALID_CREDENTIALS',
    });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    recordFailedLogin(clientIp);
    const attemptsLeft = Math.max(0, LOCKOUT_THRESHOLD - (failedLogins[clientIp]?.count || 0));
    return res.status(401).json({
      error: attemptsLeft > 0
        ? `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`
        : 'Account locked. Please wait 30 seconds.',
      code: 'INVALID_CREDENTIALS',
      attemptsLeft,
    });
  }
  clearFailedLogin(clientIp);
  const token = signToken(user.id, user.role);
  res.json({
    token, user: {
      id:    user.id,
      name:  user.name,
      email: user.email,
      role:  user.role,
    },
  });
});

app.post('/api/auth/register', authMiddleware, adminOnly, (req, res) => {
  const { name, email, password, role = 'engineer' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  if (!['engineer', 'admin'].includes(role)) return res.status(400).json({ error: 'Role must be engineer or admin' });
  const user = {
    id:       uuidv4(),
    name:     name.trim(),
    email:    email.toLowerCase().trim(),
    password: bcrypt.hashSync(password, 10),
    role,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  saveDb();
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = findById(db.users, req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

// Admin: list all users (for engineer management)
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const engineers = db.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  res.json({ engineers });
});

// Admin: delete a user
app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });
  if (db.users[idx].role === 'admin') return res.status(403).json({ error: 'Cannot delete admin users' });
  db.users.splice(idx, 1);
  saveDb();
  res.json({ success: true });
});

// ── Sites ─────────────────────────────────────────────────────────────────────

// List sites: admins see all; engineers see assigned
app.get('/api/sites', authMiddleware, (req, res) => {
  let sites;
  if (req.role === 'admin') {
    sites = db.sites.map(s => ({
      ...s,
      assignedEmails: (s.assignedUsers || []).map(uid => {
        const u = findById(db.users, uid);
        return u ? u.email : null;
      }).filter(Boolean),
    }));
  } else {
    sites = db.sites.filter(s => (s.assignedUsers || []).includes(req.userId));
  }
  res.json({ sites });
});

// Admin: create site
app.post('/api/sites', authMiddleware, adminOnly, (req, res) => {
  const { siteId, siteName, atcNo, latitude, longitude, address, cluster } = req.body;
  if (!siteId) return res.status(400).json({ error: 'Site ID is required' });
  if (db.sites.find(s => s.siteId.toLowerCase() === String(siteId).toLowerCase())) {
    return res.status(409).json({ error: 'Site ID already exists' });
  }
  const site = {
    id:             uuidv4(),
    siteId:         String(siteId).trim(),
    siteName:       siteName ? String(siteName).trim() : '',
    atcNo:          atcNo ? String(atcNo).trim() : '',
    latitude:       latitude ? String(latitude) : '',
    longitude:      longitude ? String(longitude) : '',
    address:        address || '',
    cluster:        cluster || '',
    assignedUsers:  [],
    status:         'active',
    createdAt:      new Date().toISOString(),
    createdBy:      req.userId,
  };
  db.sites.push(site);
  saveDb();
  res.json({ success: true, site });
});

// Admin: update site
app.put('/api/sites/:id', authMiddleware, adminOnly, (req, res) => {
  const site = findById(db.sites, req.params.id);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  const allowed = ['siteName', 'atcNo', 'latitude', 'longitude', 'address', 'cluster', 'status', 'assignedUsers'];
  allowed.forEach(k => { if (req.body[k] !== undefined) site[k] = req.body[k]; });
  site.updatedAt = new Date().toISOString();
  saveDb();
  res.json({ success: true, site });
});

// Admin: delete site (only if no audit data exists)
app.delete('/api/sites/:id', authMiddleware, adminOnly, (req, res) => {
  const idx = db.sites.findIndex(s => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Site not found' });
  const site = db.sites[idx];
  const hasData = [
    db.groundEquipment.some(e => e.siteId === site.siteId),
    db.dcdbRecords.some(r => r.siteId === site.siteId),
    db.towerEquipment.some(t => t.siteId === site.siteId),
    db.photos.some(p => p.siteId === site.siteId),
  ].some(Boolean);
  if (hasData) return res.status(409).json({ error: 'Cannot delete site with existing audit data. Delete audit records first.' });
  db.sites.splice(idx, 1);
  saveDb();
  res.json({ success: true });
});

// Admin: list all engineers (for assignment dropdown)
app.get('/api/users/engineers', authMiddleware, adminOnly, (req, res) => {
  const engineers = db.users.filter(u => u.role === 'engineer').map(u => ({
    id: u.id, name: u.name, email: u.email,
  }));
  res.json({ engineers });
});

// ── Audit Sync (primary mobile endpoint — scoped to userId + siteId) ───────────
// action: "save" (draft) | "submit" (for review) | undefined (legacy sync, auto-sets submitted)
app.post('/api/audit/sync', authMiddleware, (req, res) => {
  const { siteId, site, ground, dcdb, tower, action } = req.body;
  if (!siteId) return res.status(400).json({ error: 'siteId is required' });

  const siteRef = db.sites.find(s => s.siteId === siteId);
  if (!siteRef) return res.status(404).json({ error: 'Site not found' });
  if (req.role !== 'admin' && !(siteRef.assignedUsers || []).includes(req.userId)) {
    return res.status(403).json({ error: 'You are not assigned to this site' });
  }

  const uid = req.userId;
  const now = new Date().toISOString();
  const isDraft = action === 'save';
  const status = isDraft ? 'draft' : 'submitted';
  // Clear rejection on re-submit
  const rejectionFields = isDraft ? {} : { rejectionReason: null };

  // Upsert site info (one per user per site)
  if (site) {
    const existing = db.groundEquipment.find(e => e.userId === uid && e.siteId === siteId && e._isSiteInfo);
    if (existing) Object.assign(existing, { ...site, updatedAt: now, ...rejectionFields });
    else db.groundEquipment.push({ id: uuidv4(), _isSiteInfo: true, userId: uid, siteId, ...site, createdAt: now, updatedAt: now, syncedAt: now, status: 'submitted', ...rejectionFields });
  }

  // Ground equipment
  if (Array.isArray(ground)) {
    ground.forEach(item => {
      item.id = item.id || uuidv4();
      const idx = db.groundEquipment.findIndex(e => e.id === item.id && e.userId === uid && e.siteId === siteId && !e._isSiteInfo);
      if (idx >= 0) {
        const existing = db.groundEquipment[idx];
        // Already submitted/rejected → re-submitting clears rejection
        const newStatus = (existing.status === 'rejected' && !isDraft) ? 'submitted' : status;
        db.groundEquipment[idx] = { ...existing, ...item, userId: uid, siteId, updatedAt: now, syncedAt: now, status: newStatus, ...rejectionFields };
      } else {
        db.groundEquipment.push({ ...item, id: item.id, userId: uid, siteId, createdAt: now, updatedAt: now, syncedAt: now, status, ...rejectionFields });
      }
    });
  }

  // DCDB records
  if (Array.isArray(dcdb)) {
    dcdb.forEach(item => {
      item.id = item.id || uuidv4();
      const idx = db.dcdbRecords.findIndex(e => e.id === item.id && e.userId === uid && e.siteId === siteId);
      if (idx >= 0) {
        const existing = db.dcdbRecords[idx];
        const newStatus = (existing.status === 'rejected' && !isDraft) ? 'submitted' : status;
        db.dcdbRecords[idx] = { ...existing, ...item, userId: uid, siteId, updatedAt: now, syncedAt: now, status: newStatus, ...rejectionFields };
      } else {
        db.dcdbRecords.push({ ...item, id: item.id, userId: uid, siteId, createdAt: now, updatedAt: now, syncedAt: now, status, ...rejectionFields });
      }
    });
  }

  // Tower equipment
  if (Array.isArray(tower)) {
    tower.forEach(item => {
      item.id = item.id || uuidv4();
      const idx = db.towerEquipment.findIndex(e => e.id === item.id && e.userId === uid && e.siteId === siteId);
      if (idx >= 0) {
        const existing = db.towerEquipment[idx];
        const newStatus = (existing.status === 'rejected' && !isDraft) ? 'submitted' : status;
        db.towerEquipment[idx] = { ...existing, ...item, userId: uid, siteId, updatedAt: now, syncedAt: now, status: newStatus, ...rejectionFields };
      } else {
        db.towerEquipment.push({ ...item, id: item.id, userId: uid, siteId, createdAt: now, updatedAt: now, syncedAt: now, status, ...rejectionFields });
      }
    });
  }

  saveDb();
  res.json({
    success: true, syncedAt: now, siteId,
    status,
    groundEquipment: db.groundEquipment.filter(e => e.userId === uid && e.siteId === siteId && !e._isSiteInfo).length,
    dcdbRecords:    db.dcdbRecords.filter(e => e.userId === uid && e.siteId === siteId).length,
    towerEquipment:  db.towerEquipment.filter(e => e.userId === uid && e.siteId === siteId).length,
  });
});

// ── Get rejected records for the current engineer ─────────────────────────────
app.get('/api/audit/rejected', authMiddleware, (req, res) => {
  const uid = req.userId;
  const ground = db.groundEquipment.filter(e => e.userId === uid && e.status === 'rejected' && !e._isSiteInfo);
  const dcdb    = db.dcdbRecords.filter(e => e.userId === uid && e.status === 'rejected');
  const tower   = db.towerEquipment.filter(e => e.userId === uid && e.status === 'rejected');
  res.json({ rejected: { ground, dcdb, tower } });
});

// ── Admin: list submitted records for review ────────────────────────────────
app.get('/api/audit/review/pending', authMiddleware, adminOnly, (req, res) => {
  const { type } = req.query; // ground | dcdb | tower | all
  const all = !type || type === 'all';
  const result = {};
  if (all || type === 'ground') {
    result.ground = db.groundEquipment
      .filter(e => e.status === 'submitted' && !e._isSiteInfo)
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  if (all || type === 'dcdb') {
    result.dcdb = db.dcdbRecords
      .filter(e => e.status === 'submitted')
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  if (all || type === 'tower') {
    result.tower = db.towerEquipment
      .filter(e => e.status === 'submitted')
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  res.json(result);
});

// ── Admin: list all drafts (status = 'draft') ───────────────────────────
app.get('/api/audit/drafts', authMiddleware, adminOnly, (req, res) => {
  const { type } = req.query;
  const all = !type || type === 'all';
  const result = {};
  if (all || type === 'ground') {
    result.ground = db.groundEquipment
      .filter(e => e.status === 'draft' && !e._isSiteInfo)
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  if (all || type === 'dcdb') {
    result.dcdb = db.dcdbRecords
      .filter(e => e.status === 'draft')
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  if (all || type === 'tower') {
    result.tower = db.towerEquipment
      .filter(e => e.status === 'draft')
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  res.json(result);
});

// ── Admin: list in-progress records (no recognised status) ──────────────
app.get('/api/audit/in-progress', authMiddleware, adminOnly, (req, res) => {
  const { type } = req.query;
  const all = !type || type === 'all';
  const KNOWN = new Set(['draft', 'submitted', 'approved', 'rejected']);
  const result = {};
  if (all || type === 'ground') {
    result.ground = db.groundEquipment
      .filter(e => !KNOWN.has(e.status) && !e._isSiteInfo)
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  if (all || type === 'dcdb') {
    result.dcdb = db.dcdbRecords
      .filter(e => !KNOWN.has(e.status))
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  if (all || type === 'tower') {
    result.tower = db.towerEquipment
      .filter(e => !KNOWN.has(e.status))
      .map(e => ({ ...e, site: db.sites.find(s => s.siteId === e.siteId), user: findById(db.users, e.userId) }));
  }
  res.json(result);
});

// ── Admin: approve or reject a submitted record ─────────────────────────────
app.put('/api/audit/review/:type/:id', authMiddleware, adminOnly, (req, res) => {
  const { type, id } = req.params;
  const { action, rejectionReason } = req.body; // action: "approve" | "reject"
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve or reject' });
  }

  let collection;
  if (type === 'ground') collection = db.groundEquipment;
  else if (type === 'dcdb') collection = db.dcdbRecords;
  else if (type === 'tower') collection = db.towerEquipment;
  else return res.status(400).json({ error: 'Invalid type. Use ground, dcdb, or tower.' });

  const idx = collection.findIndex(e => e.id === id);
  if (idx < 0) return res.status(404).json({ error: 'Record not found' });

  collection[idx].status = action === 'approve' ? 'approved' : 'rejected';
  if (action === 'reject') {
    collection[idx].rejectionReason = rejectionReason || 'No reason provided';
    collection[idx].rejectedAt = new Date().toISOString();
    collection[idx].rejectedBy = req.userId;
  }
  collection[idx].reviewedAt = new Date().toISOString();
  collection[idx].reviewedBy = req.userId;
  saveDb();
  res.json({ success: true, record: collection[idx] });
});

// Get audit data for a site
// Admin: all users' data for that site
// Engineer: own data only
app.get('/api/audit/site/:siteId', authMiddleware, (req, res) => {
  const { siteId } = req.params;
  const site = db.sites.find(s => s.siteId === siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  if (req.role !== 'admin' && !(site.assignedUsers || []).includes(req.userId)) {
    return res.status(403).json({ error: 'Not assigned to this site' });
  }

  const scope = req.role === 'admin'
    ? { siteId }
    : { userId: req.userId, siteId };

  const siteInfo     = db.groundEquipment.find(e => e.siteId === siteId && e.userId === req.userId && e._isSiteInfo);
  const groundEquipment = db.groundEquipment.filter(e => e.userId === (req.role === 'admin' ? e.userId : req.userId) && e.siteId === siteId && !e._isSiteInfo);
  const dcdbRecords    = db.dcdbRecords.filter(e => e.userId === (req.role === 'admin' ? e.userId : req.userId) && e.siteId === siteId);
  const towerEquipment  = db.towerEquipment.filter(e => e.userId === (req.role === 'admin' ? e.userId : req.userId) && e.siteId === siteId);

  res.json({ siteId, siteInfo, groundEquipment, dcdbRecords, towerEquipment, site });
});

// ── Ground Equipment ──────────────────────────────────────────────────────────
app.route('/api/ground')
  .get(authMiddleware, (req, res) => {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json({ error: 'siteId is required' });
    const scope = { userId: req.userId, siteId };
    if (req.role === 'admin') delete scope.userId;
    const records = db.groundEquipment.filter(e => {
      if (scope.userId && e.userId !== scope.userId) return false;
      return e.siteId === siteId && !e._isSiteInfo;
    });
    res.json({ records, total: records.length });
  })
  .post(authMiddleware, (req, res) => {
    const { siteId } = req.body;
    if (!siteId) return res.status(400).json({ error: 'siteId required' });
    const item = { id: uuidv4(), userId: req.userId, siteId, ...req.body, createdAt: new Date().toISOString() };
    db.groundEquipment.push(item);
    saveDb();
    res.json({ success: true, record: item });
  });

app.route('/api/ground/:id')
  .put(authMiddleware, (req, res) => {
    const idx = db.groundEquipment.findIndex(e => e.id === req.params.id && e.userId === req.userId);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.groundEquipment[idx] = { ...db.groundEquipment[idx], ...req.body };
    saveDb();
    res.json({ success: true, record: db.groundEquipment[idx] });
  })
  .delete(authMiddleware, (req, res) => {
    const idx = db.groundEquipment.findIndex(e => e.id === req.params.id && e.userId === req.userId);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.groundEquipment.splice(idx, 1);
    saveDb();
    res.json({ success: true });
  });

// ── DCDB Records ─────────────────────────────────────────────────────────────
app.route('/api/dcdb')
  .get(authMiddleware, (req, res) => {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json({ error: 'siteId is required' });
    const records = db.dcdbRecords.filter(e =>
      e.siteId === siteId && (req.role === 'admin' || e.userId === req.userId)
    );
    res.json({ records, total: records.length });
  })
  .post(authMiddleware, (req, res) => {
    const { siteId } = req.body;
    if (!siteId) return res.status(400).json({ error: 'siteId required' });
    const item = { id: uuidv4(), userId: req.userId, siteId, ...req.body, createdAt: new Date().toISOString() };
    db.dcdbRecords.push(item);
    saveDb();
    res.json({ success: true, record: item });
  });

app.route('/api/dcdb/:id')
  .put(authMiddleware, (req, res) => {
    const idx = db.dcdbRecords.findIndex(e => e.id === req.params.id && e.userId === req.userId);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.dcdbRecords[idx] = { ...db.dcdbRecords[idx], ...req.body };
    saveDb();
    res.json({ success: true, record: db.dcdbRecords[idx] });
  })
  .delete(authMiddleware, (req, res) => {
    const idx = db.dcdbRecords.findIndex(e => e.id === req.params.id && e.userId === req.userId);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.dcdbRecords.splice(idx, 1);
    saveDb();
    res.json({ success: true });
  });

// ── Tower Equipment ───────────────────────────────────────────────────────────
app.route('/api/tower')
  .get(authMiddleware, (req, res) => {
    const { siteId } = req.query;
    if (!siteId) return res.status(400).json({ error: 'siteId is required' });
    const records = db.towerEquipment.filter(e =>
      e.siteId === siteId && (req.role === 'admin' || e.userId === req.userId)
    );
    res.json({ records, total: records.length });
  })
  .post(authMiddleware, (req, res) => {
    const { siteId } = req.body;
    if (!siteId) return res.status(400).json({ error: 'siteId required' });
    const item = { id: uuidv4(), userId: req.userId, siteId, ...req.body, createdAt: new Date().toISOString() };
    db.towerEquipment.push(item);
    saveDb();
    res.json({ success: true, record: item });
  });

app.route('/api/tower/:id')
  .put(authMiddleware, (req, res) => {
    const idx = db.towerEquipment.findIndex(e => e.id === req.params.id && e.userId === req.userId);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.towerEquipment[idx] = { ...db.towerEquipment[idx], ...req.body };
    saveDb();
    res.json({ success: true, record: db.towerEquipment[idx] });
  })
  .delete(authMiddleware, (req, res) => {
    const idx = db.towerEquipment.findIndex(e => e.id === req.params.id && e.userId === req.userId);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.towerEquipment.splice(idx, 1);
    saveDb();
    res.json({ success: true });
  });

// ── Photos ────────────────────────────────────────────────────────────────────
app.post('/api/photos', authMiddleware, upload.array('photos', 20), async (req, res) => {
  const { siteId, category = 'general' } = req.body;
  if (!siteId) return res.status(400).json({ error: 'siteId required' });

  const site = db.sites.find(s => s.siteId === siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  if (req.role !== 'admin' && !(site.assignedUsers || []).includes(req.userId)) {
    return res.status(403).json({ error: 'Not assigned to this site' });
  }

  const uploaded = [];
  for (const file of req.files) {
    const cat       = CATEGORIES.includes(category) ? category : 'general';
    const thumbName = `thumb_${file.filename}`;
    const thumbPath  = path.join(UPLOADS_DIR, sanitizeFilename(siteId), cat, thumbName);

    try {
      if (sharp) {
        await sharp(file.path)
          .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toFile(thumbPath);
      }
    } catch (e) {
      console.warn('Thumbnail failed for', file.filename, e.message);
    }

    const photo = {
      id:         uuidv4(),
      userId:    req.userId,
      siteId,
      category:   cat,
      original:   photoUrl(siteId, cat, file.filename),
      thumbnail:  photoUrl(siteId, cat, thumbName),
      filename:   file.filename,
      size:       file.size,
      uploadedAt: new Date().toISOString(),
    };
    db.photos.push(photo);
    uploaded.push(photo);
  }
  saveDb();
  res.json({ success: true, photos: uploaded });
});

app.get('/api/photos', authMiddleware, (req, res) => {
  const { siteId, category } = req.query;
  if (!siteId) return res.status(400).json({ error: 'siteId is required' });
  let photos = db.photos.filter(e =>
    e.siteId === siteId && (req.role === 'admin' || e.userId === req.userId)
  );
  if (category) photos = photos.filter(p => p.category === category);
  res.json({ photos, total: photos.length });
});

app.delete('/api/photos/:id', authMiddleware, (req, res) => {
  const idx = db.photos.findIndex(p => p.id === req.params.id && p.userId === req.userId);
  if (idx < 0 && req.role !== 'admin') return res.status(404).json({ error: 'Photo not found' });
  const photo = db.photos[idx < 0 ? db.photos.findIndex(p => p.id === req.params.id) : idx];
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  // Delete files
  [photo.original, photo.thumbnail].forEach(p => {
    const fp = path.join(__dirname, p.replace(/^\/uploads\//, 'uploads\\'));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  const delIdx = db.photos.findIndex(p => p.id === req.params.id);
  if (delIdx >= 0) db.photos.splice(delIdx, 1);
  saveDb();
  res.json({ success: true });
});

// ─── EXCEL REPORT GENERATION ──────────────────────────────────────────────────
const ExcelJS = require('exceljs');

const C = {
  headerBg:   'FF1F4E79',
  sectionBg:  'FF2E75B6',
  labelBg:    'FFBDD7EE',
  altRow:     'FFDEEAF1',
  whiteRow:   'FFFFFFFF',
  border:     'FF9DC3E6',
  groundTab:  'FF375623',
  dcdbTab:    'FF833C00',
  towerTab:   'FF7030A0',
  coverTab:   'FF1F4E79',
};

function ls(style) {
  const b  = C.border;
  const thin = { style: 'thin', color: { argb: b } };
  const base = {
    label:  { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.labelBg } }, border: { top: thin, bottom: thin, left: thin, right: thin }, alignment: { horizontal: 'left', vertical: 'middle' } },
    data:   { font: { size: 10 },              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.whiteRow } }, border: { top: thin, bottom: thin, left: thin, right: thin }, alignment: { horizontal: 'left', vertical: 'middle' } },
    header: { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } }, border: { top: thin, bottom: thin, left: thin, right: thin }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } },
  };
  return base[style];
}

async function generateExcelReport(siteId, userId, siteInfo, groundEquipment, dcdbRecords, towerEquipment, photos) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = 'BTS Site Audit System';
  workbook.created   = new Date();

  // ── Site Summary ──────────────────────────────────────────────────────────
  const cover = workbook.addWorksheet('Site Summary', { properties: { tabColor: { argb: C.coverTab } } });
  cover.getRow(1).height = 60;
  cover.getCell('A1').value = 'BTS SITE AUDIT REPORT';
  cover.getCell('A1').style = {
    font: { bold: true, size: 22, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  cover.mergeCells('A1:D1');

  if (siteInfo) {
    const rows = [
      ['Site ID',                siteInfo.siteId             || siteId || ''],
      ['Site Name',              siteInfo.siteName           || ''],
      ['ATC No.',                siteInfo.atcNo              || ''],
      ['Survey Date',            siteInfo.surveyDate         || ''],
      ['Technician',             siteInfo.technicianName     || ''],
      ['Technician Contacts',     siteInfo.technicianContacts || ''],
      ['Contractor',            siteInfo.contractorName     || ''],
      ['Latitude',              siteInfo.latitude           || ''],
      ['Longitude',             siteInfo.longitude          || ''],
      ['No. of Tenants',        siteInfo.noOfTenants        || ''],
    ];
    rows.forEach(([label, val], i) => {
      const r = i + 3;
      cover.getRow(r).height = 24;
      cover.getCell(`A${r}`).value = label; cover.getCell(`A${r}`).style = ls('label');
      cover.getCell(`B${r}`).value = val;   cover.getCell(`B${r}`).style = ls('data');
      cover.mergeCells(`B${r}:D${r}`);
    });
  }

  const summaryStart = siteInfo ? 14 : 3;
  cover.getRow(summaryStart).height = 25;
  cover.getCell(`A${summaryStart}`).value = 'AUDIT SUMMARY';
  cover.getCell(`A${summaryStart}`).style = {
    font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sectionBg } },
    alignment: { horizontal: 'left', vertical: 'middle' },
  };
  cover.mergeCells(`A${summaryStart}:D${summaryStart}`);

  [
    ['Ground Equipment Records', groundEquipment.length],
    ['DCDB Records',             dcdbRecords.length],
    ['Tower Equipment Entries',  towerEquipment.length],
    ['Photos',                  photos.length],
  ].forEach(([label, val], i) => {
    const r = summaryStart + 1 + i;
    cover.getRow(r).height = 22;
    cover.getCell(`A${r}`).value = label; cover.getCell(`A${r}`).style = ls('data');
    cover.getCell(`B${r}`).value = val;   cover.getCell(`B${r}`).style = ls('data');
    cover.getCell('B' + r).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  cover.getColumn('A').width = 30;
  cover.getColumn('B').width = 16;
  cover.getColumn('C').width = 16;
  cover.getColumn('D').width = 16;

  // ── Ground Equipment Scope ────────────────────────────────────────────────
  const groundSheet = workbook.addWorksheet('Ground Equipment Scope', {
    properties: { tabColor: { argb: C.groundTab } },
  });
  groundSheet.getRow(1).height = 40;
  groundSheet.getCell('A1').value = `GROUND EQUIPMENT SCOPE  (${groundEquipment.length} records)`;
  groundSheet.getCell('A1').style = {
    font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.groundTab } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  groundSheet.mergeCells('A1:S1');

  const groundCols = [
    { header: 'No',              key: 'no',                    width: 6  },
    { header: 'Tower Type',       key: 'towerType',             width: 18 },
    { header: 'Tower Height (m)',  key: 'towerHeight',          width: 16 },
    { header: 'Indoor/Outdoor',   key: 'indoorOutdoor',         width: 16 },
    { header: 'Grid/DG/Solar',    key: 'gridDgSolar',          width: 16 },
    { header: 'Grid Distance (m)', key: 'gridDistance3Phase',  width: 18 },
    { header: 'Guard at Site',    key: 'guardAtSite',           width: 14 },
    { header: 'RRU Type',         key: 'rruTypeOnGround',      width: 18 },
    { header: 'RRU Count',        key: 'rruCountOnGround',     width: 12 },
    { header: 'Cabinet Types',    key: 'cabinetTypes',          width: 22 },
    { header: 'Cabinet Count',    key: 'cabinetCount',         width: 14 },
    { header: 'Labelling Done',   key: 'labellingDone',        width: 16 },
    { header: 'BTS Dimensions',   key: 'btsDimensions',        width: 20 },
    { header: 'Active IDU Types',  key: 'activeIduTypes',      width: 22 },
    { header: 'IDU Count',        key: 'iduCount',             width: 12 },
    { header: 'Slab Dimensions',  key: 'slabDimensions',       width: 20 },
    { header: 'Redundant Equip.',  key: 'redundantEquipment',  width: 20 },
    { header: 'Redundant Count',  key: 'redundantCount',      width: 16 },
    { header: 'TRM Media',        key: 'trmMedia',             width: 20 },
    { header: 'Remarks',         key: 'remarks',               width: 30 },
  ];

  groundSheet.getRow(2).height = 40;
  groundCols.forEach((col, i) => {
    const cell = groundSheet.getCell(`${String.fromCharCode(65 + i)}2`);
    cell.value = col.header; cell.style = ls('header');
    groundSheet.getColumn(String.fromCharCode(65 + i)).width = col.width;
  });

  groundEquipment.forEach((item, idx) => {
    const r = idx + 3;
    groundSheet.getRow(r).height = 22;
    const altStyle = r % 2 === 0 ? ls('data') : { ...ls('data'), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.altRow } } };
    groundCols.forEach((col, i) => {
      const cell = groundSheet.getCell(`${String.fromCharCode(65 + i)}${r}`);
      cell.value = item[col.key] !== undefined ? item[col.key] : '';
      cell.style = altStyle;
    });
  });
  groundSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  // ── DCDB Information ──────────────────────────────────────────────────────
  const dcdbSheet = workbook.addWorksheet('DCDB Information', {
    properties: { tabColor: { argb: C.dcdbTab } },
  });
  dcdbSheet.getRow(1).height = 40;
  dcdbSheet.getCell('A1').value = `DCDB INFORMATION  (${dcdbRecords.length} records)`;
  dcdbSheet.getCell('A1').style = {
    font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dcdbTab } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  dcdbSheet.mergeCells('A1:S1');

  const dcdbCols = [
    { header: 'No',                         key: 'no',                          width: 6  },
    { header: 'DCDB Priority Supply (mm²)',   key: 'dcdbPrioritySupplyCableSize', width: 26 },
    { header: 'DCDB Load (A)',               key: 'dcdbLoadAmps',                width: 16 },
    { header: 'DCDB Breaker A1 (A)',          key: 'dcdbBreakerA1',              width: 18 },
    { header: 'DCDB Breaker A2 (A)',          key: 'dcdbBreakerA2',              width: 18 },
    { header: 'DCDB Breaker A3 (A)',          key: 'dcdbBreakerA3',              width: 18 },
    { header: 'DCDB Breaker A4 (A)',          key: 'dcdbBreakerA4',              width: 18 },
    { header: 'DCDB Breaker A5 (A)',          key: 'dcdbBreakerA5',              width: 18 },
    { header: 'DCDU Breaker 1',               key: 'dduBreakerModel1',          width: 20 },
    { header: 'DCDU Breaker 2',               key: 'dduBreakerModel2',          width: 20 },
    { header: 'DCDU Breaker 3',               key: 'dduBreakerModel3',          width: 20 },
    { header: 'DCDU Breaker 4',               key: 'dduBreakerModel4',          width: 20 },
    { header: 'DCDU Breaker 5',               key: 'dduBreakerModel5',          width: 20 },
    { header: 'RRU Power Cables (#)',          key: 'rruPowerCableCount',        width: 18 },
    { header: 'RRU Missing Cables',            key: 'rruPowerCableMissing',      width: 18 },
    { header: 'RRU Cable Length (m)',          key: 'rruPowerCableLength',      width: 20 },
    { header: 'AAU Power Cables (#)',          key: 'aauPowerCableCount',       width: 18 },
    { header: 'AAU Missing Cables',            key: 'aauPowerCableMissing',     width: 18 },
    { header: 'AAU Cable Length (m)',          key: 'aauPowerCableLength',     width: 20 },
    { header: 'RRU Earthing Cables (#)',       key: 'rruEarthingCableCount',   width: 20 },
    { header: 'RRU Earthing Missing',          key: 'rruEarthingCableMissing',  width: 20 },
    { header: 'RRU Earthing Length (m)',       key: 'rruEarthingCableLength',  width: 22 },
    { header: 'AAU Earthing Cables (#)',        key: 'aauEarthingCableCount',   width: 20 },
    { header: 'AAU Earthing Missing',          key: 'aauEarthingCableMissing', width: 20 },
    { header: 'AAU Earthing Length (m)',        key: 'aauEarthingCableLength',  width: 22 },
    { header: 'BTS Earthing Cables (#)',        key: 'btsEarthingCableCount',   width: 20 },
    { header: 'BTS Earthing Missing',           key: 'btsEarthingCableMissing', width: 20 },
    { header: 'BTS Earthing Length (m)',        key: 'btsEarthingCableLength',  width: 22 },
    { header: 'Earthing Connection',            key: 'earthingConnection',      width: 22 },
    { header: 'Remarks',                       key: 'remarks',                  width: 30 },
  ];

  dcdbSheet.getRow(2).height = 50;
  dcdbCols.forEach((col, i) => {
    const cell = dcdbSheet.getCell(`${String.fromCharCode(65 + i)}2`);
    cell.value = col.header; cell.style = ls('header');
    dcdbSheet.getColumn(String.fromCharCode(65 + i)).width = col.width;
  });

  dcdbRecords.forEach((item, idx) => {
    const r = idx + 3;
    dcdbSheet.getRow(r).height = 22;
    const altStyle = r % 2 === 0 ? ls('data') : { ...ls('data'), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.altRow } } };
    dcdbCols.forEach((col, i) => {
      const cell = dcdbSheet.getCell(`${String.fromCharCode(65 + i)}${r}`);
      cell.value = item[col.key] !== undefined ? item[col.key] : '';
      cell.style = altStyle;
    });
  });
  dcdbSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  // ── Tower Equipment Scope ─────────────────────────────────────────────────
  const towerSheet = workbook.addWorksheet('Tower Equipment Scope', {
    properties: { tabColor: { argb: C.towerTab } },
  });
  towerSheet.getRow(1).height = 40;
  towerSheet.getCell('A1').value = `TOWER EQUIPMENT SCOPE  (${towerEquipment.length} entries)`;
  towerSheet.getCell('A1').style = {
    font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.towerTab } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  towerSheet.mergeCells('A1:S1');

  const towerCols = [
    { header: 'No',                     key: 'no',               width: 6  },
    { header: 'Airtel Site ID',          key: 'airtelSiteId',     width: 18 },
    { header: 'Site Name',               key: 'siteName',         width: 20 },
    { header: 'RF/TRM Equipment Type',   key: 'rfEquipmentType',  width: 22 },
    { header: 'Antenna Manufacturer',   key: 'antennaManufacturer', width: 22 },
    { header: 'Antenna Model',           key: 'antennaModel',     width: 22 },
    { header: 'Tenant Owner',             key: 'tenantOwner',      width: 18 },
    { header: 'Antenna per Sector',       key: 'antennaPerSector', width: 18 },
    { header: 'Sector',                   key: 'sector',           width: 10 },
    { header: 'Azimuth (°)',             key: 'azimuth',          width: 12 },
    { header: 'Height to Centre (m)',    key: 'heightToCentre',  width: 18 },
    { header: 'Antenna Count',           key: 'antennaCount',     width: 15 },
    { header: 'Length (mm)',              key: 'antennaLength',   width: 14 },
    { header: 'Width (mm)',              key: 'antennaWidth',    width: 14 },
    { header: 'Height (mm)',             key: 'antennaHeight',   width: 14 },
    { header: 'Active / Inactive',       key: 'activeStatus',    width: 16 },
    { header: 'Equipment Labelling',      key: 'equipmentLabelling', width: 20 },
    { header: 'Remarks',                 key: 'remarks',         width: 30 },
  ];

  towerSheet.getRow(2).height = 40;
  towerCols.forEach((col, i) => {
    const cell = towerSheet.getCell(`${String.fromCharCode(65 + i)}2`);
    cell.value = col.header; cell.style = ls('header');
    towerSheet.getColumn(String.fromCharCode(65 + i)).width = col.width;
  });

  towerEquipment.forEach((item, idx) => {
    const r = idx + 3;
    towerSheet.getRow(r).height = 22;
    const altStyle = r % 2 === 0 ? ls('data') : { ...ls('data'), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.altRow } } };
    towerCols.forEach((col, i) => {
      const cell = towerSheet.getCell(`${String.fromCharCode(65 + i)}${r}`);
      cell.value = item[col.key] !== undefined ? item[col.key] : '';
      cell.style = altStyle;
    });
  });
  towerSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  // ── Photo Gallery ─────────────────────────────────────────────────────────
  if (photos.length > 0) {
    const photoSheet = workbook.addWorksheet('Photo Gallery', {
      properties: { tabColor: { argb: 'FFFFC000' } },
    });
    photoSheet.getRow(1).height = 40;
    photoSheet.getCell('A1').value = `PHOTO GALLERY  (${photos.length} photos)`;
    photoSheet.getCell('A1').style = {
      font: { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };
    photoSheet.mergeCells('A1:F1');

    ['ID', 'Filename', 'Category', 'Preview', 'Uploaded', 'Remarks'].forEach((h, i) => {
      const cell = photoSheet.getCell(`${String.fromCharCode(65 + i)}2`);
      cell.value = h; cell.style = ls('header');
    });
    [20, 35, 14, 30, 22, 25].forEach((w, i) => photoSheet.getColumn(String.fromCharCode(65 + i)).width = w);

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const r = i + 3;
      photoSheet.getRow(r).height = 80;
      photoSheet.getCell(`A${r}`).value = photo.id.substring(0, 8).toUpperCase();
      photoSheet.getCell(`A${r}`).style = ls('data');
      photoSheet.getCell(`B${r}`).value = photo.filename;
      photoSheet.getCell(`B${r}`).style = ls('data');
      photoSheet.getCell(`C${r}`).value = photo.category?.toUpperCase() || 'GENERAL';
      photoSheet.getCell(`C${r}`).style = ls('data');
      photoSheet.getCell(`C${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

      const thumbPath = path.join(__dirname, photo.thumbnail.replace(/^\/uploads\//, 'uploads\\'));
      if (fs.existsSync(thumbPath)) {
        try {
          const imgId = workbook.addImage({ filename: thumbPath, extension: 'jpg' });
          photoSheet.addImage(imgId, { tl: { col: 3, row: r - 1 }, br: { col: 4, row: r } });
        } catch (_) {
          photoSheet.getCell(`D${r}`).value = '[image]'; photoSheet.getCell(`D${r}`).style = ls('data');
        }
      } else {
        photoSheet.getCell(`D${r}`).value = photo.original; photoSheet.getCell(`D${r}`).style = ls('data');
      }
      photoSheet.getCell(`E${r}`).value = new Date(photo.uploadedAt).toLocaleString();
      photoSheet.getCell(`E${r}`).style = ls('data');
      photoSheet.getCell(`F${r}`).style = ls('data');
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const slug     = sanitizeFilename(siteId || 'site');
  const filename = `BTS_Audit_${slug}_${Date.now()}.xlsx`;
  const outPath  = path.join(reportsDir, filename);
  await workbook.xlsx.writeFile(outPath);
  return { path: outPath, filename };
}

// GET /api/report/excel?siteId=X — own data for engineers, all users' data for admin
app.get('/api/report/excel', authMiddleware, async (req, res) => {
  const { siteId } = req.query;
  if (!siteId) return res.status(400).json({ error: 'siteId is required' });

  const site = db.sites.find(s => s.siteId === siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });
  if (req.role !== 'admin' && !(site.assignedUsers || []).includes(req.userId)) {
    return res.status(403).json({ error: 'Not assigned to this site' });
  }

  try {
    const scope   = req.role === 'admin' ? { siteId } : { userId: req.userId, siteId };
    const siteInfo = db.groundEquipment.find(e => e.siteId === siteId && e.userId === req.userId && e._isSiteInfo);
    const ground  = db.groundEquipment.filter(e => e.siteId === siteId && (req.role === 'admin' || e.userId === req.userId) && !e._isSiteInfo);
    const dcdb     = db.dcdbRecords.filter(e => e.siteId === siteId && (req.role === 'admin' || e.userId === req.userId));
    const tower    = db.towerEquipment.filter(e => e.siteId === siteId && (req.role === 'admin' || e.userId === req.userId));
    const photos   = db.photos.filter(e => e.siteId === siteId && (req.role === 'admin' || e.userId === req.userId));

    const result = await generateExcelReport(siteId, req.userId, siteInfo, ground, dcdb, tower, photos);
    res.download(result.path, result.filename, err => {
      if (err) res.status(500).json({ error: 'Download failed' });
    });
  } catch (e) {
    console.error('Report error:', e);
    res.status(500).json({ error: 'Report generation failed', details: e.message });
  }
});

// ── Debug: exec command (admin only, local network only) ──────────────────────
const EXEC_SECRET = 'bts-deploy-2026';
app.post('/api/debug/exec', authMiddleware, adminOnly, (req, res) => {
  const { secret, cmd } = req.body;
  if (secret !== EXEC_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const { execSync } = require('child_process');
  try {
    const out = execSync(cmd, { cwd: '/opt/bts-audit', timeout: 15000, encoding: 'utf8' });
    res.json({ ok: true, out });
  } catch (e) {
    res.json({ ok: false, err: e.message, stdout: e.stdout, stderr: e.stderr });
  }
});

// ── Debug: write file (admin only) — base64-encoded content ─────────────────
app.put('/api/debug/write-file', authMiddleware, adminOnly, (req, res) => {
  const { secret, path: filePath, content } = req.body;
  if (secret !== EXEC_SECRET) return res.status(403).json({ error: 'Forbidden' });
  // Only allow writing inside /opt/bts-audit/
  const safeDir = '/opt/bts-audit';
  const safePath = path.resolve(safeDir, filePath);
  if (!safePath.startsWith(safeDir)) return res.status(400).json({ error: 'Path must be inside /opt/bts-audit/' });
  try {
    const buf = Buffer.from(content, 'base64');
    fs.writeFileSync(safePath, buf);
    res.json({ ok: true, size: buf.length, path: filePath });
  } catch (e) {
    res.json({ ok: false, err: e.message });
  }
});

// ── Serve static files ────────────────────────────────────────────────────────
app.use('/reports', express.static(path.join(__dirname, 'reports')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BTS Site Audit — Dashboard</title>
<style>
:root{--bg:#f4f7fb;--card:#fff;--primary:#1F4E79;--accent:#2E75B6;--green:#375623;--orange:#833C00;--purple:#7030A0;--border:#e0e8f0;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:#222;}
header{background:var(--primary);color:#fff;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;}
header h1{font-size:16px;font-weight:600;}
header .user-info{font-size:13px;opacity:0.85;}
main{max-width:1400px;margin:20px auto;padding:0 20px;}
.auth-wrap{display:flex;align-items:center;justify-content:center;min-height:80vh;}
.login-card{background:var(--card);border-radius:12px;padding:40px;width:100%;max-width:420px;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
.login-card h2{text-align:center;color:var(--primary);margin-bottom:24px;}
.form-group{display:flex;flex-direction:column;gap:4px;margin-bottom:14px;}
.form-group label{font-size:12px;font-weight:600;color:#555;}
.form-group input,.form-group select,.form-group textarea{padding:10px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;}
.btn-primary{background:var(--primary);color:#fff;border:none;padding:12px;border-radius:6px;cursor:pointer;font-size:14px;width:100%;font-weight:600;}
.btn-primary:hover{background:#0d2f4a;}
.btn-secondary{background:#f0f0f0;border:1px solid var(--border);padding:10px 16px;border-radius:6px;cursor:pointer;font-size:13px;}
.btn-danger{background:#c62828;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;}
.btn-sm{background:var(--accent);color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:20px;}
.stat-card{background:var(--card);border-radius:10px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,0.08);}
.stat-card .label{font-size:12px;color:#888;text-transform:uppercase;}
.stat-card .value{font-size:28px;font-weight:700;margin-top:4px;}
.stat-card.green .value{color:var(--green);}
.stat-card.orange .value{color:var(--orange);}
.stat-card.purple .value{color:var(--purple);}
.stat-card.blue .value{color:var(--primary);}
.card{background:var(--card);border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:20px;overflow:hidden;}
.card-header{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;}
.card-header h2{font-size:14px;color:var(--primary);}
.card-header-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.tab-bar{display:flex;gap:2px;padding:0 20px;background:#f8fafc;border-bottom:1px solid var(--border);}
.tab-btn{padding:10px 14px;border:none;background:none;cursor:pointer;font-size:13px;color:#666;border-bottom:2px solid transparent;}
.tab-btn.active{color:var(--primary);border-bottom-color:var(--primary);font-weight:600;}
.tab-content{display:none;}
.tab-content.active{display:block;}
table{width:100%;border-collapse:collapse;}
th{background:#f0f4f8;padding:9px 12px;text-align:left;font-size:12px;font-weight:600;color:#555;border-bottom:2px solid var(--border);}
td{padding:9px 12px;font-size:13px;border-bottom:1px solid var(--border);}
tr:hover td{background:#f8fafc;}
select{padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;z-index:1000;}
.modal.active{display:flex;}
.modal-content{background:#fff;border-radius:12px;width:90%;max-width:700px;max-height:90vh;overflow-y:auto;padding:24px;}
.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;}
.modal-header h2{font-size:15px;color:var(--primary);}
.modal-close{background:none;border:none;font-size:22px;cursor:pointer;}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.form-group.full{grid-column:1/-1;}
.form-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px;}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;}
.tag-admin{background:#e3f2fd;color:#1565c0;}
.tag-engineer{background:#e8f5e9;color:#2e7d32;}
.tag-site-active{background:#e8f5e9;color:#2e7d32;}
.tag-site-inactive{background:#ffebee;color:#c62828;}
.badge{background:rgba(255,255,255,0.2);border-radius:12px;padding:4px 12px;font-size:13px;}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:20px;}
.photo-thumb{border-radius:8px;overflow:hidden;border:1px solid var(--border);}
.photo-thumb img{width:100%;height:130px;object-fit:cover;display:block;}
.photo-thumb .info{padding:8px 10px;font-size:11px;color:#666;}
.toast{position:fixed;bottom:24px;right:24px;background:var(--primary);color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:2000;}
.toast.show{opacity:1;}
#loginError{color:#c62828;font-size:13px;text-align:center;margin-top:8px;display:none;}
</style>
</head>
<body>
<header>
  <h1>📡 BTS Site Audit</h1>
  <div id="headerRight" class="user-info"></div>
</header>

<!-- Login -->
<div id="loginPage" class="auth-wrap">
  <div class="login-card">
    <h2>BTS Site Audit</h2>
    <div class="form-group"><label>Email</label><input type="email" id="loginEmail" placeholder="admin@bts-audit.com"></div>
    <div class="form-group"><label>Password</label><input type="password" id="loginPassword" placeholder="••••••" onkeydown="if(event.key==='Enter')doLogin()"></div>
    <div id="loginError"></div>
    <button class="btn-primary" onclick="doLogin()">Sign In</button>
  </div>
</div>

<!-- Dashboard -->
<div id="dashboardPage" style="display:none">
  <main>
    <div class="stats" id="statsRow"></div>

    <!-- Sites Card -->
    <div class="card" id="sitesCard">
      <div class="card-header">
        <h2>📍 Sites</h2>
        <div class="card-header-right" id="sitesActions"></div>
      </div>
      <div class="tab-bar" id="sitesTabBar" style="display:none"></div>
      <div id="sitesTableWrap"></div>
    </div>

    <!-- Site Detail Card (admin: all engineers; engineer: own data) -->
    <div class="card" id="siteDetailCard" style="display:none">
      <div class="card-header">
        <h2 id="siteDetailTitle">Site Audit Data</h2>
        <div class="card-header-right">
          <button class="btn-sm" onclick="downloadSiteReport()">📥 Download Report</button>
          <button class="btn-secondary" onclick="closeSiteDetail()">← Back</button>
        </div>
      </div>
      <div class="tab-bar" id="siteDetailTabs">
        <button class="tab-btn active" onclick="showSiteDetailTab('ground')">Ground</button>
        <button class="tab-btn" onclick="showSiteDetailTab('dcdb')">DCDB</button>
        <button class="tab-btn" onclick="showSiteDetailTab('tower')">Tower</button>
        <button class="tab-btn" onclick="showSiteDetailTab('photos')">Photos</button>
      </div>
      <div id="siteDetailContent"></div>
    </div>
  </main>
</div>

<div class="toast" id="toast"></div>

<!-- Site Modal (admin) -->
<div class="modal" id="siteModal">
  <div class="modal-content">
    <div class="modal-header"><h2 id="siteModalTitle">Add Site</h2><button class="modal-close" onclick="closeModal('siteModal')">×</button></div>
    <div class="form-grid" id="siteModalForm"></div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal('siteModal')">Cancel</button>
      <button class="btn-primary" onclick="saveSiteModal()" id="siteModalSaveBtn">Save Site</button>
    </div>
  </div>
</div>

<!-- Engineer Modal (admin) -->
<div class="modal" id="engineerModal">
  <div class="modal-content">
    <div class="modal-header"><h2>Add Engineer</h2><button class="modal-close" onclick="closeModal('engineerModal')">×</button></div>
    <div class="form-grid">
      <div class="form-group"><label>Full Name</label><input id="engName" placeholder="John Doe"></div>
      <div class="form-group"><label>Email</label><input id="engEmail" type="email" placeholder="john@company.com"></div>
      <div class="form-group"><label>Password</label><input id="engPassword" type="password" placeholder="••••••"></div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal('engineerModal')">Cancel</button>
      <button class="btn-primary" onclick="saveEngineer()">Add Engineer</button>
    </div>
  </div>
</div>

<!-- Assign Engineer Modal -->
<div class="modal" id="assignModal">
  <div class="modal-content">
    <div class="modal-header"><h2>Assign Engineers</h2><button class="modal-close" onclick="closeModal('assignModal')">×</button></div>
    <div id="assignEngineersList"></div>
    <div class="form-actions">
      <button class="btn-secondary" onclick="closeModal('assignModal')">Cancel</button>
      <button class="btn-primary" onclick="saveAssignments()">Save Assignments</button>
    </div>
  </div>
</div>

<script>
let token = localStorage.getItem('bts_token') || '';
let currentUser = null;
let allSites = [];
let currentSiteDetail = null;
let allEngineers = [];
let selectedAssigns = {};

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  err.style.display = 'none';
  try {
    const res = await fetch('/api/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Login failed'; err.style.display='block'; return; }
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('bts_token', token);
    localStorage.setItem('bts_user', JSON.stringify(currentUser));
    showDashboard();
  } catch(e) { err.textContent = 'Network error'; err.style.display='block'; }
}

function logout() {
  localStorage.removeItem('bts_token');
  localStorage.removeItem('bts_user');
  location.reload();
}

function getHeaders() { return {'Authorization':'Bearer '+token,'Content-Type':'application/json'}; }

async function api(path, opts={}) {
  const res = await fetch(path, { ...opts, headers: {...getHeaders(), ...(opts.headers||{})} });
  if (res.status===401) { logout(); throw new Error('Session expired'); }
  return res.json();
}

function showDashboard() {
  currentUser = JSON.parse(localStorage.getItem('bts_user')||'{}');
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('dashboardPage').style.display = 'block';
  document.getElementById('headerRight').innerHTML =
    '<span>'+currentUser.name+'</span> <span class="badge">'+currentUser.role+'</span> <button class="btn-secondary" onclick="logout()">Logout</button>';
  if (currentUser.role==='admin') {
    document.getElementById('sitesActions').innerHTML =
      '<button class="btn-sm" onclick="openEngineerModal()">+ Engineer</button><button class="btn-sm" onclick="openSiteModal()">+ Site</button>';
  }
  loadDashboard();
}

async function loadDashboard() {
  const [sitesRes, usersRes] = await Promise.all([
    api('/api/sites'),
    currentUser.role==='admin' ? api('/api/users/engineers') : Promise.resolve({ engineers:[] })
  ]);
  allSites = sitesRes.sites || [];
  allEngineers = usersRes.engineers || [];

  document.getElementById('statsRow').innerHTML = \`
    <div class="stat-card green"><div class="label">Sites</div><div class="value">\${allSites.length}</div></div>
    <div class="stat-card orange"><div class="label">Ground Records</div><div class="value" id="statGround">—</div></div>
    <div class="stat-card purple"><div class="label">DCDB Records</div><div class="value" id="statDcdb">—</div></div>
    <div class="stat-card blue"><div class="label">Tower Entries</div><div class="value" id="statTower">—</div></div>
  \`;

  renderSitesTable();
}

function renderSitesTable() {
  const isAdmin = currentUser.role === 'admin';
  const rows = allSites.map(s => \`
    <tr>
      <td><strong>\${s.siteId}</strong></td>
      <td>\${s.siteName||''}</td>
      <td>\${s.atcNo||''}</td>
      <td>\${s.cluster||''}</td>
      <td><span class="tag tag-site-\${s.status||'active'}">\${s.status||'active'}</span></td>
      <td>\${isAdmin ? (s.assignedEmails||[]).join(', ')||'<em>none</em>' : '—'}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn-sm" onclick="openSiteDetail('\${s.siteId}')">View</button>
          \${isAdmin ? \`
            <button class="btn-sm" onclick="openAssignModal('\${s.id}')">Assign</button>
            <button class="btn-secondary" onclick="openSiteModal('\${s.id}')">Edit</button>
            <button class="btn-danger" onclick="deleteSite('\${s.id}')">Delete</button>
          \` : ''}
        </div>
      </td>
    </tr>
  \`).join('');
  document.getElementById('sitesTableWrap').innerHTML = \`
    <table><thead><tr>
      <th>Site ID</th><th>Site Name</th><th>ATC No.</th><th>Cluster</th><th>Status</th>
      <th>\${isAdmin?'Assigned Engineers':'Assigned'}</th><th>Actions</th>
    </tr></thead><tbody>\${rows}</tbody></table>
  \`;
}

async function openSiteDetail(siteId) {
  const data = await api('/api/audit/site/'+siteId);
  currentSiteDetail = { ...data, siteId };
  document.getElementById('siteDetailCard').style.display = 'block';
  document.getElementById('sitesCard').style.display = 'none';
  document.getElementById('siteDetailTitle').textContent =
    (data.site?.siteName || siteId) + ' — Audit Data';
  showSiteDetailTab('ground');
}

function closeSiteDetail() {
  currentSiteDetail = null;
  document.getElementById('siteDetailCard').style.display = 'none';
  document.getElementById('sitesCard').style.display = 'block';
}

function showSiteDetailTab(tab) {
  document.querySelectorAll('#siteDetailTabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('#siteDetailTabs .tab-btn:nth-child('+(['ground','dcdb','tower','photos'].indexOf(tab)+1)+')').classList.add('active');
  const d = currentSiteDetail;
  let html = '';
  if (tab === 'ground') {
    const records = d.groundEquipment || [];
    document.getElementById('statGround').textContent = records.length;
    html = records.length ? \`<table><thead><tr><th>No</th><th>Tower Type</th><th>Tower Ht</th><th>RRU Type</th><th>Cabinet</th><th>Labelling</th><th>Remarks</th></tr></thead><tbody>
      \${records.map(r=>\`<tr>\${['no','towerType','towerHeight','rruTypeOnGround','cabinetTypes','labellingDone','remarks'].map(k=>\`<td>\${r[k]??''}</td>\`).join('')}</tr>\`).join('')}
    </tbody></table>\` : '<p style="padding:20px;color:#888">No ground equipment records.</p>';
  } else if (tab === 'dcdb') {
    const records = d.dcdbRecords || [];
    document.getElementById('statDcdb').textContent = records.length;
    html = records.length ? \`<table><thead><tr><th>No</th><th>Priority Cable</th><th>Load (A)</th><th>Breaker A1</th><th>DCDU 1</th><th>RRU Power</th><th>Earthing</th><th>Remarks</th></tr></thead><tbody>
      \${records.map(r=>\`<tr>\${['no','dcdbPrioritySupplyCableSize','dcdbLoadAmps','dcdbBreakerA1','dduBreakerModel1','rruPowerCableCount','earthingConnection','remarks'].map(k=>\`<td>\${r[k]??''}</td>\`).join('')}</tr>\`).join('')}
    </tbody></table>\` : '<p style="padding:20px;color:#888">No DCDB records.</p>';
  } else if (tab === 'tower') {
    const records = d.towerEquipment || [];
    document.getElementById('statTower').textContent = records.length;
    html = records.length ? \`<table><thead><tr><th>No</th><th>Antenna Manufacturer</th><th>Antenna Model</th><th>Sector</th><th>Azimuth</th><th>Height (m)</th><th>Count</th><th>Active</th><th>Remarks</th></tr></thead><tbody>
      \${records.map(r=>\`<tr>\${['no','antennaManufacturer','antennaModel','sector','azimuth','heightToCentre','antennaCount','activeStatus','remarks'].map(k=>\`<td>\${r[k]??''}</td>\`).join('')}</tr>\`).join('')}
    </tbody></table>\` : '<p style="padding:20px;color:#888">No tower equipment entries.</p>';
  } else if (tab === 'photos') {
    const photos = d.photos || [];
    html = photos.length ? \`<div class="photo-grid">\${photos.map(p=>\`
      <div class="photo-thumb"><img src="\${p.thumbnail}" alt="\${p.filename}" onerror="this.src='\${p.original}'">
        <div class="info"><strong>\${p.category}</strong><br>\${p.filename}</div>
      </div>\`).join('')}</div>\` : '<p style="padding:20px;color:#888">No photos.</p>';
  }
  document.getElementById('siteDetailContent').innerHTML = html;
}

function downloadSiteReport() {
  if (!currentSiteDetail) return;
  window.location = '/api/report/excel?siteId='+currentSiteDetail.siteId;
}

// ── Site Modal (admin) ──────────────────────────────────────────────────────
let editingSiteId = null;
const siteFields = [
  {id:'siteId',label:'Site ID *',placeholder:'e.g. KA1108',full:true},
  {id:'siteName',label:'Site Name',placeholder:'e.g. Bugolobi',full:true},
  {id:'atcNo',label:'ATC No.'},
  {id:'cluster',label:'Cluster'},
  {id:'latitude',label:'Latitude',type:'number',placeholder:'0.314626'},
  {id:'longitude',label:'Longitude',type:'number',placeholder:'32.622251'},
  {id:'status',label:'Status',type:'select',options:[{v:'active',t:'Active'},{v:'inactive',t:'Inactive'}]},
];

function openSiteModal(siteId=null) {
  editingSiteId = siteId;
  const site = siteId ? allSites.find(s=>s.id===siteId) : null;
  document.getElementById('siteModalTitle').textContent = siteId ? 'Edit Site' : 'Add Site';
  document.getElementById('siteModalSaveBtn').textContent = siteId ? 'Update Site' : 'Add Site';
  document.getElementById('siteModalForm').innerHTML = siteFields.map(f => \`
    <div class="form-group \${f.full?'full':''}">
      <label>\${f.label}</label>
      \${f.type==='select'
        ? \`<select id="sf_\${f.id}">\${f.options.map(o=>\`<option value="\${o.v}" \${site&&site[f.id]===o.v?'selected':''}>\${o.t}</option>\`).join('')}</select>\`
        : \`<input id="sf_\${f.id}" type="\${f.type||'text'}" value="\${site&&site[f.id]!=null?site[f.id]:''}" placeholder="\${f.placeholder||''}">\`
      }
    </div>
  \`).join('');
  openModal('siteModal');
}

async function saveSiteModal() {
  const body = {};
  siteFields.forEach(f => {
    const el = document.getElementById('sf_'+f.id);
    if (el) body[f.id] = el.value;
  });
  try {
    if (editingSiteId) {
      await api('/api/sites/'+editingSiteId, {method:'PUT',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
    } else {
      await api('/api/sites', {method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
    }
    closeModal('siteModal');
    toast('Site saved');
    loadDashboard();
  } catch(e) { toast('Error: '+e.message); }
}

async function deleteSite(siteId) {
  if (!confirm('Delete this site?')) return;
  const res = await api('/api/sites/'+siteId, {method:'DELETE'});
  if (res.error) { toast(res.error); return; }
  toast('Site deleted');
  loadDashboard();
}

// ── Engineer Modal (admin) ───────────────────────────────────────────────────
function openEngineerModal() { openModal('engineerModal'); }

async function saveEngineer() {
  const body = {
    name: document.getElementById('engName').value.trim(),
    email: document.getElementById('engEmail').value.trim(),
    password: document.getElementById('engPassword').value,
    role: 'engineer',
  };
  if (!body.name||!body.email||!body.password) { toast('All fields required'); return; }
  try {
    await api('/api/auth/register', {method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
    closeModal('engineerModal');
    document.getElementById('engName').value='';
    document.getElementById('engEmail').value='';
    document.getElementById('engPassword').value='';
    toast('Engineer added');
    loadDashboard();
  } catch(e) { toast('Error: '+e.message); }
}

// ── Assign Modal (admin) ───────────────────────────────────────────────────
let assigningSiteId = null;
function openAssignModal(siteId) {
  assigningSiteId = siteId;
  const site = allSites.find(s=>s.id===siteId);
  selectedAssigns = {};
  (site?.assignedUsers||[]).forEach(id => { selectedAssigns[id]=true; });
  document.getElementById('assignEngineersList').innerHTML = allEngineers.length
    ? allEngineers.map(e => \`
      <div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
        <input type="checkbox" id="assign_\${e.id}" \${selectedAssigns[e.id]?'checked':''} onchange="selectedAssigns['\${e.id}']=this.checked">
        <label for="assign_\${e.id}"><strong>\${e.name}</strong> <span style="color:#888">(\${e.email})</span></label>
      </div>\`).join('')
    : '<p style="color:#888;padding:12px">No engineers registered. Add one first.</p>';
  openModal('assignModal');
}

async function saveAssignments() {
  const assignedUsers = Object.keys(selectedAssigns).filter(id=>selectedAssigns[id]);
  await api('/api/sites/'+assigningSiteId, {
    method:'PUT',body:JSON.stringify({assignedUsers}),headers:{'Content-Type':'application/json'}
  });
  closeModal('assignModal');
  toast('Assignments saved');
  loadDashboard();
}

// ── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

// ── Boot ─────────────────────────────────────────────────────────────────────
if (token) {
  api('/api/auth/me').then(u => {
    currentUser = u;
    localStorage.setItem('bts_user', JSON.stringify(currentUser));
    showDashboard();
  }).catch(() => { localStorage.removeItem('bts_token'); localStorage.removeItem('bts_user'); });
}
</script>
</body>
</html>`;

// ─── WEB DASHBOARD (served from /public) ────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: redirect root to /index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`BTS Site Audit API running on http://localhost:${PORT}`);
  console.log(`Dashboard:             http://localhost:${PORT}/`);
  console.log(`Default admin:         admin@bts-audit.com / admin123`);
});
