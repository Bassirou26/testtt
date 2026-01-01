// Frontend logic: signup, audio recording, upload and summary demo

// Load API helper if available
let apiFetch, isAuthenticated, getAuthTokens, setAuthTokens, clearAuthTokens;
if (typeof window !== 'undefined') {
  // Will be loaded from api.js if available
}

// --- Signup handling (on index.html) ---
const signupForm = document.getElementById("signupForm");
const signupResult = document.getElementById("signupResult");
const passwordInput = document.getElementById("password");
const passwordStrengthDiv = document.getElementById("passwordStrength");

// Real-time password strength check
if (passwordInput) {
  passwordInput.addEventListener("input", async () => {
    const password = passwordInput.value;
    if (password.length < 1) {
      passwordStrengthDiv.classList.remove("show");
      return;
    }

    try {
      const res = await fetch("/api/check-password-strength", {
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
      console.error("Error checking password:", err);
    }
  });
}

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Final check before submission
    const password = document.getElementById("password").value;
    try {
      const res = await fetch("/api/check-password-strength", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const strength = await res.json();
      if (strength.score < 3) {
        signupResult.textContent = "Erreur: " + strength.feedback.join(", ");
        signupResult.className = "result error";
        return;
      }
    } catch (err) {
      console.error("Error validating password:", err);
    }

    const data = new FormData(signupForm);
    const payload = {
      name: data.get("name"),
      email: data.get("email"),
      role: data.get("role"),
      organization: data.get("organization"),
      consent: data.get("consent") === "on",
      password: data.get("password"),
    };
    signupResult.textContent = "Envoi...";
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json = null;
      try {
        json = await res.json();
      } catch (parseErr) {
        json = null;
      }
      if (!res.ok)
        throw new Error((json && json.error) || res.statusText || "Erreur");
      signupResult.textContent =
        "✅ Inscription réussie! Vérifiez votre email pour confirmer votre compte.";
      signupResult.className = "result";
      signupForm.reset();
      passwordStrengthDiv.classList.remove("show");
    } catch (err) {
      signupResult.textContent = "❌ Erreur: " + (err.message || err);
      signupResult.className = "result error";
    }
  });
}

// --- Login handling (on index.html) ---
const loginForm = document.getElementById("loginForm");
const loginResult = document.getElementById("loginResult");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    loginResult.textContent = "Connexion...";
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur de connexion");
      // save tokens and user to localStorage
      if (json.accessToken) localStorage.setItem("smartsummary_accessToken", json.accessToken);
      if (json.refreshToken) localStorage.setItem("smartsummary_refreshToken", json.refreshToken);
      localStorage.setItem("smartsummary_user", JSON.stringify(json.user));
      window.location.href = "/dashboard.html";
    } catch (err) {
      loginResult.textContent = "Erreur: " + (err.message || err);
    }
  });
}

// Recorder (shared by dashboard.html when present)
let mediaRecorder;
let recordedChunks = [];
const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const recStatus = document.getElementById("recStatus");
const playerArea = document.getElementById("playerArea");
const uploadBtn = document.getElementById("uploadBtn");
const uploadProgress = document.getElementById("uploadProgress");
const uploadResult = document.getElementById("uploadResult");

recordBtn.addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Enregistrement non supporté par votre navigateur");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstart = () => {
      recStatus.textContent = "Enregistrement...";
      recordBtn.disabled = true;
      stopBtn.disabled = false;
    };
    mediaRecorder.onstop = () => {
      recStatus.textContent = "Enregistrement arrêté";
      recordBtn.disabled = false;
      stopBtn.disabled = true;
      renderAudio();
    };
    mediaRecorder.start();
  } catch (err) {
    alert("Impossible d'enregistrer le micro: " + err);
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
});

function renderAudio() {
  playerArea.innerHTML = "";
  const blob = new Blob(recordedChunks, { type: "audio/webm" });
  const url = URL.createObjectURL(blob);
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.src = url;
  playerArea.appendChild(audio);
  uploadBtn.disabled = false;
  uploadBtn.onclick = () => uploadAudio(blob);
}

async function uploadAudio(blob) {
  uploadResult.textContent = "";
  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");
  uploadProgress.style.display = "block";
  uploadProgress.value = 0;

  const accessToken = localStorage.getItem("smartsummary_accessToken");
  if (!accessToken) {
    uploadResult.textContent = "Erreur: Non authentifié";
    uploadProgress.style.display = "none";
    return;
  }

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload-audio");
  xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      uploadProgress.value = percent;
    }
  };
  xhr.onload = () => {
    uploadProgress.style.display = "none";
    if (xhr.status >= 200 && xhr.status < 300) {
      const json = JSON.parse(xhr.responseText);
      uploadResult.textContent =
        "Téléversement réussi: " + (json.file?.path || "OK");
    } else if (xhr.status === 401) {
      uploadResult.textContent = "Erreur: Session expirée. Veuillez vous reconnecter.";
      setTimeout(() => window.location.href = "/", 2000);
    } else {
      uploadResult.textContent = "Erreur téléversement";
    }
  };
  xhr.onerror = () => {
    uploadProgress.style.display = "none";
    uploadResult.textContent = "Erreur réseau";
  };
  xhr.send(formData);
}

