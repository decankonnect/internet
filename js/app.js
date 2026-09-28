import { IPService } from "./ip-service.js";
import { HistoryManager } from "./history.js";
import { ResultFormatter, SpeedTestEngine } from "./speed-test.js";
import { ThreeBackground } from "./three-background.js";

// Production configuration: set these values to real endpoints under your control.
// The frontend is intentionally separated from the speed-test backend so it can work
// with your own HTTPS server/CDN origin that supports CORS, cache-busting, large test files,
// and upload handling. If no real backend is configured, the app shows a clear configuration
// message instead of fake results.
const SPEED_TEST_CONFIG = {
  downloadEndpoints: [
    "http://localhost:8000/api/download?size=10485760",
    "http://localhost:8000/api/download?size=15728640",
  ],
  uploadEndpoint: "http://localhost:8000/api/upload",
  latencyEndpoint: "http://localhost:8000/api/ping",
  ipEndpoint: "http://localhost:8000/api/ip",
};

class UIController {
  constructor() {
    this.historyManager = new HistoryManager();
    this.ipService = new IPService(SPEED_TEST_CONFIG.ipEndpoint);
    this.engine = new SpeedTestEngine(SPEED_TEST_CONFIG);
    this.threeBackground = new ThreeBackground("three-bg");
    this.isRunning = false;
    this.currentGaugeValue = 0;
    this.animationFrame = null;

    this.bindElements();
    this.bindEvents();
    this.loadPublicIp();
    this.updateConnectionDetails();
    this.renderHistory();
    this.initOnlineStatus();
    this.threeBackground.init();
    this.updateGaugeVisual(0, 0, true);
  }

  bindElements() {
    this.publicIpValue = document.getElementById("public-ip-value");
    this.copyIpBtn = document.getElementById("copy-ip-btn");
    this.startTestBtn = document.getElementById("start-test-btn");
    this.statusBanner = document.getElementById("status-banner");
    this.gauge = document.getElementById("gauge");
    this.gaugeRing = document.getElementById("gauge-ring");
    this.speedValue = document.getElementById("speed-value");
    this.speedUnit = document.getElementById("speed-unit");
    this.phase = document.getElementById("current-phase");
    this.pingValue = document.getElementById("ping-value");
    this.uploadPreview = document.getElementById("upload-preview");
    this.resultsSection = document.getElementById("results-section");
    this.downloadValue = document.getElementById("download-value");
    this.downloadUnit = document.getElementById("download-unit");
    this.downloadDescription = document.getElementById("download-description");
    this.uploadValue = document.getElementById("upload-value");
    this.uploadUnit = document.getElementById("upload-unit");
    this.uploadDescription = document.getElementById("upload-description");
    this.pingResultValue = document.getElementById("ping-result-value");
    this.pingDescription = document.getElementById("ping-description");
    this.jitterValue = document.getElementById("jitter-value");
    this.jitterDescription = document.getElementById("jitter-description");
    this.historyList = document.getElementById("history-list");
    this.clearHistoryBtn = document.getElementById("clear-history-btn");
    this.toggleConnectionDetailsBtn = document.getElementById("toggle-connection-details");
    this.connectionDetailsContent = document.getElementById("connection-details-content");
    this.networkType = document.getElementById("network-type");
    this.effectiveType = document.getElementById("effective-type");
    this.downlinkEstimate = document.getElementById("downlink-estimate");
    this.rttEstimate = document.getElementById("rtt-estimate");
    this.onlineStatus = document.getElementById("online-status");
  }

  bindEvents() {
    this.copyIpBtn.addEventListener("click", () => this.copyIp());
    this.startTestBtn.addEventListener("click", () => this.startTest());
    this.clearHistoryBtn.addEventListener("click", () => this.clearHistory());
    this.toggleConnectionDetailsBtn.addEventListener("click", () => this.toggleConnectionDetails());

    this.engine.addEventListener("phase", (event) => {
      this.setPhase(event.detail || "Preparing test...");
    });

    this.engine.addEventListener("progress", (event) => {
      const progress = Number(event.detail ?? 0);
      this.updateGaugeVisual(progress, this.currentGaugeValue, false);
    });

    this.engine.addEventListener("error", (event) => {
      const error = event.detail;
      this.handleFailure(error);
    });

    this.engine.addEventListener("result", (event) => {
      this.handleResult(event.detail);
    });

    window.addEventListener("online", () => this.handleConnectivityChange(true));
    window.addEventListener("offline", () => this.handleConnectivityChange(false));
  }

  async loadPublicIp() {
    const result = await this.ipService.fetchPublicIp();
    if (result.value && result.value !== "Unable to determine public IP") {
      this.publicIpValue.textContent = result.value;
      this.publicIpValue.dataset.ip = result.value;
    } else {
      this.publicIpValue.textContent = "Unable to determine public IP";
    }
  }

