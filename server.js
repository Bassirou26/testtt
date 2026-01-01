// server.js complet pour SmartSummary (version fonctionnelle)
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// -------------------------
// Database
// -------------------------
const DB_PATH = path.join(__dirname, process.env.DB_FILE || "data.sqlite");
const db = new sqlite3.Database(DB_PATH);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    role TEXT,
    organization TEXT,
    consent INTEGER DEFAULT 0,
    passwordHash TEXT,
    verified INTEGER DEFAULT 0,
    verificationToken TEXT,
    createdAt INTEGER
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT,
    createdAt INTEGER,
    audioPath TEXT
  )`);
  await dbRun(`CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER,
    text TEXT
  )`);
}
initDb().catch(console.error);

// -------------------------
// Helpers
// -------------------------
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret";
const ACCESS_EXPIRES = process.env.ACCESS_EXPIRES || "15m";

function signAccessToken(user) {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  });
}

function checkPasswordStrength(password) {
  const strength = { score: 0, feedback: [] };
  if (!password || password.length < 8)
    strength.feedback.push("Minimum 8 caractères");
  else strength.score += 1;
  if (/[a-z]/.test(password)) strength.score += 1;
  else strength.feedback.push("Ajouter des minuscules");
  if (/[A-Z]/.test(password)) strength.score += 1;
  else strength.feedback.push("Ajouter des majuscules");
  if (/[0-9]/.test(password)) strength.score += 1;
  else strength.feedback.push("Ajouter des chiffres");
  if (/[^a-zA-Z0-9]/.test(password)) strength.score += 1;
  else strength.feedback.push("Ajouter des caractères spéciaux");
  strength.score = Math.min(strength.score, 5);
  strength.level =
    strength.score >= 4 ? "strong" : strength.score >= 3 ? "medium" : "weak";
  return strength;
}

function generateToken() {
  return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

function authenticateJWT(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer")
    return res.status(401).json({ error: "Invalid authorization header" });
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// -------------------------
// Multer upload
// -------------------------
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// -------------------------
// Routes API
// -------------------------
app.post("/api/check-password-strength", (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "password required" });
  res.json(checkPasswordStrength(password));
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    if (!name || !email || !role || !password)
      return res
        .status(400)
        .json({ error: "name, email, role, password required" });

    const exists = await dbGet(`SELECT * FROM users WHERE email = ?`, [email]);
    if (exists) return res.status(409).json({ error: "Email déjà utilisé" });

    const strength = checkPasswordStrength(password);
    if (strength.score < 3)
      return res.status(400).json({ error: "Mot de passe trop faible" });

    const hash = bcrypt.hashSync(password, 10);
    await dbRun(
      `INSERT INTO users (name,email,role,passwordHash,verified,createdAt) VALUES (?,?,?,?,?,?)`,
      [name, email, role, hash, 1, Date.now()]
    );
    res.json({ ok: true, message: "Inscription réussie" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await dbGet(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) return res.status(401).json({ error: "invalid credentials" });
    if (!bcrypt.compareSync(password, user.passwordHash))
      return res.status(401).json({ error: "invalid credentials" });
    const accessToken = signAccessToken(user);
    res.json({
      ok: true,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ----- GET SUMMARY -----
app.post("/api/get-summary", authenticateJWT, async (req, res) => {
  const { email, sendEmail } = req.body;
  const userEmail = email || "unknown";
  res.json({ ok: true, summary: `Résumé de démonstration pour ${userEmail}.` });
});

// ----- GET MINDMAP -----
app.post("/api/get-mindmap", authenticateJWT, async (req, res) => {
  const { email } = req.body;
  const userEmail = email || "unknown";
  res.json({
    ok: true,
    mindmap: `Carte mentale de démonstration pour ${userEmail}.`,
  });
});

// ----- AUDIO UPLOAD -----
app.post(
  "/api/upload-audio",
  authenticateJWT,
  upload.single("audio"),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no file" });
    res.json({
      ok: true,
      file: {
        path: `/uploads/${req.file.filename}`,
        originalname: req.file.originalname,
      },
    });
  }
);

// ----- SESSIONS -----
app.get("/api/sessions", authenticateJWT, async (req, res) => {
  try {
    const sessions = await dbAll(`SELECT * FROM sessions WHERE userId = ?`, [
      req.user.userId,
    ]);
    res.json({ ok: true, sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessions/:id/transcript", authenticateJWT, async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const transcripts = await dbAll(
      `SELECT * FROM transcripts WHERE sessionId = ?`,
      [sessionId]
    );
    res.json({ ok: true, transcripts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// Serve uploads
// -------------------------
app.use("/uploads", express.static(uploadsDir));

// -------------------------
// Start server
// -------------------------
const server = http.createServer(app);
server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