// Summary retrieval
const getSummaryBtn = document.getElementById("getSummary");
const summaryEmail = document.getElementById("summaryEmail");
const summaryResult = document.getElementById("summaryResult");
if (getSummaryBtn) {
  getSummaryBtn.addEventListener("click", async () => {
    const email = summaryEmail.value.trim();
    if (!email) return alert("Entrez un email");
    const sendEmail = document.getElementById("sendEmailCheckbox")?.checked;
    summaryResult.textContent = "Chargement...";
    try {
      const res = await fetch(
        `/api/summary?email=${encodeURIComponent(email)}&sendEmail=${
          sendEmail ? "true" : "false"
        }`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      summaryResult.textContent = JSON.stringify(json, null, 2);

      // Save to localStorage
      const userJson = localStorage.getItem("smartsummary_user");
      if (userJson) {
        const user = JSON.parse(userJson);
        const allSummaries = JSON.parse(
          localStorage.getItem("smartsummary_summaries") || "[]"
        );
        const newSummary = {
          id: Date.now(),
          userEmail: user.email,
          title: `Résumé du ${new Date().toLocaleString("fr-FR")}`,
          content: json.summary,
          createdAt: new Date().toISOString(),
        };
        allSummaries.push(newSummary);
        localStorage.setItem(
          "smartsummary_summaries",
          JSON.stringify(allSummaries)
        );

        // Auto-redirect to summaries page
        setTimeout(() => {
          window.location.href = "/summaries.html";
        }, 1500);
      }
    } catch (err) {
      summaryResult.textContent = "Erreur: " + err.message;
    }
  });
}

// --- Dashboard auth helpers ---
const currentUserSpan = document.getElementById("currentUser");
const logoutBtn = document.getElementById("logoutBtn");
if (currentUserSpan) {
  const userJson = localStorage.getItem("smartsummary_user");
  if (userJson) {
    try {
      const user = JSON.parse(userJson);
      currentUserSpan.textContent = user.name + " (" + user.email + ")";
    } catch (e) {
      console.error("Error parsing user:", e);
    }
  }
}
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    const { refreshToken } = JSON.parse(localStorage.getItem("smartsummary_user") || "{}");
    // Call logout API
    try {
      const tokens = { refreshToken: localStorage.getItem("smartsummary_refreshToken") };
      if (tokens.refreshToken) {
        await fetch("/api/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tokens),
        });
      }
    } catch (err) {
      console.error("Logout error:", err);
    }
    // Clear all auth data
    localStorage.removeItem("smartsummary_accessToken");
    localStorage.removeItem("smartsummary_refreshToken");
    localStorage.removeItem("smartsummary_user");
    window.location.href = "/";
  });
}

// Mindmap retrieval
const getMindmapBtn = document.getElementById("getMindmap");
const mindmapEmail = document.getElementById("mindmapEmail");
const mindmapResult = document.getElementById("mindmapResult");
if (getMindmapBtn) {
  getMindmapBtn.addEventListener("click", async () => {
    const email = mindmapEmail.value.trim();
    if (!email) return alert("Entrez un email");
    mindmapResult.textContent = "Génération...";
    try {
      // For now, generate a placeholder mindmap. In production, call an NLP service.
      const placeholderMindmap = `
Carte mentale - ${new Date().toLocaleString("fr-FR")}

Concepts Clés:
├── Sujet Principal
│   ├── Concept 1
│   │   ├── Point A
│   │   └── Point B
│   └── Concept 2
│       ├── Point X
│       └── Point Y
├── Thème 2
│   ├── Idée 1
│   ├── Idée 2
│   └── Idée 3
└── Conclusions
    ├── Apprentissage 1
    └── Apprentissage 2
      `;
      mindmapResult.textContent = placeholderMindmap;

      // Save to localStorage
      const userJson = localStorage.getItem("smartsummary_user");
      if (userJson) {
        const user = JSON.parse(userJson);
        const allMindmaps = JSON.parse(
          localStorage.getItem("smartsummary_mindmaps") || "[]"
        );
        const newMindmap = {
          id: Date.now(),
          userEmail: user.email,
          title: `Carte mentale du ${new Date().toLocaleString("fr-FR")}`,
          content: placeholderMindmap,
          createdAt: new Date().toISOString(),
        };
        allMindmaps.push(newMindmap);
        localStorage.setItem(
          "smartsummary_mindmaps",
          JSON.stringify(allMindmaps)
        );

        // Auto-redirect to mindmaps page
        setTimeout(() => {
          window.location.href = "/mindmaps.html";
        }, 1500);
      }
    } catch (err) {
      mindmapResult.textContent = "Erreur: " + err.message;
    }
  });
}
