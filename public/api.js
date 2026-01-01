// API helper functions with JWT authentication

// Get stored auth tokens
function getAuthTokens() {
  const accessToken = localStorage.getItem("smartsummary_accessToken");
  const refreshToken = localStorage.getItem("smartsummary_refreshToken");
  const user = localStorage.getItem("smartsummary_user");
  return { accessToken, refreshToken, user: user ? JSON.parse(user) : null };
}

// Set auth tokens
function setAuthTokens(accessToken, refreshToken, user) {
  if (accessToken) localStorage.setItem("smartsummary_accessToken", accessToken);
  if (refreshToken) localStorage.setItem("smartsummary_refreshToken", refreshToken);
  if (user) localStorage.setItem("smartsummary_user", JSON.stringify(user));
}

// Clear auth tokens
function clearAuthTokens() {
  localStorage.removeItem("smartsummary_accessToken");
  localStorage.removeItem("smartsummary_refreshToken");
  localStorage.removeItem("smartsummary_user");
}

// Refresh access token
async function refreshAccessToken() {
  const { refreshToken } = getAuthTokens();
  if (!refreshToken) throw new Error("No refresh token");

  try {
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Token refresh failed");
    localStorage.setItem("smartsummary_accessToken", json.accessToken);
    return json.accessToken;
  } catch (err) {
    clearAuthTokens();
    throw err;
  }
}

// Authenticated fetch with auto token refresh
async function apiFetch(url, options = {}) {
  let { accessToken } = getAuthTokens();
  if (!accessToken) throw new Error("Not authenticated");

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Try with current token
  let res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // If 401, try refreshing token
  if (res.status === 401) {
    try {
      accessToken = await refreshAccessToken();
      res = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (err) {
      // Redirect to login if refresh fails
      if (window.location.pathname !== "/" && window.location.pathname !== "/index.html") {
        window.location.href = "/";
      }
      throw err;
    }
  }

  return res;
}

// Check if user is authenticated
function isAuthenticated() {
  return !!localStorage.getItem("smartsummary_accessToken");
}

