export class ApiClient {
  constructor(endpoint = "/server/api.php") {
    this.endpoint = endpoint;
  }

  async postEvent({ type, sessionCode, payload = {} }) {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, sessionCode, payload }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  async saveSettings(sessionCode, settings) {
    return this.postEvent({ type: "save_settings", sessionCode, payload: settings });
  }
}
