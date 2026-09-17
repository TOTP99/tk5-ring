"use strict";
/* ===== Status line, emoji indicators, clock, weather, battery, page nav ===== */

let logs = [];
function log(t) {
  const line = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${t}`;
  logs.push(line);
  const el = $("log");
  if (el) { el.textContent = logs.join("\n"); el.scrollTop = el.scrollHeight; }
}

function setStatus(text, type = "connected") {
  const st = $("status");
  if (!st) return;
  st.className = `status ${type}`;
  const l1 = $("statusL1");
  const l2 = $("statusL2");
  const t = String(text || "");

  let title, detail;
  if (type === "connected") {
    title = "Connected";
    detail = t.replace(/^Connected\s*[·•]?\s*/, "").trim() || "Ring online";
  } else if (type === "disconnected") {
    title = "Disconnected";
    detail = t.replace(/^Disconnected\s*[·•]?\s*/, "").trim() || "Tap the switch to connect";
  } else {
    title = "Status";
    detail = t || "—";
  }

  if (/Measuring|Selecting Bluetooth|Syncing|Fetching|In progress/i.test(t) && type !== "disconnected") {
    title = "In progress";
    detail = t;
  }
  if (l1) l1.textContent = title;
  if (l2) l2.textContent = detail;

  const sw = $("btnPower");
  if (sw) {
    const on = type === "connected" || title === "In progress";
    if (sw.checked !== on) sw.checked = on;
  }
}

function setEmoji(key, emoji) {
  const el = $(key + "Emoji");
  if (el) el.textContent = emoji;
}

/* Vital-sign indicators: normal 🌹 / abnormal 🥀 (generic adult reference
   ranges, not a medical diagnosis — same thresholds as before, just a
   simpler two-state readout). */
function evalHR(v) { return (v >= 60 && v <= 100) ? "🌹" : "🥀"; }
function evalSpo2(v) { return v >= 95 ? "🌹" : "🥀"; }
function evalBP(sys, dia) { return (sys < 120 && dia < 80 && sys >= 90 && dia >= 60) ? "🌹" : "🥀"; }
function evalHRV(v) { return v >= 20 ? "🌹" : "🥀"; }

/* Sleep: two independent dimensions.
   Duration adequate 🌸 / short 🍄. Depth (deep-sleep share) adequate 🌺 / low 🍄‍🟫. */
function setSleepEmojis(data) {
  const q = $("sleepQualityEmoji"), d = $("sleepDurationEmoji");
  if (q) q.textContent = data.score >= 15 ? "🌺" : "🍄‍🟫";
  if (d) d.textContent = data.totalMin >= 420 ? "🌸" : "🍄";
}

/* Stress score: relaxed 🥳 / normal 😇 / high 😫 (unchanged thresholds) */
function evalPressure(v) {
  if (v >= 76) return "😫";
  if (v >= 51) return "😐";
  return "🥳";
}

/* Steps milestones: 6000+ 🎖️, 10000+ 🥇, 15000+ 🏆 */
function evalSteps(steps) {
  if (steps >= 15000) return "🏆";
  if (steps >= 10000) return "🥇";
  if (steps >= 6000) return "🎖️";
  return "";
}
function setStepsBadge(steps) {
  const el = $("stepsBadge");
  if (el) el.textContent = evalSteps(+steps || 0);
}

/* ---- Battery-since-charge indicator ----
   🔋 321 🚨 — "321" is bold yellow by default. Tapping 🔋 resets the
   clock. Every 24h that passes since the last tap, one more digit
   turns red, right to left through the sequence 3 → 2 → 1: after 24h
   "3" turns red, after 48h "2" also turns red, after 72h "1" also
   turns red. After 96h (all three digits red) 🚨 lights up with a
   pulsing glow to signal the ring needs charging. */
function updateBatteryUI() {
  const days = daysSinceCharge();
  const c3 = $("bat3"), c2 = $("bat2"), c1 = $("bat1"), warn = $("batWarn");
  if (!c3) return;
  c3.classList.toggle("bat-due", days >= 1);
  c2.classList.toggle("bat-due", days >= 2);
  c1.classList.toggle("bat-due", days >= 3);
  if (warn) warn.classList.toggle("active", days >= 4);
}
function initBatteryTap() {
  const batIconEl = $("batIcon");
  if (!batIconEl) return;
  batIconEl.style.cursor = "pointer";
  batIconEl.onclick = () => {
    setLastCharge(Date.now());
    updateBatteryUI();
    log("Battery estimate reset to full (100%)");
  };
  updateBatteryUI();
}

/* ---- Electronic clock card ---- */
function updateClock() {
  const now = new Date();
  const dateEl = $("clockDate");
  if (dateEl) {
    dateEl.innerHTML = `<span class="clock-month">${MONTHS_EN[now.getMonth()]}</span> <span class="clock-dayyear">${pad2(now.getDate())}, ${now.getFullYear()}</span>`;
  }
  if ($("clockWeek")) $("clockWeek").textContent = WEEKDAYS_EN[now.getDay()];
  if ($("clockTime")) $("clockTime").textContent = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  updateBatteryUI();
}

/* ---- Weather (best-effort, geolocation -> IP fallback -> fixed default) ---- */
function weatherEmoji(code) {
  // WMO weather interpretation codes
  if (code == null || code === "") return "🌡️";
  const c = +code;
  if (c === 0) return "☀️";
  if (c <= 3) return "⛅";
  if (c <= 48) return "🌫️";
  if (c <= 57) return "🌧️";
  if (c <= 67) return "🌧️";
  if (c <= 77) return "❄️";
  if (c <= 82) return "🌧️";
  if (c <= 86) return "❄️";
  if (c <= 99) return "⛈️";
  return "🌡️";
}
function setWeatherUI(icon, temp) {
  const ic = $("wxIcon"), tp = $("wxTemp");
  if (ic) ic.textContent = icon;
  if (tp) tp.textContent = temp == null || temp === "" ? "--" : String(Math.round(+temp));
}
async function getGeoPosition() {
  const cached = getWeatherGeoCache();
  if (cached && cached.lat != null && cached.lng != null && Date.now() - (cached.ts || 0) < 2 * 3600 * 1000)
    return { lat: cached.lat, lng: cached.lng, cached: true };
  if (!navigator.geolocation) return null;
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setWeatherGeoCache(lat, lng);
        resolve({ lat, lng, cached: false });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}
async function fetchWeather() {
  setWeatherUI("…", null);
  try {
    let geo = await getGeoPosition();
    if (!geo) {
      try {
        const ip = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) }).then(r => r.ok ? r.json() : null);
        if (ip && ip.latitude != null && ip.longitude != null) geo = { lat: ip.latitude, lng: ip.longitude };
      } catch (_) {}
    }
    if (!geo) geo = { lat: 39.9, lng: 116.4 };

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lng}&current=temperature_2m,weather_code&timezone=auto`;
    const data = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => {
      if (!r.ok) throw new Error("weather http " + r.status);
      return r.json();
    });
    const cur = data.current || {};
    const temp = cur.temperature_2m;
    const code = cur.weather_code;
    setWeatherUI(weatherEmoji(code), temp);
    setWeatherCache({ temp, code, icon: weatherEmoji(code), ts: Date.now() });
  } catch (e) {
    const c = getWeatherCache();
    if (c && c.temp != null) { setWeatherUI(c.icon || weatherEmoji(c.code), c.temp); return; }
    setWeatherUI("🌡️", null);
    if (typeof log === "function") log("Weather fetch failed: " + (e && e.message ? e.message : e));
  }
}
function initWeather() {
  const c = getWeatherCache();
  if (c && c.temp != null && Date.now() - (c.ts || 0) < 90 * 60 * 1000) setWeatherUI(c.icon || weatherEmoji(c.code), c.temp);
  fetchWeather();
  setInterval(fetchWeather, 30 * 60 * 1000);
  const card = $("card-clock");
  if (card) card.addEventListener("click", () => { fetchWeather(); });
}

