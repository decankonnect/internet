export class ResultFormatter {
  static formatBits(bitsPerSecond) {
    if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) {
      return { value: 0, unit: "Mbps", text: "0 Mbps" };
    }

    const units = ["bps", "Kbps", "Mbps", "Gbps"];
    let value = bitsPerSecond;
    let index = 0;

    while (value >= 1000 && index < units.length - 1) {
      value /= 1000;
      index += 1;
    }

    const formatted = value >= 100 ? value.toFixed(1) : value.toFixed(2);
    return { value: Number(formatted), unit: units[index], text: `${formatted} ${units[index]}` };
  }

  static formatBytes(bytesPerSecond) {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
      return { value: 0, unit: "MB/s", text: "0 MB/s" };
    }

    const units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let value = bytesPerSecond;
    let index = 0;

    while (value >= 1000 && index < units.length - 1) {
      value /= 1000;
      index += 1;
    }

    const formatted = value >= 100 ? value.toFixed(1) : value.toFixed(2);
    return { value: Number(formatted), unit: units[index], text: `${formatted} ${units[index]}` };
  }

  static formatMilliseconds(value) {
    if (!Number.isFinite(value) || value < 0) {
      return "--";
    }

    return `${Number(value.toFixed(0))} ms`;
  }

  static formatRateForCard(bitsPerSecond) {
    const info = this.formatBits(bitsPerSecond);
    return `${info.value} ${info.unit}`;
  }
}

export class LatencyTester {
  constructor(endpoint = "", options = {}) {
    this.endpoint = endpoint;
    this.timeoutMs = options.timeoutMs ?? 6000;
  }

  async measure(onProgress = null) {
    if (!this.endpoint) {
      throw new Error("Latency endpoint is not configured.");
    }

    const attempts = 5;
    const samples = [];

    for (let index = 0; index < attempts; index += 1) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), this.timeoutMs);
      const start = performance.now();

      try {
        const url = `${this.endpoint}${this.endpoint.includes("?") ? "&" : "?"}t=${Date.now()}&n=${index}`;
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
          mode: "cors",
        });

        if (!response.ok) {
          throw new Error(`Latency request failed with status ${response.status}`);
        }

        const elapsed = performance.now() - start;
        samples.push(elapsed);

        if (onProgress) {
          onProgress(index + 1, attempts, "Testing latency...");
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.warn("Latency sample failed:", error);
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    if (samples.length === 0) {
      throw new Error("Unable to measure latency.");
    }

    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const min = Math.min(...samples);
    const jitter = samples.reduce((sum, value) => sum + Math.abs(value - average), 0) / samples.length;

    return {
      averageMs: average,
      minMs: min,
      jitterMs: jitter,
      samples,
    };
  }
}

export class DownloadTester {
  constructor(endpoints = []) {
    this.endpoints = Array.isArray(endpoints) ? endpoints.filter(Boolean) : [];
  }

