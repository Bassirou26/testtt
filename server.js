const express = require("express");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const http = require("http");
const { WebSocketServer } = require("ws");
const OpenAI = require("openai");
const PDFDocument = require("pdfkit");

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static
app.use(express.static(path.join(__dirname, "public")));

// Serve index.html for root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ensure uploads directory
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ts = Date.now();
    cb(null, `${ts}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// password strength validation
function checkPasswordStrength(password) {
  const strength = { score: 0, feedback: [] };
  if (!password || password.length < 8) {
    strength.feedback.push("Minimum 8 caractères");
  } else {
    strength.score += 1;
  }
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

// --- SQLite DB init ---
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

  await dbRun(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    token TEXT PRIMARY KEY,
    userId INTEGER,
    expiresAt INTEGER
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    title TEXT,
    createdAt INTEGER,
    audioPath TEXT,
    isMeeting INTEGER DEFAULT 0
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER,
    text TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER,
    type TEXT,
    text TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS quiz (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId INTEGER,
    data TEXT
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT,
    value TEXT
  )`);
}

initDb().catch((err) => console.error("DB init error:", err));

// JWT helpers
const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const ACCESS_EXPIRES = process.env.ACCESS_EXPIRES || "15m";
const REFRESH_EXPIRES_SECONDS = Number(process.env.REFRESH_EXPIRES_SECONDS) || 7 * 24 * 3600; // 7 days

function signAccessToken(user) {
  return jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  });
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

// Auth middleware
function authenticateJWT(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer")
    return res.status(401).json({ error: "Invalid authorization header" });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --- API ---
app.post("/api/check-password-strength", (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "password required" });
  const strength = checkPasswordStrength(password);
  res.json(strength);
});

app.post("/api/register", async (req, res, next) => {
  try {
    const { name, email, role, organization, consent, password } = req.body || {};
    if (!name || !email || !role || !password)
      return res.status(400).json({ error: "name, email, role and password required" });

    const existing = await dbGet(`SELECT * FROM users WHERE email = ?`, [email]);
    if (existing) return res.status(409).json({ error: "Email déjà utilisé" });

    const strength = checkPasswordStrength(password);
    if (strength.score < 3)
      return res.status(400).json({ error: "Mot de passe trop faible: " + strength.feedback.join(", ") });

    const passwordHash = bcrypt.hashSync(String(password), 10);
    const verificationToken = generateToken();

    await dbRun(
      `INSERT INTO users (name, email, role, organization, consent, passwordHash, verified, verificationToken, createdAt) VALUES (?,?,?,?,?,?,?,?,?)`,
      [name, email, role, organization || "", consent ? 1 : 0, passwordHash, 0, verificationToken, Date.now()]
    );

    // send verification email if SMTP configured
    const smtpHost = process.env.SMTP_HOST;
    if (smtpHost) {
      const verifyLink = `${process.env.APP_URL || "http://localhost:3000"}/verify-email.html?token=${verificationToken}&email=${encodeURIComponent(email)}`;
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(process.env.SMTP_PORT || "587", 10),
          secure: String(process.env.SMTP_PORT) === "465",
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transporter.sendMail({
          from: process.env.FROM_EMAIL || process.env.SMTP_USER,
          to: email,
          subject: "Confirmer votre email SmartSummary",
          html: `<p>Cliquez <a href="${verifyLink}">ici</a> pour confirmer votre email.</p>`,
        });
      } catch (mailErr) {
        console.error("Mail send error:", mailErr);
      }
    }

    res.json({ ok: true, message: "Inscription réussie. Vérifiez votre email." });
  } catch (err) {
    next(err);
  }
});

app.post("/api/verify-email", async (req, res) => {
  const { email, token } = req.body || {};
  if (!email || !token) return res.status(400).json({ error: "email and token required" });

  const user = await dbGet(`SELECT * FROM users WHERE email = ?`, [email]);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.verificationToken || user.verificationToken !== token) return res.status(400).json({ error: "Invalid token" });

  await dbRun(`UPDATE users SET verified = 1, verificationToken = NULL WHERE email = ?`, [email]);
  res.json({ ok: true, message: "Email verified successfully" });
});

