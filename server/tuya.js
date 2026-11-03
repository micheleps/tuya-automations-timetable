import crypto from "node:crypto";

const EMPTY_SHA256 = crypto.createHash("sha256").update("").digest("hex");
let tokenCache = null;

function config() {
  const baseUrl = process.env.TUYA_BASE_URL || "https://openapi.tuyaeu.com";
  const accessId = process.env.TUYA_ACCESS_ID;
  const accessSecret = process.env.TUYA_ACCESS_SECRET;
  if (!accessId || !accessSecret) {
    throw new Error("Missing TUYA_ACCESS_ID or TUYA_ACCESS_SECRET in server/.env");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), accessId, accessSecret };
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(value, "utf8").digest("hex").toUpperCase();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value || "", "utf8").digest("hex");
}

function canonicalPath(path, query = {}) {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return path;
  const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  return `${path}?${qs}`;
}

function makeSignature({ method, pathAndQuery, bodyText = "", accessToken = "", tokenRequest = false, t, nonce, accessId, accessSecret }) {
  const stringToSign = [
    method.toUpperCase(),
    sha256(bodyText),
    "",
    pathAndQuery
  ].join("\n");
  const prefix = tokenRequest
    ? `${accessId}${t}${nonce}`
    : `${accessId}${accessToken}${t}${nonce}`;
  return hmac(accessSecret, `${prefix}${stringToSign}`);
}

async function requestTuya(method, path, { query = {}, body, tokenRequest = false, accessToken = "" } = {}) {
  const { baseUrl, accessId, accessSecret } = config();
  const pathAndQuery = canonicalPath(path, query);
  const bodyText = body === undefined ? "" : JSON.stringify(body);
  const t = String(Date.now());
  const nonce = crypto.randomUUID();
  const sign = makeSignature({
    method, pathAndQuery, bodyText, accessToken, tokenRequest, t, nonce, accessId, accessSecret
  });

  const headers = {
    client_id: accessId,
    sign,
    sign_method: "HMAC-SHA256",
    t,
    nonce,
    lang: "en"
  };
  if (!tokenRequest) headers.access_token = accessToken;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${pathAndQuery}`, {
    method,
    headers,
    body: bodyText || undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const code = payload.code ?? response.status;
    const message = payload.msg || payload.message || response.statusText || "Unknown Tuya API error";
    throw new Error(`Tuya API error ${code}: ${message}`);
  }
  return payload;
}

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache;

  const payload = await requestTuya("GET", "/v1.0/token", {
    query: { grant_type: 1 },
    tokenRequest: true
  });

  const result = payload.result || {};
  if (!result.access_token) {
    throw new Error(`Tuya token response did not include access_token: ${JSON.stringify(payload)}`);
  }

  const expiresIn = Number(result.expire_time || 7200);
  tokenCache = {
    accessToken: result.access_token,
    uid: result.uid || result.user_id || process.env.TUYA_UID || "",
    expiresAt: Date.now() + expiresIn * 1000
  };
  return tokenCache;
}

async function apiGet(path, query = {}) {
  const token = await getAccessToken();
  return requestTuya("GET", path, { query, accessToken: token.accessToken });
}

function resultArray(payload, keys = []) {
  const result = payload?.result;
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    for (const key of keys) if (Array.isArray(result[key])) return result[key];
  }
  return [];
}

function loopsToWeekdays(loops, date) {
  if (typeof loops === "string" && /^[01]{7}$/.test(loops)) {
    return [...loops].flatMap((bit, index) => bit === "1" ? [index] : []);
  }
  // A non-recurring scheduled condition can have a yyyyMMdd date.
  if (typeof date === "string" && /^\d{8}$/.test(date)) {
    const y = Number(date.slice(0, 4));
    const m = Number(date.slice(4, 6)) - 1;
    const d = Number(date.slice(6, 8));
    return [new Date(Date.UTC(y, m, d)).getUTCDay()];
  }
  return [];
}

function addMinutes(time, amount) {
  const [hh, mm] = String(time).split(":").map(Number);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return time;
  const total = (hh * 60 + mm + amount) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function normalizeAutomation(automation) {
  const baseId = automation.automation_id || automation.id;
  const name = automation.name || "Unnamed automation";
  const enabled = automation.enabled !== false && String(automation.status ?? "1") !== "2";
  const events = [];
  let sequence = 0;

  // A timeCheck precondition is a permitted time window, not proof that the
  // automation's actions run for that entire duration.
  for (const precondition of automation.preconditions || []) {
    if (precondition.cond_type !== "timeCheck") continue;
    const display = precondition.display || {};
    const weekdays = loopsToWeekdays(display.loops, display.date);
    if (!display.start || !display.end || weekdays.length === 0) continue;
    events.push({
      id: `${baseId}-window-${sequence++}`,
      name,
      weekdays,
      start: display.start,
      end: display.end,
      enabled,
      kind: "window",
      timezoneId: display.timezone_id || null,
      description: "Configured time window (not actual action runtime)"
    });
  }

  // Scheduled task conditions are trigger instants. The 5-minute width is
  // only a visual marker in the calendar, not an asserted execution duration.
  for (const condition of automation.conditions || []) {
    if (Number(condition.entity_type) !== 6) continue;
    const display = condition.display || {};
    if (!display.time) continue;
    const weekdays = loopsToWeekdays(display.loops, display.date);
    if (weekdays.length === 0) continue;
    events.push({
      id: `${baseId}-trigger-${sequence++}`,
      name,
      weekdays,
      start: display.time,
      end: addMinutes(display.time, 5),
      enabled,
      kind: "trigger",
      timezoneId: display.timezone_id || null,
      description: "Scheduled trigger (5-minute marker is visual only)"
    });
  }

  return events;
}

export async function fetchTuyaHomes() {
  console.log("Get access token for Tuya API");
  const token = await getAccessToken();
  const uid = process.env.TUYA_UID || token.uid;
  if (!uid) {
    throw new Error("Tuya token did not provide a user UID. Set TUYA_UID in server/.env using the UID shown in your Tuya project/account details.");
  }
  console.log("Fetching Tuya homes for user", uid);
  const payload = await apiGet(`/v1.0/users/${encodeURIComponent(uid)}/homes`);
  return resultArray(payload).map(home => ({
    homeId: String(home.home_id),
    name: home.name || `Home ${home.home_id}`
  }));
}

export async function fetchTuyaAutomations(homeId) {
  if (!homeId) throw new Error("homeId is required");

  const payload = await apiGet(`/v1.1/homes/${encodeURIComponent(homeId)}/automations`);
  const automations = resultArray(payload);

  // Tuya's list response normally contains conditions and preconditions.
  // If an item omits them, fetch its detail endpoint to get the full rule.
  const detailed = await Promise.all(automations.map(async item => {
    if (Array.isArray(item.conditions) || Array.isArray(item.preconditions)) return item;
    const id = item.automation_id || item.id;
    if (!id) return item;
    const detail = await apiGet(`/v1.0/homes/${encodeURIComponent(homeId)}/automations/${encodeURIComponent(id)}`);
    return detail.result || item;
  }));

  return detailed.flatMap(normalizeAutomation);
}
