// api.js — API helper functions with JWT authentication
// Safe global API: prevents double declaration and collisions
(function () {
  'use strict';

  // 🔒 Empêche le rechargement ou redéclaration
  if (window.API) return;

  window.API = {};

  // --- Gestion des tokens ---
  API.getAuthTokens = function () {
    const accessToken = localStorage.getItem("smartsummary_accessToken");
    const refreshToken = localStorage.getItem("smartsummary_refreshToken");
    const user = localStorage.getItem("smartsummary_user");
    return { accessToken, refreshToken, user: user ? JSON.parse(user) : null };
  };

  API.setAuthTokens = function (accessToken, refreshToken, user) {
    if (accessToken) localStorage.setItem("smartsummary_accessToken", accessToken);
    if (refreshToken) localStorage.setItem("smartsummary_refreshToken", refreshToken);
    if (user) localStorage.setItem("smartsummary_user", JSON.stringify(user));
  };

  API.clearAuthTokens = function () {
    localStorage.removeItem("smartsummary_accessToken");
    localStorage.removeItem("smartsummary_refreshToken");
    localStorage.removeItem("smartsummary_user");
  };

  // --- Rafraîchissement automatique du token ---
  API.refreshAccessToken = async function () {
    const { refreshToken } = API.getAuthTokens();
    if (!refreshToken) throw new Error("No refresh token available");

    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    const json = await res.json();

    if (!res.ok) {
      API.clearAuthTokens();
      throw new Error(json.error || "Token refresh failed");
    }

    localStorage.setItem("smartsummary_accessToken", json.accessToken);
    return json.accessToken;
  };

  // --- Fetch authentifié avec auto-refresh ---
  API.fetch = async function (url, options = {}) {
    let { accessToken } = API.getAuthTokens();
    if (!accessToken) throw new Error("Not authenticated");

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    // Premier essai avec token actuel
    let res = await fetch(url, {
      ...options,
      headers: { ...headers, Authorization: `Bearer ${accessToken}` },
    });

    // Si 401, tenter de rafraîchir le token
    if (res.status === 401) {
      try {
        accessToken = await API.refreshAccessToken();
        res = await fetch(url, {
          ...options,
          headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // Si échec du refresh, rediriger vers login
        if (window.location.pathname !== "/" && window.location.pathname !== "/index.html") {
          window.location.href = "/";
        }
        throw new Error("Session expired");
      }
    }

    return res;
  };

  // --- Vérification simple de l’authentification ---
  API.isAuthenticated = function () {
    return !!localStorage.getItem("smartsummary_accessToken");
  };

})();