/* ---- Measurement progress bars ---- */
let activeTimer = null, measuringCard = null;
function startProgress(cardKey, durationMs, nature) {
  clearProgress();
  measuringCard = cardKey;
  const card = $(`card-${cardKey}`);
  const bar = $(`prog-${cardKey}`);
  if (card) card.classList.add("measuring");
  if (!bar) return;
  let elapsed = 0;
  const step = nature === "rhythmic" ? 80 : 100;
  activeTimer = setInterval(() => {
    elapsed += step;
    bar.style.width = Math.min(100, (elapsed / durationMs) * 100) + "%";
    if (elapsed >= durationMs) {
      clearInterval(activeTimer);
      activeTimer = null;
      bar.style.width = "0%";
      if (card) card.classList.remove("measuring");
    }
  }, step);
}
function clearProgress() {
  if (activeTimer) { clearInterval(activeTimer); activeTimer = null; }
  document.querySelectorAll(".m-progress").forEach(el => { el.style.width = "0%"; });
  document.querySelectorAll(".m.measuring").forEach(el => el.classList.remove("measuring"));
}
function onMeasureDone(cardKey) {
  if (measuringCard !== cardKey && measuringCard !== null) return;
  measuringCard = null;
  isMeasuring = false;
  clearProgress();
  const card = $(`card-${cardKey}`);
  if (card) {
    card.classList.remove("done-flash");
    void card.offsetWidth;
    card.classList.add("done-flash");
    setTimeout(() => card.classList.remove("done-flash"), 550);
  }
  if (device?.gatt?.connected) setStatus("Connected · " + (device.name || "TK5"), "connected");
}

