(function () {
    "use strict";
  
    const publicPages = [
      "/",
      "/index.html",
      "/login.html",
      "/register.html",
      "/verify-email.html"
    ];
  
    const currentPath = window.location.pathname;
    const isPublicPage = publicPages.includes(currentPath);
  
    const userJson = localStorage.getItem("smartsummary_user");
    const accessToken = localStorage.getItem("smartsummary_accessToken");
  
    const isAuthenticated = userJson && accessToken;
  
    // 🔒 Page protégée → pas connecté
    if (!isPublicPage && !isAuthenticated) {
      console.log("Not authenticated, redirecting to login");
      window.location.href = "/";
      return;
    }
  
    // 🔁 Page publique → déjà connecté → dashboard
    if (isPublicPage && isAuthenticated) {
      console.log("Already authenticated, redirecting to dashboard");
      window.location.href = "/dashboard.html";
      return;
    }
  
    // 🔐 Vérification admin
    if (currentPath.includes("admin.html")) {
      try {
        const user = JSON.parse(userJson);
        if (user.role !== "admin") {
          alert("Accès refusé - Admin uniquement");
          window.location.href = "/dashboard.html";
          return;
        }
      } catch (e) {
        console.error("Error parsing user:", e);
        window.location.href = "/";
      }
    }
  })();
  
