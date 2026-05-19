const BRIDGE_URL = "http://127.0.0.1:27842";

const PLATFORMS = {
  "twitter.com": "x",
  "x.com": "x",
  "bsky.app": "bluesky",
  "deviantart.com": "deviantart",
  "civitai.com": "civitai",
  "civitai.red": "civitai",
};

const PLATFORM_LABELS = {
  x: "𝕏  Twitter / X",
  bluesky: "🦋 Bluesky",
  deviantart: "🎨 DeviantArt",
  civitai: "⚙️ CivitAI",
};

let currentTab = null;
let currentTarget = null;
// After injection: { imageIds: string[], targetId: string }
let pendingPost = null;

const dot = document.getElementById("status-dot");
const badge = document.getElementById("platform-badge");
const imageInfo = document.getElementById("image-info");
const injectBtn = document.getElementById("inject-btn");
const markSection = document.getElementById("mark-section");
const markBtn = document.getElementById("mark-btn");
const msg = document.getElementById("msg");

function setMsg(text, type = "") {
  msg.textContent = text;
  msg.className = `msg ${type}`;
}

function showImageInfo(text, hint = "") {
  imageInfo.innerHTML = `<div class="filename">${text}</div>${hint ? `<div class="hint">${hint}</div>` : ""}`;
}

function targetFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return PLATFORMS[host] ?? null;
  } catch { return null; }
}

async function checkStatus() {
  try {
    const res = await fetch(`${BRIDGE_URL}/status`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    dot.className = "status-dot connected";
    dot.title = `Connected — Crosspost Helper v${data.version}`;
    return true;
  } catch {
    dot.className = "status-dot error";
    dot.title = "App not running";
    showImageInfo("App is not running", "Start Crosspost Helper first");
    return false;
  }
}

// Load the app-selected queue for the current platform and show it in the popup.
async function loadQueue(target) {
  try {
    const res = await fetch(`${BRIDGE_URL}/queue?target=${encodeURIComponent(target)}`);
    const data = await res.json().catch(() => ({}));
    const images = data.images ?? [];
    if (images.length === 0) {
      // Fall back to showing a random next image so the extension still works
      // even without an explicit selection from the app.
      const r2 = await fetch(`${BRIDGE_URL}/next-image?target=${encodeURIComponent(target)}`);
      if (r2.ok) {
        const img = await r2.json();
        showImageInfo(img.filename, `Random — no app selection for ${PLATFORM_LABELS[target] ?? target}`);
        injectBtn.disabled = false;
        injectBtn.textContent = "Inject 1 image";
      } else {
        showImageInfo("No images queued", "Select images in the app first");
        injectBtn.disabled = true;
        injectBtn.textContent = "Inject images";
      }
      return;
    }
    const names = images.map((i) => i.filename).join(", ");
    const label = `${PLATFORM_LABELS[target] ?? target}  ·  max ${data.limit}`;
    showImageInfo(
      `${images.length} image(s) queued`,
      `${label}\n${names.length > 80 ? names.slice(0, 80) + "…" : names}`,
    );
    injectBtn.disabled = false;
    injectBtn.textContent = `Inject ${images.length} image${images.length > 1 ? "s" : ""}`;
  } catch {
    showImageInfo("Could not load queue", "Check that the app is running");
    injectBtn.disabled = true;
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  currentTarget = targetFromUrl(tab?.url ?? "");

  if (currentTarget) {
    badge.textContent = PLATFORM_LABELS[currentTarget] ?? currentTarget;
    badge.className = "platform-badge active";
  } else {
    badge.textContent = "— not a supported page —";
    injectBtn.disabled = true;
    injectBtn.textContent = "Inject images";
    setMsg("Open X, Bluesky, DeviantArt, or CivitAI");
  }

  const alive = await checkStatus();
  if (alive && currentTarget) await loadQueue(currentTarget);
}

injectBtn.addEventListener("click", async () => {
  if (!currentTab || !currentTarget) return;
  injectBtn.disabled = true;
  setMsg("Injecting…");
  markSection.className = "";

  chrome.tabs.sendMessage(currentTab.id, { type: "INJECT_IMAGE", target: currentTarget }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      setMsg("Could not reach the page. Reload and try again.", "error");
      injectBtn.disabled = false;
      return;
    }
    if (!resp.ok) {
      setMsg(resp.error ?? "Injection failed", "error");
      injectBtn.disabled = false;
      return;
    }
    // resp may carry imageIds[] (multi) or single imageId (legacy)
    pendingPost = {
      imageIds: resp.imageIds ?? (resp.imageId ? [resp.imageId] : []),
      targetId: resp.targetId,
    };
    const count = pendingPost.imageIds.length;
    setMsg(`${count} image${count > 1 ? "s" : ""} ready — submit the post, then click below`, "success");
    markSection.className = "visible";
  });
});

markBtn.addEventListener("click", async () => {
  if (!pendingPost) return;
  markBtn.disabled = true;
  try {
    // Batch mark all injected images as posted.
    const res = await fetch(`${BRIDGE_URL}/mark-all-posted`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pendingPost),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Clear the server-side queue so the app knows it was consumed.
    await fetch(`${BRIDGE_URL}/clear-queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: currentTarget }),
    });
    setMsg(`✓ Marked ${pendingPost.imageIds.length} image(s) as posted`, "success");
    markSection.className = "";
    pendingPost = null;
    injectBtn.textContent = "Inject images";
    // Refresh queue display
    if (currentTarget) await loadQueue(currentTarget);
  } catch (err) {
    setMsg(err.message, "error");
    markBtn.disabled = false;
  }
});

init();
