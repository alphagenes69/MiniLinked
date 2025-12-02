// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Ensure folders exist
const DB_DIR = path.join(__dirname, 'db');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// SQLite DB
const DB_PATH = path.join(DB_DIR, 'data.sqlite3');
const db = new sqlite3.Database(DB_PATH);

// Multer setup (store files in uploads with unique name)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9);
    // keep original extension
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // accept PDFs and DOC/DOCX
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only .pdf, .doc and .docx allowed'));
  }
});

// Helper to run SQL with Promise
function runAsync(sql, params = []) {
  return new Promise((res, rej) => {
    db.run(sql, params, function (err) {
      if (err) rej(err); else res(this);
    });
  });
}
function allAsync(sql, params = []) {
  return new Promise((res, rej) => {
    db.all(sql, params, (err, rows) => err ? rej(err) : res(rows));
  });
}
function getAsync(sql, params = []) {
  return new Promise((res, rej) => {
    db.get(sql, params, (err, row) => err ? rej(err) : res(row));
  });
}

// initialize DB tables if they don't exist
const initSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  title TEXT,
  bio TEXT,
  resume_filename TEXT,
  resume_original_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
db.exec(initSql, (err) => {
  if (err) console.error('DB init error:', err);
  else console.log('DB ready:', DB_PATH);
});

// --- Routes ---

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    let { name, email, password, title, bio } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'missing fields' });
    const hash = await bcrypt.hash(password, 10);
    const result = await runAsync(
      `INSERT INTO users (name,email,password_hash,title,bio) VALUES (?,?,?,?,?)`,
      [name, email, hash, title || '', bio || '']
    );
    res.json({ id: result.lastID, name, email });
  } catch (err) {
    console.error(err);
    if (err && err.message && err.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Email already exists' });
    } else res.status(500).json({ error: 'server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await getAsync(`SELECT id,name,email,password_hash,title,bio,resume_filename,resume_original_name FROM users WHERE email = ?`, [email]);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    // Simple token (for demo): return user id as token
    res.json({ token: String(user.id), user: { id: user.id, name: user.name, email: user.email, title: user.title, bio: user.bio, hasResume: !!user.resume_filename } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// Upload resume for logged user (token = user id for simplicity)
app.post('/api/users/:id/resume', upload.single('resume'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    // in real app check token/auth; here we accept if param matches
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await runAsync(`UPDATE users SET resume_filename = ?, resume_original_name = ? WHERE id = ?`,
      [req.file.filename, req.file.originalname, userId]);
    res.json({ ok: true, filename: req.file.filename, original: req.file.originalname });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'upload error' });
  }
});

// Get user profile (including whether resume exists)
app.get('/api/users/:id', async (req, res) => {
  const id = req.params.id;
  const user = await getAsync(`SELECT id,name,email,title,bio,resume_filename,resume_original_name,created_at FROM users WHERE id = ?`, [id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Download resume file
app.get('/api/users/:id/resume', async (req, res) => {
  const id = req.params.id;
  const user = await getAsync(`SELECT resume_filename, resume_original_name FROM users WHERE id = ?`, [id]);
  if (!user || !user.resume_filename) return res.status(404).json({ error: 'Resume not found' });
  const filePath = path.join(UPLOAD_DIR, user.resume_filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on server' });
  res.download(filePath, user.resume_original_name);
});

// List users (basic search by name via ?q=)
app.get('/api/users', async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const rows = await allAsync(`SELECT id,name,title,bio, resume_filename IS NOT NULL AS hasResume FROM users WHERE name LIKE ? ORDER BY created_at DESC LIMIT 200`, [q]);
  res.json(rows);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
