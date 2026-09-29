const API = {
  async _req(method, url, body) {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!data || typeof data !== "object") data = {};
    return { status: res.status, ok: res.ok, data };
  },
  get(url) { return this._req("GET", url); },
  post(url, body) { return this._req("POST", url, body); },
};
