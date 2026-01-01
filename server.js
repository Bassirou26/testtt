// ==========================
// server.js (DEV ready)
// ==========================

const express = require("express");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const http = require("http");
const { WebSocketServer } = require("ws");
const OpenAI = require("openai");
const PDFDocument = require("pdfkit");

dotenv.config();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------
// Middleware
// -------------------------
// DEV: accepte toutes les origines pour éviter CORS 403
app.use(cors({ origin: true, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// -------------------------
// Uploads
// -------------------------
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// -------------------------
// SQLite setup
// -------------------------
const DB_PATH = path.join(__dirname, process.env.DB_FILE || "data.sqlite");
const db = new sqlite3.Database(DB_PATH);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    })
  );
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
}

async function initDb() {
  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT UNIQUE, role TEXT, organization TEXT,
    consent INTEGER DEFAULT 0, passwordHash TEXT, verified INTEGER DEFAULT 1,
    verificationToken TEXT, createdAt INTEGER
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    token TEXT PRIMARY KEY, userId INTEGER, expiresAt INTEGER
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER,
    title TEXT, createdAt INTEGER, audioPath TEXT, isMeeting INTEGER DEFAULT 0
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId INTEGER, text TEXT
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId INTEGER, type TEXT, text TEXT
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS quiz (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId INTEGER, data TEXT
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, value TEXT
  )`);
}
initDb().catch((err) => console.error("DB init error:", err));

// -------------------------
// JWT
// -------------------------
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const ACCESS_EXPIRES = process.env.ACCESS_EXPIRES || "15m";
const REFRESH_EXPIRES_SECONDS = Number(process.env.REFRESH_EXPIRES_SECONDS) || 7 * 24 * 3600;

function generateToken() {
  return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

function signAccessToken(user) {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

async function saveRefreshToken(token, userId, expiresAt) {
  await dbRun(`INSERT OR REPLACE INTO refresh_tokens(token, userId, expiresAt) VALUES (?,?,?)`, [
    token,
    userId,
    expiresAt,
  ]);
}
async function findRefreshToken(token) {
  return await dbGet(`SELECT * FROM refresh_tokens WHERE token = ?`, [token]);
}
async function revokeRefreshToken(token) {
  await dbRun(`DELETE FROM refresh_tokens WHERE token = ?`, [token]);
}

function authenticateJWT(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ error: "Invalid authorization header" });
  const token = parts[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// -------------------------
// Routes
// -------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Register ---
app.post("/api/register", async (req, res, next) => {
  try {
    const { name, email, role, organization, consent, password } = req.body || {};
    if (!name || !email || !role || !password)
      return res.status(400).json({ error: "name,email,role,password required" });

    const existing = await dbGet(`SELECT * FROM users WHERE email=?`, [email]);
    if (existing) return res.status(409).json({ error: "Email déjà utilisé" });

    const passwordHash = bcrypt.hashSync(String(password), 10);
    const verificationToken = generateToken();

    await dbRun(
      `INSERT INTO users (name,email,role,organization,consent,passwordHash,verified,verificationToken,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [name, email, role, organization || "", consent ? 1 : 0, passwordHash, 1, verificationToken, Date.now()]
    );

    res.json({ ok: true, message: "Inscription réussie." });
  } catch (err) {
    next(err);
  }
});

// --- Login ---
app.post("/api/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await dbGet(`SELECT * FROM users WHERE email=?`, [email]);
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const match = bcrypt.compareSync(String(password), user.passwordHash);
    if (!match) return res.status(401).json({ error: "invalid credentials" });

    // Verified = 1 ensures no 403
    if (user.verified !== 1) return res.status(403).json({ error: "Email not verified" });

    const accessToken = signAccessToken(user);
    const refreshToken = generateToken();
    const expiresAt = Date.now() + REFRESH_EXPIRES_SECONDS * 1000;
    await saveRefreshToken(refreshToken, user.id, expiresAt);

    res.json({
      ok: true,
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------
// Other routes (token refresh, logout, me, sessions, etc.) 
// Copy your previous route logic here
// -------------------------

// -------------------------
// WebSocket & server
// -------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("WS client connected");
  ws.on("message", (msg) => {
    console.log("WS message:", msg.toString());
    ws.send(`Echo: ${msg}`);
  });
  ws.on("close", () => console.log("WS client disconnected"));
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

// -------------------------
// Error handler
// -------------------------
app.use((err, req, res, next) => {
  console.error("Server error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err && err.message ? err.message : "Internal Server Error" });
});