app.post("/api/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    const user = await dbGet(`SELECT * FROM users WHERE email = ?`, [email]);
    if (!user) return res.status(401).json({ error: "invalid credentials" });
    if (!user.verified) return res.status(403).json({ error: "Email not verified. Check your inbox." });
    const match = bcrypt.compareSync(String(password), user.passwordHash);
    if (!match) return res.status(401).json({ error: "invalid credentials" });

    const accessToken = signAccessToken(user);
    const refreshToken = generateToken();
    const expiresAt = Date.now() + REFRESH_EXPIRES_SECONDS * 1000;
    await saveRefreshToken(refreshToken, user.id, expiresAt);

    res.json({ ok: true, accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

app.post("/api/token", async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });
  const row = await findRefreshToken(refreshToken);
  if (!row) return res.status(401).json({ error: "Invalid refresh token" });
  if (Date.now() > row.expiresAt) {
    await revokeRefreshToken(refreshToken);
    return res.status(401).json({ error: "Refresh token expired" });
  }
  const user = await dbGet(`SELECT * FROM users WHERE id = ?`, [row.userId]);
  if (!user) return res.status(401).json({ error: "User not found" });
  const accessToken = signAccessToken(user);
  res.json({ ok: true, accessToken });
});

app.post("/api/logout", async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) await revokeRefreshToken(refreshToken);
  res.json({ ok: true });
});

app.get("/api/me", authenticateJWT, async (req, res) => {
  const user = await dbGet(`SELECT id, name, email, role FROM users WHERE id = ?`, [req.user.userId]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true, user });
});

app.post("/api/upload-audio", authenticateJWT, upload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  res.json({ ok: true, file: { path: `/uploads/${req.file.filename}`, originalname: req.file.originalname } });
});

// Legacy summary endpoint (kept for backward compatibility)
app.get("/api/summary", authenticateJWT, async (req, res, next) => {
  try {
    const userEmail = req.query.email || "unknown";
    const summaryText = `Résumé de démonstration pour ${userEmail}. Utilisez /api/sessions/:id/summaries pour générer de vrais résumés.`;
    res.json({ ok: true, user: userEmail, summary: summaryText });
  } catch (err) {
    next(err);
  }
});

// serve uploads for download
app.use("/uploads", express.static(uploadsDir));

