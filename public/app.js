// app.js
// Frontend logic: signup, login, audio recording, upload and summary demo

const API_URL = "http://localhost:3000"; // <-- URL complète de ton serveur Node

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
      const res = await fetch(`${API_URL}/api/check-password-strength`, {
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
      const res = await fetch(`${API_URL}/api/register`, {
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

      // Redirection directe
      signupForm.reset();
      passwordStrengthDiv.classList.remove("show");
      signupResult.textContent = "✅ Inscription réussie ! Redirection...";
      signupResult.className = "result";

      if (json.accessToken) localStorage.setItem("smartsummary_accessToken", json.accessToken);
      if (json.refreshToken) localStorage.setItem("smartsummary_refreshToken", json.refreshToken);
      if (json.user) localStorage.setItem("smartsummary_user", JSON.stringify(json.user));

      window.location.href = "/dashboard.html";
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
      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur de connexion");

      if (json.accessToken) localStorage.setItem("smartsummary_accessToken", json.accessToken);
      if (json.refreshToken) localStorage.setItem("smartsummary_refreshToken", json.refreshToken);
      localStorage.setItem("smartsummary_user", JSON.stringify(json.user));

      loginResult.textContent = "✅ Connexion réussie ! Redirection...";
      window.location.href = "/dashboard.html";
    } catch (err) {
      loginResult.textContent = "❌ Erreur: " + (err.message || err);
    }
  });
}

// --- Dashboard and other pages logic ---
// Pour toutes les requêtes fetch vers le backend, utiliser `${API_URL}/api/...`
// Exemple : fetch(`${API_URL}/api/me`) pour récupérer l'utilisateur courant
