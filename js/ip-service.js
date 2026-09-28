export class IPService {
  constructor(endpoint = "") {
    this.endpoint = endpoint;
  }

  async fetchPublicIp() {
    if (!this.endpoint) {
      return {
        value: "Unable to determine public IP",
        error: "No IP endpoint configured.",
      };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`IP lookup failed with status ${response.status}`);
      }

      const data = await response.json();
      const ip = data.ip || data.IP || data.query || data.address || "";

      if (!ip || typeof ip !== "string") {
        throw new Error("No valid IP value returned from the endpoint.");
      }

      return { value: ip, error: null };
    } catch (error) {
      return {
        value: "Unable to determine public IP",
        error: error instanceof Error ? error.message : "Unknown IP lookup failure",
      };
    }
  }
}