  async measure(onProgress = null) {
    if (this.endpoints.length === 0) {
      throw new Error("No download endpoints configured.");
    }

    const samples = [];

    for (let index = 0; index < this.endpoints.length; index += 1) {
      const endpoint = this.endpoints[index];
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      const startedAt = performance.now();
      let bytesTransferred = 0;

      try {
        const response = await fetch(`${endpoint}?cacheBust=${Date.now()}-${index}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
          mode: "cors",
        });

        if (!response.ok) {
          throw new Error(`Download request failed with status ${response.status}`);
        }

        const reader = response.body && response.body.getReader ? response.body.getReader() : null;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesTransferred += value.byteLength || 0;
            if (onProgress) {
              onProgress(bytesTransferred, 1, "Testing download...");
            }
          }
        } else if (response.arrayBuffer) {
          const arrayBuffer = await response.arrayBuffer();
          bytesTransferred = arrayBuffer.byteLength;
        }

        const elapsedMs = performance.now() - startedAt;
        const elapsedSeconds = Math.max(elapsedMs / 1000, 0.01);
        const bitsPerSecond = (bytesTransferred * 8) / elapsedSeconds;
        const bytesPerSecond = bytesTransferred / elapsedSeconds;

        samples.push({ bytesTransferred, bitsPerSecond, bytesPerSecond });

        if (onProgress) {
          onProgress(bytesTransferred, 1, "Testing download...");
        }
      } catch (error) {
        console.warn("Download sample failed:", error);
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    if (samples.length === 0) {
      throw new Error("No successful download samples were recorded.");
    }

    const representative = samples.reduce((accumulator, sample) => {
      accumulator.bitsPerSecond += sample.bitsPerSecond;
      accumulator.bytesPerSecond += sample.bytesPerSecond;
      accumulator.bytesTransferred += sample.bytesTransferred;
      return accumulator;
    }, { bitsPerSecond: 0, bytesPerSecond: 0, bytesTransferred: 0 });

    const averageSamples = Math.max(samples.length, 1);
    return {
      bitsPerSecond: representative.bitsPerSecond / averageSamples,
      bytesPerSecond: representative.bytesPerSecond / averageSamples,
      bytesTransferred: representative.bytesTransferred / averageSamples,
      samples,
    };
  }
}

export class UploadTester {
  constructor(endpoint = "") {
    this.endpoint = endpoint;
  }

  async measure(onProgress = null) {
    if (!this.endpoint) {
      throw new Error("Upload endpoint is not configured.");
    }

    const payloadSizeBytes = 4 * 1024 * 1024;
    const payload = new Blob([this.makePayload(payloadSizeBytes)], {
      type: "application/octet-stream",
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);
    const startedAt = performance.now();

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        body: payload,
        signal: controller.signal,
        cache: "no-store",
        mode: "cors",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Upload-Size": String(payload.size),
        },
      });

      if (!response.ok) {
        throw new Error(`Upload request failed with status ${response.status}`);
      }

      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.01);
      const bitsPerSecond = (payload.size * 8) / elapsedSeconds;
      const bytesPerSecond = payload.size / elapsedSeconds;

      if (onProgress) {
        onProgress(payload.size, payload.size, "Testing upload...");
      }

      return {
        bitsPerSecond,
        bytesPerSecond,
        bytesTransferred: payload.size,
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  makePayload(bytes) {
    const buffer = new Uint8Array(bytes);
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = index % 251;
    }
    return buffer;
  }
}

export class NetworkTester {
  constructor(config = {}, onProgress = null) {
    this.config = config;
    this.onProgress = onProgress;
    this.latencyTester = new LatencyTester(config.latencyEndpoint || "");
    this.downloadTester = new DownloadTester(config.downloadEndpoints || []);
    this.uploadTester = new UploadTester(config.uploadEndpoint || "");
  }

  emitProgress(label, progressValue = null) {
    if (this.onProgress) {
      this.onProgress(label, progressValue);
    }
  }

  async run() {
    this.emitProgress("Preparing test...");

    if (!this.config.latencyEndpoint || !this.config.downloadEndpoints?.length || !this.config.uploadEndpoint) {
      throw new Error("A real speed-test backend has not been configured yet.");
    }

    this.emitProgress("Finding server...");

    const latency = await this.latencyTester.measure((current, total, label) => {
      this.emitProgress(label, Math.round((current / total) * 25));
    });

    this.emitProgress("Testing download...", 28);
    const download = await this.downloadTester.measure((bytesTransferred, total, label) => {
      this.emitProgress(label, 28 + Math.min(40, (bytesTransferred / Math.max(total || 1, 1)) * 40));
    });

    this.emitProgress("Testing upload...", 68);
    const upload = await this.uploadTester.measure(() => {
      this.emitProgress("Testing upload...", 86);
    });

    this.emitProgress("Finalizing...", 94);

    return {
      latency,
      download,
      upload,
    };
  }
}

export class SpeedTestEngine extends EventTarget {
  constructor(config = {}) {
    super();
    this.config = config;
    this.running = false;
  }

  async run() {
    if (this.running) {
      return Promise.reject(new Error("A speed test is already running."));
    }

    this.running = true;

    try {
      const tester = new NetworkTester(this.config, (label, progressValue) => {
        this.dispatchEvent(new CustomEvent("phase", { detail: label }));
        if (progressValue !== null && progressValue !== undefined) {
          this.dispatchEvent(new CustomEvent("progress", { detail: progressValue }));
        }
      });

      const result = await tester.run();
      this.dispatchEvent(new CustomEvent("phase", { detail: "Test complete" }));
      this.dispatchEvent(new CustomEvent("result", { detail: result }));
      return result;
    } catch (error) {
      this.dispatchEvent(new CustomEvent("error", { detail: error }));
      throw error;
    } finally {
      this.running = false;
    }
  }
}
