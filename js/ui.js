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

function setDot(key, level) {
  const el = $(key + "Emoji");
  if (!el) return;
  const sm = el.classList.contains("sm") ? " sm" : "";
  el.className = "metric-dot" + sm + (level ? " " + level : "");
}

/* Vital-sign status: ok / warn (generic adult reference ranges,
   not a medical diagnosis). Rendered as a small dot, no emoji. */
function evalHR(v) { return (v >= 60 && v <= 100) ? "ok" : "warn"; }
function evalSpo2(v) { return v >= 95 ? "ok" : "warn"; }
function evalBP(sys, dia) { return (sys < 120 && dia < 80 && sys >= 90 && dia >= 60) ? "ok" : "warn"; }
function evalHRV(v) { return v >= 20 ? "ok" : "warn"; }
function evalTemp(v) { return (v >= 36.1 && v <= 37.2) ? "ok" : "warn"; }

/* Sleep: two dots — deep-sleep share and duration. */
function setSleepEmojis(data) {
  const q = $("sleepQualityEmoji"), d = $("sleepDurationEmoji");
  if (q) q.className = "metric-dot sm " + (data.score >= 15 ? "ok" : "warn");
  if (d) d.className = "metric-dot sm " + (data.totalMin >= 420 ? "ok" : "warn");
}

/* Stress score: ok / info / warn / bad */
function evalPressure(v) {
  if (v >= 76) return "bad";
  if (v >= 51) return "warn";
  if (v >= 26) return "info";
  return "ok";
}

/* ---- Battery pill: ring's own % only ---- */
let lastRingBattery = null;
function setRingBattery(pct, src) {
  const el = $("batReal");
  if (el) el.textContent = pct + "%";
  if (pct !== lastRingBattery) {
    lastRingBattery = pct;
    log("Ring battery " + pct + "% (via " + src + ")");
  }
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
}

/* ---- Weather (best-effort, geolocation -> IP fallback -> fixed default) ---- */
/* ---- Weather: short text labels instead of emoji ---- */
function weatherLabel(code) {
  // WMO weather interpretation codes
  if (code == null || code === "") return "";
  const c = +code;
  if (c === 0) return "Clear";
  if (c === 1) return "Mostly clear";
  if (c <= 3) return "Cloudy";
  if (c <= 48) return "Fog";
  if (c <= 57) return "Drizzle";
  if (c <= 67) return "Rain";
  if (c <= 77) return "Snow";
  if (c <= 82) return "Showers";
  if (c <= 86) return "Snow";
  if (c <= 99) return "Storm";
  return "";
}
function setWeatherUI(label, temp) {
  const el = $("wxText");
  if (!el) return;
  if (temp == null || temp === "") { el.textContent = label || "--"; return; }
  el.textContent = label ? `${label} · ${Math.round(+temp)}°C` : `${Math.round(+temp)}°C`;
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
    setWeatherUI(weatherLabel(code), temp);
    setWeatherCache({ temp, code, icon: weatherLabel(code), ts: Date.now() });
  } catch (e) {
    const c = getWeatherCache();
    if (c && c.temp != null) { setWeatherUI(c.icon || weatherLabel(c.code), c.temp); return; }
    setWeatherUI("", null);
    if (typeof log === "function") log("Weather fetch failed: " + (e && e.message ? e.message : e));
  }
}
function initWeather() {
  const c = getWeatherCache();
  if (c && c.temp != null && Date.now() - (c.ts || 0) < 90 * 60 * 1000) setWeatherUI(c.icon || weatherLabel(c.code), c.temp);
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
    if (rec.type === "hr" && $("hr").textContent === "--") { $("hr").textContent = rec.data; setDot("hr", evalHR(rec.data)); }
    else if (rec.type === "spo2" && $("spo2").textContent === "--") { $("spo2").textContent = rec.data; setDot("spo2", evalSpo2(rec.data)); }
    else if (rec.type === "bp" && $("bp").textContent === "-- / --") {
      $("bp").textContent = `${rec.data.sys} / ${rec.data.dia}`;
      $("bpHr").textContent = "HR " + rec.data.hr;
      setDot("bp", evalBP(rec.data.sys, rec.data.dia));
    } else if (rec.type === "hrv" && $("hrv").textContent === "--") { $("hrv").textContent = rec.data; setDot("hrv", evalHRV(rec.data)); }
    else if (rec.type === "sleep" && $("sleepMin").textContent === "--") {
      $("sleepMin").textContent = `${Math.floor(rec.data.totalMin / 60)}h${rec.data.totalMin % 60}m`;
      setSleepEmojis(rec.data);
    }
    else if (rec.type === "pressure" && rec.data && $("pressureVal")?.textContent === "--") {
      const last = rec.data[rec.data.length - 1];
      if (last) {
        $("pressureVal").textContent = last.pressure; setDot("pressure", evalPressure(last.pressure));
        if ($("fatigueVal")) $("fatigueVal").textContent = last.fatigue || "--";
        if ($("vo2maxVal")) $("vo2maxVal").textContent = last.vo2max || "--";
      }
    }
    else if (rec.type === "tempHist" && $("tempVal")?.textContent === "--" && Array.isArray(rec.data) && rec.data.length) {
      const last = rec.data[rec.data.length - 1];
      $("tempVal").textContent = last.temp.toFixed(1); setDot("temp", evalTemp(last.temp));
    }
    else if (rec.type === "stepsHist" && $("steps").textContent === "--" && Array.isArray(rec.data)) {
      const today = startOfDay(new Date());
      let sum = 0;
      for (const x of rec.data) if (sameDay(new Date(x.t), today)) sum += x.steps;
      if (sum > 0) { $("steps").textContent = sum; }
    }
  }
}