/* ---- Page navigation ---- */
function showPage(id) {
  PAGES.forEach(p => { const el = $(p); if (el) el.style.display = p === id ? "" : "none"; });
}
function setupRangeTabs(containerId, chartKey, redraw) {
  const el = $(containerId);
  if (!el) return;
  el.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      chartRange[chartKey] = btn.dataset.range;
      el.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
      redraw();
    };
  });
}

/* ---- Repaint cards from saved records on page load (before any live data arrives) ---- */
function hydrateFromRecords() {
  for (const rec of records) {
    if (rec.type === "hr" && $("hr").textContent === "--") { $("hr").textContent = rec.data; setEmoji("hr", evalHR(rec.data)); }
    else if (rec.type === "spo2" && $("spo2").textContent === "--") { $("spo2").textContent = rec.data; setEmoji("spo2", evalSpo2(rec.data)); }
    else if (rec.type === "bp" && $("bp").textContent === "-- / --") {
      $("bp").textContent = `${rec.data.sys} / ${rec.data.dia}`;
      $("bpHr").textContent = "HR " + rec.data.hr;
      setEmoji("bp", evalBP(rec.data.sys, rec.data.dia));
    } else if (rec.type === "hrv" && $("hrv").textContent === "--") { $("hrv").textContent = rec.data; setEmoji("hrv", evalHRV(rec.data)); }
    else if (rec.type === "sleep" && $("sleepMin").textContent === "--") {
      $("sleepMin").textContent = `${Math.floor(rec.data.totalMin / 60)}h${rec.data.totalMin % 60}m`;
      setSleepEmojis(rec.data);
    }
    else if (rec.type === "pressure" && rec.data && $("pressureVal")?.textContent === "--") {
      const last = rec.data[rec.data.length - 1];
      if (last) { $("pressureVal").textContent = last.pressure; setEmoji("pressure", evalPressure(last.pressure)); }
    }
    else if (rec.type === "stepsHist" && $("steps").textContent === "--" && Array.isArray(rec.data)) {
      const today = startOfDay(new Date());
      let sum = 0;
      for (const x of rec.data) if (sameDay(new Date(x.t), today)) sum += x.steps;
      if (sum > 0) { $("steps").textContent = sum; setStepsBadge(sum); }
    }
  }
}
