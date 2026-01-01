// ==========================
// app.js (version complète corrigée)
// ==========================

const API_URL = "http://localhost:3000"; // URL complète de ton serveur Node

// -------------------------
// SIGNUP
// -------------------------
const signupForm = document.getElementById("signupForm");
const signupResult = document.getElementById("signupResult");
const passwordInput = document.getElementById("password");
const passwordStrengthDiv = document.getElementById("passwordStrength");

// Vérification en temps réel de la force du mot de passe
if (passwordInput) {
  passwordInput.addEventListener("input", async () => {
    const password = passwordInput.value;
    if (!password.length) {
      passwordStrengthDiv.classList.remove("show");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/check-password-strength`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const strength = await res.json();
      passwordStrengthDiv.classList.add("show");
      passwordStrengthDiv.className = `password-strength ${strength.level}`;
      const emoji =
        strength.level === "strong"
          ? "✅"
          : strength.level === "medium"
          ? "⚠️"
          : "❌";
      passwordStrengthDiv.textContent = `${emoji} Force: ${strength.level} - ${
        strength.feedback.join(", ") || "Excellent!"
      }`;
    } catch (err) {
      console.error("Erreur vérification mot de passe:", err);
    }
  });
}

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    signupResult.textContent = "Envoi...";
    const data = new FormData(signupForm);
    const payload = {
      name: data.get("name"),
      email: data.get("email"),
      role: data.get("role"),
      organization: data.get("organization"),
      consent: data.get("consent") === "on",
      password: data.get("password"),
    };

    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok)
        throw new Error((json && json.error) || res.statusText || "Erreur");

      // Sauvegarde tokens si renvoyés
      if (json.accessToken)
        localStorage.setItem("smartsummary_accessToken", json.accessToken);
      if (json.refreshToken)
        localStorage.setItem("smartsummary_refreshToken", json.refreshToken);
      if (json.user)
        localStorage.setItem("smartsummary_user", JSON.stringify(json.user));

      signupForm.reset();
      passwordStrengthDiv.classList.remove("show");
      signupResult.textContent = "✅ Inscription réussie ! Redirection...";
      signupResult.className = "result";

      window.location.href = "/dashboard.html";
    } catch (err) {
      signupResult.textContent = "❌ Erreur: " + (err.message || err);
      signupResult.className = "result error";
    }
  });
}

// -------------------------
// LOGIN
// -------------------------
const loginForm = document.getElementById("loginForm");
const loginResult = document.getElementById("loginResult");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginResult.textContent = "Connexion...";
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok)
        throw new Error((json && json.error) || "Erreur de connexion");

      // Sauvegarde des tokens et user
      if (json.accessToken)
        localStorage.setItem("smartsummary_accessToken", json.accessToken);
      if (json.refreshToken)
        localStorage.setItem("smartsummary_refreshToken", json.refreshToken);
      if (json.user)
        localStorage.setItem("smartsummary_user", JSON.stringify(json.user));

      loginResult.textContent = "✅ Connexion réussie ! Redirection...";
      window.location.href = "/dashboard.html";
    } catch (err) {
      loginResult.textContent = "❌ Erreur: " + (err.message || err);
    }
  });
}

// -------------------------
// DASHBOARD
// -------------------------
if (document.getElementById("recordBtn")) {
  let mediaRecorder;
  let audioChunks = [];
  let audioBlob;
  let audioUrl;

  const recordBtn = document.getElementById("recordBtn");
  const stopBtn = document.getElementById("stopBtn");
  const recStatus = document.getElementById("recStatus");
  const playerArea = document.getElementById("playerArea");
  const uploadBtn = document.getElementById("uploadBtn");
  const uploadProgress = document.getElementById("uploadProgress");
  const uploadResult = document.getElementById("uploadResult");

  // Démarrer l'enregistrement
  recordBtn.addEventListener("click", async () => {
    if (!navigator.mediaDevices) {
      alert("Votre navigateur ne supporte pas l'enregistrement audio");
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstart = () => {
      recStatus.textContent = "Enregistrement...";
      recordBtn.disabled = true;
      stopBtn.disabled = false;
    };
    mediaRecorder.onstop = () => {
      audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      audioUrl = URL.createObjectURL(audioBlob);
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = audioUrl;
      playerArea.innerHTML = "";
      playerArea.appendChild(audio);
      uploadBtn.disabled = false;
      recStatus.textContent = "Terminé";
      recordBtn.disabled = false;
      stopBtn.disabled = true;
    };

    mediaRecorder.start();
  });

  // Arrêter l'enregistrement
  stopBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state === "recording")
      mediaRecorder.stop();
  });

  // Upload audio
  uploadBtn.addEventListener("click", async () => {
    if (!audioBlob) return;
    uploadBtn.disabled = true;
    uploadProgress.style.display = "block";
    uploadProgress.value = 0;
    uploadResult.textContent = "Téléversement...";

    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    try {
      const res = await fetch(`${API_URL}/api/upload-audio`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem(
            "smartsummary_accessToken"
          )}`,
        },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur upload");
      uploadResult.textContent = "✅ Audio téléversé avec succès !";
    } catch (err) {
      uploadResult.textContent = "❌ Erreur: " + (err.message || err);
    } finally {
      uploadProgress.style.display = "none";
      uploadBtn.disabled = false;
    }
  });
}

// -------------------------
// GET SUMMARY
// -------------------------
const getSummaryBtn = document.getElementById("getSummary");
if (getSummaryBtn) {
  getSummaryBtn.addEventListener("click", async () => {
    const email = document.getElementById("summaryEmail").value.trim();
    const sendEmail = document.getElementById("sendEmailCheckbox").checked;
    const resultArea = document.getElementById("summaryResult");
    resultArea.textContent = "Génération du résumé...";

    try {
      const res = await fetch(`${API_URL}/api/get-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem(
            "smartsummary_accessToken"
          )}`,
        },
        body: JSON.stringify({ email, sendEmail }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur récupération résumé");
      resultArea.textContent = json.summary || "Aucun résumé disponible";
    } catch (err) {
      resultArea.textContent = "❌ Erreur: " + (err.message || err);
    }
  });
}

// -------------------------
// GET MINDMAP
// -------------------------
const getMindmapBtn = document.getElementById("getMindmap");
if (getMindmapBtn) {
  getMindmapBtn.addEventListener("click", async () => {
    const email = document.getElementById("mindmapEmail").value.trim();
    const resultArea = document.getElementById("mindmapResult");
    resultArea.textContent = "Génération de la carte mentale...";

    try {
      const res = await fetch(`${API_URL}/api/get-mindmap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem(
            "smartsummary_accessToken"
          )}`,
        },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur génération mindmap");
      resultArea.textContent =
        json.mindmap || "Aucune carte mentale disponible";
    } catch (err) {
      resultArea.textContent = "❌ Erreur: " + (err.message || err);
    }
  });
}

// -------------------------
// LOGOUT
// -------------------------
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("smartsummary_accessToken");
    localStorage.removeItem("smartsummary_refreshToken");
    localStorage.removeItem("smartsummary_user");
    window.location.href = "/";
  });
}

// -------------------------
// SHOW CURRENT USER
// -------------------------
const currentUserSpan = document.getElementById("currentUser");
const userJson = localStorage.getItem("smartsummary_user");
if (currentUserSpan && userJson) {
  const user = JSON.parse(userJson);
  currentUserSpan.textContent = `Connecté : ${user.name} (${user.role})`;
  // Show admin link if role=admin
  if (user.role === "admin")
    document.getElementById("adminLink").style.display = "inline";
}
