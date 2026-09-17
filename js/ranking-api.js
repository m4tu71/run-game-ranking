(function () {
  "use strict";

  const CHANNEL = "ranking-api";
  const VERSION = 1;
  const DEFAULT_TIMEOUT_MS = 10_000;

  function createApiError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function isGoogleScriptOrigin(origin) {
    try {
      const url = new URL(origin);
      return (
        url.protocol === "https:" &&
        (url.hostname === "script.googleusercontent.com" ||
          url.hostname.endsWith("-script.googleusercontent.com"))
      );
    } catch {
      return false;
    }
  }

  function createRequestId() {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  class RankingApi {
    constructor({ gasUrl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
      this.gasUrl = gasUrl;
      this.timeoutMs = timeoutMs;
      this.iframe = null;
      this.bridgeWindow = null;
      this.bridgeOrigin = null;
      this.pending = new Map();
      this.initializePromise = null;
      this.onMessage = this.onMessage.bind(this);
    }

    initialize() {
      if (this.initializePromise) return this.initializePromise;

      this.initializePromise = new Promise((resolve, reject) => {
        const iframe = document.createElement("iframe");
        iframe.credentialless = true;
        iframe.src = `${this.gasUrl}?bridge=1`;
        iframe.style.display = "none";
        iframe.setAttribute("aria-hidden", "true");

        const timeoutId = window.setTimeout(() => {
          this.initializePromise = null;
          reject(createApiError("TIMEOUT", "Bridge ready timeout"));
        }, this.timeoutMs);

        this.iframe = iframe;
        this.readyResolver = () => {
          window.clearTimeout(timeoutId);
          resolve();
        };
        window.addEventListener("message", this.onMessage);
        document.body.appendChild(iframe);
      });

      return this.initializePromise;
    }

    getRanking(limit = 100) {
      return this.request("getRanking", { limit });
    }

    request(action, payload) {
      if (!this.bridgeWindow || !this.bridgeOrigin) {
        return Promise.reject(createApiError("BRIDGE_NOT_READY", "Bridge is not ready"));
      }

      const requestId = createRequestId();
      const message = {
        channel: CHANNEL,
        version: VERSION,
        type: "request",
        requestId,
        action,
        payload,
      };

      return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          this.pending.delete(requestId);
          reject(createApiError("TIMEOUT", "Bridge response timeout"));
        }, this.timeoutMs);

        this.pending.set(requestId, { resolve, reject, timeoutId });
        this.bridgeWindow.postMessage(message, this.bridgeOrigin);
      });
    }

    onMessage(event) {
      const message = event.data;
      if (!message || message.channel !== CHANNEL || message.version !== VERSION) return;

      if (message.type === "ready") {
        // GASではscript.google.comの外側iframe内で、実際のBridgeが
        // *-script.googleusercontent.comの内側iframeとして実行される。
        // そのためevent.sourceは外側iframe.contentWindowとは一致しない。
        // ready時のGoogle Script Originを検証して、実際の送信元を保存する。
        if (this.bridgeWindow || !isGoogleScriptOrigin(event.origin)) return;

        this.bridgeWindow = event.source;
        this.bridgeOrigin = event.origin;
        if (this.readyResolver) {
          this.readyResolver();
          this.readyResolver = null;
        }
        return;
      }

      if (message.type !== "response") return;
      if (event.source !== this.bridgeWindow || event.origin !== this.bridgeOrigin) return;

      const pendingRequest = this.pending.get(message.requestId);
      if (!pendingRequest) return;

      this.pending.delete(message.requestId);
      window.clearTimeout(pendingRequest.timeoutId);

      if (message.success === true) {
        pendingRequest.resolve(message.data);
        return;
      }

      const error = message.error || {};
      pendingRequest.reject(createApiError(error.code || "API_ERROR", error.message || "Ranking API error"));
    }
  }

  window.RankingApi = RankingApi;
  window.RANKING_GAS_URL = "https://script.google.com/macros/s/AKfycbwvyJTDx-8-tWrb-xRyHxoebE1HxPNf_GN4cHYi5fEs8OOQvwfUIC10JVI-77FG20ECxw/exec";
})();