  async copyIp() {
    const ip = this.publicIpValue.dataset.ip || this.publicIpValue.textContent;
    if (!ip || ip === "Loading..." || ip === "Unable to determine public IP") {
      this.setStatus("Public IP is not available right now.", "error");
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(ip);
      } else {
        const tempInput = document.createElement("input");
        tempInput.value = ip;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        tempInput.remove();
      }

      const previousText = this.copyIpBtn.textContent;
      this.copyIpBtn.textContent = "Copied!";
      this.copyIpBtn.classList.add("is-copied");
      this.setStatus("Public IP copied to clipboard.", "success");

      setTimeout(() => {
        this.copyIpBtn.textContent = "Copy IP";
        this.copyIpBtn.classList.remove("is-copied");
      }, 1800);
    } catch (error) {
      this.setStatus("Clipboard access is unavailable in this browser.", "error");
    }
  }

  setStatus(message, type = "") {
    this.statusBanner.hidden = false;
    this.statusBanner.textContent = message;
    this.statusBanner.classList.remove("error", "success");
    if (type) {
      this.statusBanner.classList.add(type);
    }
  }

  clearStatus() {
    this.statusBanner.hidden = true;
    this.statusBanner.textContent = "";
    this.statusBanner.classList.remove("error", "success");
  }

  async startTest() {
    if (this.isRunning) {
      return;
    }

    if (!navigator.onLine) {
      this.setStatus("You're currently offline. Connect to the internet to run a speed test.", "error");
      return;
    }

    if (!SPEED_TEST_CONFIG.downloadEndpoints.length || !SPEED_TEST_CONFIG.uploadEndpoint || !SPEED_TEST_CONFIG.latencyEndpoint) {
      this.handleFailure(new Error("Speed-test backend is not configured yet."));
      return;
    }

    this.isRunning = true;
    this.startTestBtn.disabled = true;
    this.startTestBtn.textContent = "TESTING...";
    this.clearStatus();
    this.resultsSection.classList.add("hidden");
    this.setPhase("Preparing test...");
    this.currentGaugeValue = 0;
    this.updateGaugeVisual(0, 0, true);

    try {
      await this.engine.run();
    } finally {
      this.isRunning = false;
      this.startTestBtn.disabled = false;
      this.startTestBtn.textContent = "TEST AGAIN";
    }
  }

  setPhase(label) {
    this.phase.textContent = label || "Preparing test...";
  }

  updateGaugeVisual(valuePercent, previousValue, immediate = false) {
    const targetPercent = Math.min(Math.max(Number(valuePercent) || 0, 0), 100);
    const start = previousValue || 0;
    const duration = immediate ? 0 : 320;

    if (immediate) {
      this.currentGaugeValue = targetPercent;
      this.gaugeRing.style.setProperty("--progress", `${targetPercent}%`);
      return;
    }

    cancelAnimationFrame(this.animationFrame);

    const startTime = performance.now();
    const animate = (now) => {
      const elapsed = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = start + (targetPercent - start) * eased;
      this.currentGaugeValue = next;
      this.gaugeRing.style.setProperty("--progress", `${next}%`);

      if (elapsed < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  handleFailure(error) {
    const message = error && error.message
      ? error.message
      : "Connection test unavailable";

    const friendly = message.includes("configured")
      ? "The speed-test backend needs to be configured before running a real download/upload test."
      : "We couldn't reach the speed-test server. Please try again.";

    this.setStatus(friendly, "error");
    this.setPhase("Connection test unavailable");
    this.startTestBtn.disabled = false;
    this.startTestBtn.textContent = "START TEST";
    this.isRunning = false;
    this.currentGaugeValue = 0;
    this.updateGaugeVisual(0, this.currentGaugeValue, true);
    this.speedValue.textContent = "0";
    this.speedUnit.textContent = "Mbps";
    this.pingValue.textContent = "--";
    this.uploadPreview.textContent = "--";
    this.resultsSection.classList.add("hidden");
  }

  handleResult(result) {
    const downloadBits = Number(result.download?.bitsPerSecond ?? 0);
    const uploadBits = Number(result.upload?.bitsPerSecond ?? 0);
    const pingAverage = Number(result.latency?.averageMs ?? 0);
    const jitterValue = Number(result.latency?.jitterMs ?? 0);

    const formattedDownload = ResultFormatter.formatBits(downloadBits);
    const formattedUpload = ResultFormatter.formatBits(uploadBits);
    const formattedBytes = ResultFormatter.formatBytes(downloadBits / 8);

    this.speedValue.textContent = formattedDownload.value.toFixed(formattedDownload.value >= 100 ? 0 : 2);
    this.speedUnit.textContent = formattedDownload.unit;
    this.phase.textContent = "Test complete";
    this.pingValue.textContent = `${Math.round(pingAverage)} ms`;
    this.uploadPreview.textContent = formattedUpload.text;

    this.downloadValue.textContent = formattedDownload.value.toFixed(formattedDownload.value >= 100 ? 0 : 2);
    this.downloadUnit.textContent = formattedDownload.unit;
    this.downloadDescription.textContent = `${formattedBytes.text} approx. file transfer rate`;

    this.uploadValue.textContent = formattedUpload.value.toFixed(formattedUpload.value >= 100 ? 0 : 2);
    this.uploadUnit.textContent = formattedUpload.unit;
    this.uploadDescription.textContent = "Upload throughput from the live test";

    this.pingResultValue.textContent = `${Math.round(pingAverage)}`;
    this.pingDescription.textContent = `${this.getLatencyQuality(pingAverage)} connection quality`;

    this.jitterValue.textContent = `${Math.round(jitterValue)}`;
    this.jitterDescription.textContent = `${this.getJitterQuality(jitterValue)} network stability`;

    const maxSpeed = Math.max(downloadBits, uploadBits, 1);
    const progressPercent = Math.min((downloadBits / maxSpeed) * 100, 100);
    this.updateGaugeVisual(progressPercent, this.currentGaugeValue, false);

    this.resultsSection.classList.remove("hidden");

    const entry = {
      download: downloadBits,
      upload: uploadBits,
      ping: pingAverage,
      jitter: jitterValue,
    };

    this.historyManager.add(entry);
    this.renderHistory();
    this.setStatus("Test complete. Your results are ready.", "success");
  }

  getLatencyQuality(value) {
    if (value <= 40) return "Excellent";
    if (value <= 90) return "Good";
    if (value <= 150) return "Moderate";
    return "High latency";
  }

  getJitterQuality(value) {
    if (value <= 10) return "Stable";
    if (value <= 25) return "Moderate";
    return "Variable";
  }

  renderHistory() {
    const items = this.historyManager.get();
    if (!items.length) {
      this.historyList.innerHTML = '<li class="empty-state">No recent speed tests yet.</li>';
      return;
    }

    this.historyList.innerHTML = items
      .map((entry) => {
        const date = new Date(entry.timestamp);
        const formattedDate = date.toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });

        return `
          <li class="history-item">
            <span class="history-date">${formattedDate}</span>
            <span class="metric"><span class="metric-arrow">↓</span> ${ResultFormatter.formatBits(entry.download).value.toFixed(1)} ${ResultFormatter.formatBits(entry.download).unit}</span>
            <span class="metric"><span class="metric-arrow">↑</span> ${ResultFormatter.formatBits(entry.upload).value.toFixed(1)} ${ResultFormatter.formatBits(entry.upload).unit}</span>
            <span class="metric"><span class="metric-arrow">◉</span> ${Math.round(entry.ping)} ms</span>
            <span class="metric"><span class="metric-arrow">◌</span> ${Math.round(entry.jitter)} ms</span>
          </li>
        `;
      })
      .join("");
  }

  clearHistory() {
    this.historyManager.clear();
    this.renderHistory();
  }

  toggleConnectionDetails() {
    const expanded = this.toggleConnectionDetailsBtn.getAttribute("aria-expanded") === "true";
    this.toggleConnectionDetailsBtn.setAttribute("aria-expanded", String(!expanded));
    this.connectionDetailsContent.hidden = expanded;
  }

  updateConnectionDetails() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const online = navigator.onLine;

    this.onlineStatus.textContent = online ? "Online" : "Offline";

    if (!connection) {
      this.networkType.textContent = "Unavailable";
      this.effectiveType.textContent = "Unavailable";
      this.downlinkEstimate.textContent = "Unavailable";
      this.rttEstimate.textContent = "Unavailable";
      return;
    }

    this.networkType.textContent = connection.type || "Unavailable";
    this.effectiveType.textContent = connection.effectiveType || "Unavailable";
    this.downlinkEstimate.textContent = connection.downlink ? `${connection.downlink} Mbps estimate` : "Unavailable";
    this.rttEstimate.textContent = connection.rtt ? `${connection.rtt} ms estimate` : "Unavailable";
  }

  initOnlineStatus() {
    this.updateOnlineStatus();
    window.addEventListener("online", () => this.updateOnlineStatus());
    window.addEventListener("offline", () => this.updateOnlineStatus());
  }

  updateOnlineStatus() {
    const online = navigator.onLine;
    if (!online) {
      this.startTestBtn.disabled = true;
      this.startTestBtn.textContent = "OFFLINE";
      this.setStatus("You're currently offline. Connect to the internet to run a speed test.", "error");
      return;
    }

    this.startTestBtn.disabled = false;
    this.startTestBtn.textContent = "START TEST";
    this.clearStatus();
  }

  handleConnectivityChange(online) {
    if (online) {
      this.startTestBtn.disabled = false;
      this.startTestBtn.textContent = "START TEST";
      this.clearStatus();
    } else {
      this.startTestBtn.disabled = true;
      this.startTestBtn.textContent = "OFFLINE";
      this.setStatus("You're currently offline. Connect to the internet to run a speed test.", "error");
    }
  }
}

const app = new UIController();
window.decanApp = app;

console.info("Decan Internet Speed Tester initialized.");