// Sessions REST endpoints
app.get("/api/sessions", authenticateJWT, async (req, res) => {
  try {
    // students see only their sessions; admin sees all
    if (req.user.role === "admin") {
      const rows = await dbAll(`SELECT id, userId, title, createdAt, audioPath FROM sessions ORDER BY createdAt DESC`);
      return res.json({ ok: true, sessions: rows });
    }
    const rows = await dbAll(`SELECT id, userId, title, createdAt, audioPath FROM sessions WHERE userId = ? ORDER BY createdAt DESC`, [req.user.userId]);
    res.json({ ok: true, sessions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessions/:id", authenticateJWT, async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = await dbGet(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (req.user.role !== "admin" && session.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json({ ok: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessions/:id/transcript", authenticateJWT, async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = await dbGet(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    // permission check
    if (req.user.role !== "admin" && session.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const transcripts = await dbAll(`SELECT id, text FROM transcripts WHERE sessionId = ? ORDER BY id ASC`, [sessionId]);
    res.json({ ok: true, session: { id: session.id, title: session.title, createdAt: session.createdAt, audioPath: session.audioPath }, transcripts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete session
app.delete("/api/sessions/:id", authenticateJWT, async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = await dbGet(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (req.user.role !== "admin" && session.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Delete audio file if exists
    if (session.audioPath) {
      const filePath = path.join(__dirname, session.audioPath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      // Also delete session directory
      const sessionDir = path.join(uploadsDir, `session-${sessionId}`);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }
    // Delete related records
    await dbRun(`DELETE FROM transcripts WHERE sessionId = ?`, [sessionId]);
    await dbRun(`DELETE FROM summaries WHERE sessionId = ?`, [sessionId]);
    await dbRun(`DELETE FROM quiz WHERE sessionId = ?`, [sessionId]);
    await dbRun(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
    res.json({ ok: true, message: "Session deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate summary for a session
app.post("/api/sessions/:id/summaries", authenticateJWT, async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const { type = "detailed", isMeeting = false } = req.body;
    const session = await dbGet(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (req.user.role !== "admin" && session.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Get transcript
    const transcripts = await dbAll(`SELECT text FROM transcripts WHERE sessionId = ? ORDER BY id ASC`, [sessionId]);
    const fullTranscript = transcripts.map((t) => t.text).join(" ");
    if (!fullTranscript) return res.status(400).json({ error: "No transcript available" });

    if (!openai) {
      // Fallback summary
      const summaryText = `Résumé ${type} pour la session "${session.title}": ${fullTranscript.substring(0, 500)}...`;
      await dbRun(`INSERT INTO summaries (sessionId, type, text) VALUES (?,?,?)`, [sessionId, type, summaryText]);
      return res.json({ ok: true, summary: summaryText, type });
    }

    // Generate prompt based on type and context
    let prompt = "";
    if (isMeeting) {
      prompt = `Résume cette réunion professionnelle. Structure ton résumé avec:
- Décisions prises
- Tâches assignées (qui fait quoi)
- Participants mentionnés
- Points d'action
- Prochaines étapes

Transcription:\n${fullTranscript}`;
    } else {
      if (type === "short") {
        prompt = `Résume brièvement ce cours (maximum 150 mots) en identifiant les points clés essentiels.\n\nTranscription:\n${fullTranscript}`;
      } else if (type === "keywords") {
        prompt = `Extrais les mots-clés et concepts principaux de ce cours. Liste-les de manière structurée.\n\nTranscription:\n${fullTranscript}`;
      } else {
        prompt = `Crée un résumé détaillé et structuré de ce cours avec:
- Titre et introduction
- Points clés développés
- Définitions importantes
- Exemples mentionnés
- Conclusion/Points à retenir

Transcription:\n${fullTranscript}`;
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    const summaryText = completion.choices[0]?.message?.content || "Erreur lors de la génération";
    await dbRun(`INSERT INTO summaries (sessionId, type, text) VALUES (?,?,?)`, [sessionId, type, summaryText]);
    res.json({ ok: true, summary: summaryText, type });
  } catch (err) {
    next(err);
  }
});

// Get summaries for a session
app.get("/api/sessions/:id/summaries", authenticateJWT, async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = await dbGet(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (req.user.role !== "admin" && session.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const summaries = await dbAll(`SELECT id, type, text FROM summaries WHERE sessionId = ?`, [sessionId]);
    res.json({ ok: true, summaries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate quiz for a session
app.post("/api/sessions/:id/quiz", authenticateJWT, async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const { numQuestions = 5 } = req.body;
    const session = await dbGet(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (req.user.role !== "admin" && session.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const transcripts = await dbAll(`SELECT text FROM transcripts WHERE sessionId = ? ORDER BY id ASC`, [sessionId]);
    const fullTranscript = transcripts.map((t) => t.text).join(" ");
    if (!fullTranscript) return res.status(400).json({ error: "No transcript available" });

    if (!openai) {
      const mockQuiz = {
        questions: [
          { question: "Question exemple 1?", options: ["A", "B", "C", "D"], correct: 0 },
        ],
      };
      await dbRun(`INSERT INTO quiz (sessionId, data) VALUES (?,?)`, [sessionId, JSON.stringify(mockQuiz)]);
      return res.json({ ok: true, quiz: mockQuiz });
    }

    const prompt = `Crée un quiz de ${numQuestions} questions QCM basé sur cette transcription de cours.
Format JSON exact:
{
  "questions": [
    {
      "question": "Texte de la question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0
    }
  ]
}
Le champ "correct" est l'index (0-3) de la bonne réponse. Réponds UNIQUEMENT avec le JSON, sans texte supplémentaire.

Transcription:\n${fullTranscript}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    let quizData;
    try {
      const content = completion.choices[0]?.message?.content || "{}";
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      quizData = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (parseErr) {
      console.error("Quiz JSON parse error:", parseErr);
      return res.status(500).json({ error: "Failed to parse quiz response" });
    }

    await dbRun(`INSERT INTO quiz (sessionId, data) VALUES (?,?)`, [sessionId, JSON.stringify(quizData)]);
    res.json({ ok: true, quiz: quizData });
  } catch (err) {
    next(err);
  }
});

// Get quiz for a session
app.get("/api/sessions/:id/quiz", authenticateJWT, async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = await dbGet(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (req.user.role !== "admin" && session.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const quizRow = await dbGet(`SELECT data FROM quiz WHERE sessionId = ?`, [sessionId]);
    if (!quizRow) return res.status(404).json({ error: "Quiz not found" });
    const quiz = JSON.parse(quizRow.data);
    res.json({ ok: true, quiz });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate PDF for summary
app.get("/api/sessions/:id/summaries/:summaryId/pdf", authenticateJWT, async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const summaryId = Number(req.params.summaryId);
    const session = await dbGet(`SELECT * FROM sessions WHERE id = ?`, [sessionId]);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (req.user.role !== "admin" && session.userId !== req.user.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const summary = await dbGet(`SELECT * FROM summaries WHERE id = ? AND sessionId = ?`, [summaryId, sessionId]);
    if (!summary) return res.status(404).json({ error: "Summary not found" });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="resume-${sessionId}-${summaryId}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).text(session.title || "Résumé", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Type: ${summary.type || "détaillé"}`, { align: "center" });
    doc.fontSize(10).text(`Date: ${new Date(session.createdAt).toLocaleString("fr-FR")}`, { align: "center" });
    doc.moveDown(2);

    doc.fontSize(12).text(summary.text, { align: "left" });
    doc.end();
  } catch (err) {
    next(err);
  }
});

// Admin: Get all users
app.get("/api/admin/users", authenticateJWT, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const users = await dbAll(`SELECT id, name, email, role, organization, verified, createdAt FROM users ORDER BY createdAt DESC`);
    // Count sessions per user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const sessionCount = await dbGet(`SELECT COUNT(*) as count FROM sessions WHERE userId = ?`, [user.id]);
        return { ...user, sessionCount: sessionCount?.count || 0 };
      })
    );
    res.json({ ok: true, users: usersWithStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete user
app.delete("/api/admin/users/:id", authenticateJWT, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    const userId = Number(req.params.id);
    if (userId === req.user.userId) return res.status(400).json({ error: "Cannot delete yourself" });
    // Delete user sessions and files
    const sessions = await dbAll(`SELECT id, audioPath FROM sessions WHERE userId = ?`, [userId]);
    for (const session of sessions) {
      if (session.audioPath) {
        const filePath = path.join(__dirname, session.audioPath);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        const sessionDir = path.join(uploadsDir, `session-${session.id}`);
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
      }
      await dbRun(`DELETE FROM transcripts WHERE sessionId = ?`, [session.id]);
      await dbRun(`DELETE FROM summaries WHERE sessionId = ?`, [session.id]);
      await dbRun(`DELETE FROM quiz WHERE sessionId = ?`, [session.id]);
    }
    await dbRun(`DELETE FROM sessions WHERE userId = ?`, [userId]);
    await dbRun(`DELETE FROM refresh_tokens WHERE userId = ?`, [userId]);
    await dbRun(`DELETE FROM users WHERE id = ?`, [userId]);
    res.json({ ok: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats endpoint
app.get("/api/stats", authenticateJWT, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      // User stats only
      const sessionCount = await dbGet(`SELECT COUNT(*) as count FROM sessions WHERE userId = ?`, [req.user.userId]);
      const summariesCount = await dbGet(`SELECT COUNT(*) as count FROM summaries s JOIN sessions sess ON s.sessionId = sess.id WHERE sess.userId = ?`, [req.user.userId]);
      res.json({
        ok: true,
        stats: {
          totalSessions: sessionCount?.count || 0,
          totalSummaries: summariesCount?.count || 0,
        },
      });
    } else {
      // Admin stats
      const totalUsers = await dbGet(`SELECT COUNT(*) as count FROM users`);
      const totalSessions = await dbGet(`SELECT COUNT(*) as count FROM sessions`);
      const totalSummaries = await dbGet(`SELECT COUNT(*) as count FROM summaries`);
      const verifiedUsers = await dbGet(`SELECT COUNT(*) as count FROM users WHERE verified = 1`);
      res.json({
        ok: true,
        stats: {
          totalUsers: totalUsers?.count || 0,
          totalSessions: totalSessions?.count || 0,
          totalSummaries: totalSummaries?.count || 0,
          verifiedUsers: verifiedUsers?.count || 0,
          avgSessionsPerUser: totalUsers?.count > 0 ? ((totalSessions?.count || 0) / totalUsers.count).toFixed(2) : 0,
        },
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create HTTP server and WebSocket server for realtime audio
const server = http.createServer(app);

// ensure per-session temp dir
function ensureSessionDir(sessionId) {
  const dir = path.join(uploadsDir, `session-${sessionId}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Assemble chunk files into a single final file
async function assembleChunks(sessionId) {
  const dir = ensureSessionDir(sessionId);
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("chunk-"));
  files.sort((a, b) => {
    const ai = Number(a.split("-")[1]);
    const bi = Number(b.split("-")[1]);
    return ai - bi;
  });
  if (files.length === 0) return null;
  const finalName = `session-${sessionId}-${Date.now()}.webm`;
  const finalPath = path.join(uploadsDir, finalName);
  const out = fs.createWriteStream(finalPath);
  for (const f of files) {
    const chunkPath = path.join(dir, f);
    const data = fs.readFileSync(chunkPath);
    out.write(data);
  }
  out.end();
  // update DB session audioPath
  await dbRun(`UPDATE sessions SET audioPath = ? WHERE id = ?`, [`/uploads/${finalName}`, sessionId]);
  return `/uploads/${finalName}`;
}

// Simple STT stub: generate dummy transcript portions periodically
function startSttSimulation(ws, sessionId) {
  let count = 0;
  const phrases = [
    "Début de la transcription...",
    "Le professeur explique le concept clé.",
    "Exemple important donné ici.",
    "Résumé partiel: point principal.",
  ];
  const iv = setInterval(async () => {
    if (ws.readyState !== ws.OPEN) return clearInterval(iv);
    const text = phrases[count % phrases.length] + ` (${count + 1})`;
    ws.send(JSON.stringify({ type: "transcript", sessionId, partial: true, text }));
    count += 1;
    if (count > 6) {
      ws.send(JSON.stringify({ type: "transcript", sessionId, partial: false, text: "Fin de la transcription (simulée)." }));
      clearInterval(iv);
    }
  }, 2000);
  return iv;
}

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", async (ws, req) => {
  // parse token and sessionId from query
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("sessionId");
  let userId = null;
  try {
    if (!token) throw new Error("Missing token");
    const payload = jwt.verify(token, JWT_SECRET);
    userId = payload.userId;
  } catch (err) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
    ws.close();
    return;
  }

  // state per connection
  let chunkIndex = 0;
  let lastProcessedIndex = 0;
  let currentSessionId = sessionId;
  let sessionDir = currentSessionId ? ensureSessionDir(currentSessionId) : null;
  // If OpenAI configured, we will run periodic partial transcriptions
  let partialTimer = null;
  let sttInterval = null;
  
  // Setup partial transcription timer (will be started after session creation)
  function setupPartialTimer() {
    if (!openai || !sessionDir || !currentSessionId) return null;
    return setInterval(async () => {
      try {
        if (chunkIndex > lastProcessedIndex && currentSessionId) {
          const start = lastProcessedIndex;
          const end = chunkIndex - 1;
          const partialName = `partial-${start}-${end}-${Date.now()}.webm`;
          const partialPath = path.join(sessionDir, partialName);
          const out = fs.createWriteStream(partialPath);
          for (let i = start; i <= end; i++) {
            const p = path.join(sessionDir, `chunk-${i}`);
            if (fs.existsSync(p)) {
              const data = fs.readFileSync(p);
              out.write(data);
            }
          }
          out.end();
          // call OpenAI Whisper for partial transcription
          try {
            const resp = await openai.audio.transcriptions.create({ file: fs.createReadStream(partialPath), model: "whisper-1" });
            const text = resp && resp.text ? resp.text : "";
            if (text && ws.readyState === ws.OPEN && currentSessionId) {
              ws.send(JSON.stringify({ type: "transcript", sessionId: currentSessionId, partial: true, text }));
            }
          } catch (err) {
            console.error("Partial transcription error:", err && err.message ? err.message : err);
          }
          lastProcessedIndex = chunkIndex;
        }
      } catch (err) {
        console.error("Partial timer error:", err && err.stack ? err.stack : err);
      }
    }, 3000);
  }

  if (!openai) {
    sttInterval = startSttSimulation(ws, currentSessionId || "unknown");
  }

  ws.on("message", async (message, isBinary) => {
    try {
      if (isBinary) {
        // write binary chunk to file
        if (!sessionDir || !currentSessionId) return;
        const fname = `chunk-${chunkIndex}`;
        const p = path.join(sessionDir, fname);
        fs.writeFileSync(p, message);
        chunkIndex += 1;
        // optional: send ack
        ws.send(JSON.stringify({ type: "ack", chunk: fname }));
      } else {
        const data = JSON.parse(message.toString());
        if (data && data.type === "finish") {
          // stop partial timer to avoid races
          if (partialTimer) {
            clearInterval(partialTimer);
            partialTimer = null;
          }
          if (sttInterval) {
            clearInterval(sttInterval);
            sttInterval = null;
          }

          // assemble final
          const final = await assembleChunks(currentSessionId);
          ws.send(JSON.stringify({ type: "assembled", path: final }));

          // If OpenAI key present, call Whisper transcription on assembled file
          if (openai && final) {
            try {
              const filePath = path.join(__dirname, final);
              const resp = await openai.audio.transcriptions.create({ file: fs.createReadStream(filePath), model: "whisper-1" });
              const text = resp && resp.text ? resp.text : "";
              // store transcript
              await dbRun(`INSERT INTO transcripts (sessionId, text) VALUES (?,?)`, [currentSessionId, text]);
              // send full transcript to client
              ws.send(JSON.stringify({ type: "transcript", sessionId: currentSessionId, partial: false, text }));
            } catch (transErr) {
              console.error("Transcription error:", transErr);
              ws.send(JSON.stringify({ type: "error", message: "Transcription failed" }));
            }
          } else {
            // fallback simulated transcript
            await dbRun(`INSERT INTO transcripts (sessionId, text) VALUES (?,?)`, [currentSessionId, "Transcription simulée (voir événement realtime)."]);
          }
        }
        if (data && data.type === "metadata") {
          // create session if needed
          if (data.title && !currentSessionId) {
            const r = await dbRun(`INSERT INTO sessions (userId, title, createdAt, isMeeting) VALUES (?,?,?,?)`, [userId, data.title || "Sans titre", Date.now(), data.isMeeting ? 1 : 0]);
            currentSessionId = r.lastID; // Update local sessionId
            sessionDir = ensureSessionDir(currentSessionId);
            // Start partial transcription timer now that we have a session
            if (openai && !partialTimer) {
              partialTimer = setupPartialTimer();
            }
            ws.send(JSON.stringify({ type: "sessionCreated", sessionId: r.lastID }));
          }
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  ws.on("close", () => {
    if (partialTimer) clearInterval(partialTimer);
    if (sttInterval) clearInterval(sttInterval);
  });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err && err.message ? err.message : "Internal Server Error" });
});
