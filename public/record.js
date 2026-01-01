// Real-time recording with WebSocket

const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const recStatus = document.getElementById("recStatus");
const transcriptArea = document.getElementById("transcriptArea");
const sessionTitleInput = document.getElementById("sessionTitle");
const isMeetingModeCheck = document.getElementById("isMeetingMode");
const sessionInfo = document.getElementById("sessionInfo");
const sessionIdSpan = document.getElementById("sessionId");
const currentUserSpan = document.getElementById("currentUser");
const logoutBtn = document.getElementById("logoutBtn");

let mediaRecorder;
let mediaStream;
let ws = null;
let sessionId = null;
let isRecording = false;
let transcriptBuffer = [];

// Check auth
const userJson = localStorage.getItem("smartsummary_user");
if (!userJson) {
  window.location.href = "/";
} else {
  const user = JSON.parse(userJson);
  currentUserSpan.textContent = user.name + " (" + user.email + ")";
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    const refreshToken = localStorage.getItem("smartsummary_refreshToken");
    try {
      if (refreshToken) {
        await fetch("/api/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch (err) {
      console.error("Logout error:", err);
    }
    localStorage.removeItem("smartsummary_accessToken");
    localStorage.removeItem("smartsummary_refreshToken");
    localStorage.removeItem("smartsummary_user");
    window.location.href = "/";
  });
}

function connectWebSocket() {
  const accessToken = localStorage.getItem("smartsummary_accessToken");
  if (!accessToken) {
    alert("Non authentifié");
    window.location.href = "/";
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(accessToken)}${sessionId ? `&sessionId=${sessionId}` : ""}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
    recStatus.textContent = "Connecté";
    if (!sessionId && sessionTitleInput.value.trim()) {
      ws.send(JSON.stringify({
        type: "metadata",
        title: sessionTitleInput.value.trim(),
        isMeeting: isMeetingModeCheck.checked,
      }));
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "sessionCreated") {
        sessionId = data.sessionId;
        sessionIdSpan.textContent = sessionId;
        sessionInfo.style.display = "block";
      } else if (data.type === "transcript") {
        if (data.partial) {
          // Update last partial transcript
          transcriptBuffer = transcriptBuffer.filter((t) => !t.partial);
          transcriptBuffer.push({ text: data.text, partial: true });
        } else {
          // Final transcript
          transcriptBuffer = transcriptBuffer.filter((t) => !t.partial);
          transcriptBuffer.push({ text: data.text, partial: false });
        }
        updateTranscriptDisplay();
      } else if (data.type === "assembled") {
        recStatus.textContent = "Enregistrement finalisé";
        stopBtn.disabled = true;
        recordBtn.disabled = false;
        isRecording = false;
        if (data.path) {
          transcriptArea.innerHTML += `<p style="color: var(--success); margin-top: 1rem;"><strong>✅ Enregistrement sauvegardé</strong></p>`;
          setTimeout(() => {
            window.location.href = `/session.html?id=${sessionId}`;
          }, 2000);
        }
      } else if (data.type === "error") {
        alert("Erreur: " + data.message);
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    recStatus.textContent = "Erreur de connexion";
  };

  ws.onclose = () => {
    console.log("WebSocket closed");
    if (isRecording) {
      recStatus.textContent = "Connexion fermée - Réessayez";
    }
  };
}

function updateTranscriptDisplay() {
  const fullText = transcriptBuffer.map((t) => t.text).join(" ");
  transcriptArea.innerHTML = fullText
    ? `<div style="white-space: pre-wrap;">${fullText}</div>`
    : `<p style="color: var(--text-secondary); font-style: italic;">La transcription apparaîtra ici en temps réel...</p>`;
  transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

recordBtn.addEventListener("click", async () => {
  if (!sessionTitleInput.value.trim()) {
    alert("Veuillez entrer un titre pour la session");
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Enregistrement non supporté par votre navigateur");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType: "audio/webm",
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data);
      }
    };

    mediaRecorder.onstart = () => {
      recStatus.textContent = "Enregistrement en cours...";
      recordBtn.disabled = true;
      stopBtn.disabled = false;
      isRecording = true;
      transcriptArea.innerHTML = `<p style="color: var(--text-secondary); font-style: italic;">En attente de transcription...</p>`;
      connectWebSocket();
    };

    mediaRecorder.onstop = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "finish" }));
      }
      mediaStream.getTracks().forEach((track) => track.stop());
    };

    // Record in chunks every 1 second
    mediaRecorder.start(1000);
  } catch (err) {
    alert("Impossible d'accéder au micro: " + err.message);
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    recStatus.textContent = "Finalisation...";
    stopBtn.disabled = true;
  }
});

