"use strict";
/* =====================================================================
   Storage layer
   All persisted data lives in localStorage under these keys:
     tk5Records      - array of up to 4000 measurement/history records (JSON)
     tk5LastCharge   - timestamp (ms) of the last time the battery icon
                       was tapped to reset the "days since charge" estimate
     tk5WeatherGeo   - cached {lat,lng,ts} so we don't re-prompt geolocation
                       more than once every 2 hours
     tk5WeatherCache - last successful weather reading {temp,code,icon,ts}
     tk5SeasonEffect - "on" | "off" for the falling-emoji season effect

   Every read/write goes through the safe* helpers below so a full/denied
   localStorage (private browsing, storage quota, etc.) never throws and
   crashes the page — it just silently no-ops and the app keeps working
   in-memory for that session. Record writes are additionally debounced
   so a burst of updates (e.g. the auto-connect flow adding steps, sleep,
   BP and HR one after another) collapses into a single disk write.
===================================================================== */

const STORE_KEYS = {
  RECORDS: "tk5Records",
  WEATHER_GEO: "tk5WeatherGeo",
  WEATHER_CACHE: "tk5WeatherCache",
  SEASON_EFFECT: "tk5SeasonEffect"
};

function safeGetJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (_) { return fallback; }
}
function safeSetJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn(`[storage] write failed for ${key}:`, e); return false; }
}
function safeGetStr(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : v; }
  catch (_) { return fallback; }
}
function safeSetStr(key, value) {
  try { localStorage.setItem(key, String(value)); return true; }
  catch (e) { console.warn(`[storage] write failed for ${key}:`, e); return false; }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch (_) {}
}

/* ---- Records (the main measurement/history log) ---- */
let records = safeGetJSON(STORE_KEYS.RECORDS, []);
if (!Array.isArray(records)) records = [];

let _persistTimer = null;
function persistRecordsNow() {
  clearTimeout(_persistTimer);
  _persistTimer = null;
  safeSetJSON(STORE_KEYS.RECORDS, records);
}
function schedulePersist() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(persistRecordsNow, 250);
}
// Make sure a debounced write still lands if the page is closed early.
window.addEventListener("pagehide", persistRecordsNow);
window.addEventListener("beforeunload", persistRecordsNow);

function add(type, data) {
  records.unshift({ time: new Date().toISOString(), type, data });
  if (records.length > 4000) records.length = 4000;
  schedulePersist();
  if (typeof refreshAll === "function") refreshAll();
}
function addUnique(type, data) {
  const sig = JSON.stringify(data);
  const dup = records.some(r => r.type === type && JSON.stringify(r.data) === sig);
  if (!dup) add(type, data);
  return !dup;
}
function clearAllRecords() {
  records = [];
  clearTimeout(_persistTimer);
  _persistTimer = null;
  safeRemove(STORE_KEYS.RECORDS);
  if (typeof refreshAll === "function") refreshAll();
}

/* ---- Weather cache ---- */
function getWeatherGeoCache() { return safeGetJSON(STORE_KEYS.WEATHER_GEO, null); }
function setWeatherGeoCache(lat, lng) { return safeSetJSON(STORE_KEYS.WEATHER_GEO, { lat, lng, ts: Date.now() }); }
function getWeatherCache() { return safeGetJSON(STORE_KEYS.WEATHER_CACHE, null); }
function setWeatherCache(obj) { return safeSetJSON(STORE_KEYS.WEATHER_CACHE, obj); }

/* ---- Season effect toggle (default on) ---- */
function getSeasonEffectEnabled() { return safeGetStr(STORE_KEYS.SEASON_EFFECT, "on") !== "off"; }
function setSeasonEffectEnabled(on) { safeSetStr(STORE_KEYS.SEASON_EFFECT, on ? "on" : "off"); }
