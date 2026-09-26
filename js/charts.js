"use strict";
/* ===== History list rendering + canvas chart drawing ===== */

function renderHist() {
  const box = $("history");
  if (!box) return;
  const cards = [];
  for (const rec of records) {
    if (rec.type === "all" && rec.data) {
      for (const x of [...rec.data].reverse()) {
        if (!x.sys && !x.hr && !x.spo2) continue;
        cards.push(`<div class="rc"><div class="t">${esc(x.local)}</div><div>${x.sys ? `BP <b>${x.sys}/${x.dia}</b> ` : ""}${x.hr ? `HR <b>${x.hr}</b> ` : ""}${x.spo2 ? `SpO₂ <b>${x.spo2}</b>%` : ""}</div></div>`);
      }
    } else if (rec.type === "bp") {
      cards.push(`<div class="rc"><div class="t">${esc(fmt(new Date(rec.time)))} Live</div><div>BP <b>${rec.data.sys}/${rec.data.dia}</b> HR <b>${rec.data.hr}</b></div></div>`);
    } else if (rec.type === "spo2") {
      cards.push(`<div class="rc"><div class="t">${esc(fmt(new Date(rec.time)))} Live</div><div>SpO₂ <b>${rec.data}</b>%</div></div>`);
    } else if (rec.type === "hr") {
      cards.push(`<div class="rc"><div class="t">${esc(fmt(new Date(rec.time)))} Live</div><div>HR <b>${rec.data}</b></div></div>`);
    } else if (rec.type === "hrHist" && Array.isArray(rec.data)) {
      for (const x of [...rec.data].reverse())
        cards.push(`<div class="rc"><div class="t">${esc(x.local)}</div><div>HR <b>${x.hr}</b></div></div>`);
    } else if (rec.type === "bpHist" && Array.isArray(rec.data)) {
      for (const x of [...rec.data].reverse())
        cards.push(`<div class="rc"><div class="t">${esc(x.local)}</div><div>BP <b>${x.sys}/${x.dia}</b> HR <b>${x.hr}</b></div></div>`);
    } else if (rec.type === "hrv") {
      cards.push(`<div class="rc"><div class="t">${esc(fmt(new Date(rec.time)))} Live</div><div>HRV <b>${rec.data}</b></div></div>`);
    } else if (rec.type === "sleep" && rec.data) {
      const d = rec.data;
      cards.push(`<div class="rc"><div class="t">Sleep &middot; ${esc(d.start)} &ndash; ${esc(d.end)} (${d.totalMin} min)</div><div>Deep <b>${d.deepMin}</b>m &middot; Light <b>${d.lightMin}</b>m &middot; REM <b>${d.remMin}</b>m &middot; Awake <b>${d.awakeMin ?? 0}</b>m</div></div>`);
    } else if (rec.type === "pressure" && rec.data) {
      for (const x of [...rec.data].reverse())
        cards.push(`<div class="rc"><div class="t">${esc(x.local)}</div><div>Stress <b>${x.pressure}</b></div></div>`);
    } else if (rec.type === "stepsHist" && rec.data) {
      for (const x of [...rec.data].reverse())
        cards.push(`<div class="rc"><div class="t">${esc(x.local)}</div><div>Steps <b>${x.steps}</b>${x.distance ? ` · Dist <b>${x.distance}</b>m` : ""}${x.calories ? ` · Cal <b>${x.calories}</b>` : ""}</div></div>`);
    } else if (rec.type === "tempHist" && Array.isArray(rec.data)) {
      for (const x of [...rec.data].reverse())
        cards.push(`<div class="rc"><div class="t">${esc(x.local)}</div><div>Temp <b>${x.temp.toFixed(1)}</b>°C</div></div>`);
    } else if (rec.type === "raw") {
      const d = rec.data;
      cards.push(`<div class="rc"><div class="t">${esc(fmt(new Date(rec.time)))} · ${esc(d.label)} · frame 0x${(d.frameType || 0).toString(16).padStart(4, "0")} · ${d.bytes}B</div><div style="font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;word-break:break-all;color:#d8b56b">${esc(d.hex)}</div></div>`);
    }
    if (cards.length >= 40) break;
  }
  box.innerHTML = cards.length ? cards.join("") : `<div class="empty-hint">No records yet — connect the ring to sync.</div>`;
}

function initCanvas(id) {
  const canvas = $(id);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 100, dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  return { ctx, width: w, height: h };
}

function drawEmpty(ctx, w, h, msg) {
  ctx.fillStyle = "#8a8578";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(msg, w / 2, h / 2 + 4);
}

function drawArea(ctx, w, h, points, stroke, fillFn, dot) {
  const min = Math.min(...points) - 5, max = Math.max(...points) + 5;
  const stepX = w / (points.length - 1);
  const yOf = v => h - ((v - min) / (max - min || 1)) * (h - 20) - 10;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, fillFn(0.3));
  grad.addColorStop(1, fillFn(0));
  ctx.beginPath();
  points.forEach((v, i) => i === 0 ? ctx.moveTo(i * stepX, yOf(v)) : ctx.lineTo(i * stepX, yOf(v)));
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  points.forEach((v, i) => i === 0 ? ctx.moveTo(i * stepX, yOf(v)) : ctx.lineTo(i * stepX, yOf(v)));
  ctx.strokeStyle = stroke; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
  points.forEach((v, i) => {
    ctx.beginPath(); ctx.arc(i * stepX, yOf(v), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = dot; ctx.fill();
  });
}

function collectMetricPoints(type, range, extraFromAll) {
  const cutoff = Date.now() - (RANGE_DAYS[range] || 7) * 86400000;
  let pts = [];
  for (const rec of records) {
    if (rec.type === type && new Date(rec.time).getTime() >= cutoff) {
      pts.push(rec.data);
    } else if (extraFromAll && rec.type === "all" && Array.isArray(rec.data)) {
      for (const x of rec.data) if (x[extraFromAll] && (x.t || 0) >= cutoff) pts.push(x[extraFromAll]);
    } else if (type === "hr" && rec.type === "hrHist" && Array.isArray(rec.data)) {
      for (const x of rec.data) if (x.hr && (x.t || 0) >= cutoff) pts.push(x.hr);
    }
  }
  return pts.slice(-20);
}

function setStats(ids, values) {
  ids.forEach((id, i) => { const el = $(id); if (el) el.textContent = values[i]; });
}

function drawMetricChart(opts) {
  const c = initCanvas(opts.canvas);
  if (!c) return;
  const { ctx, width, height } = c;
  const points = collectMetricPoints(opts.type, chartRange[opts.rangeKey], opts.fromAll);
  const sub = $(opts.subId);
  if (sub) sub.textContent = points.length ? `${points.length} samples` : "No data";
  if (points.length < 2) {
    setStats(opts.statIds, ["--", "--", "--"]);
    return drawEmpty(ctx, width, height, opts.emptyMsg);
  }
  const avg = Math.round(points.reduce((a, b) => a + b, 0) / points.length);
  setStats(opts.statIds, [avg, Math.max(...points), Math.min(...points)]);
  drawArea(ctx, width, height, points, opts.stroke, opts.fill, opts.dot);
}

function drawTrendChart() {
  drawMetricChart({
    canvas: "trendCanvas", type: "hr", rangeKey: "trend", fromAll: "hr",
    subId: "chart-sub", statIds: ["hr-avg", "hr-high", "hr-low"],
    emptyMsg: "Measure a few more times to see the trend",
    stroke: "#d8b56b", fill: a => `rgba(216,181,107,${a})`, dot: "#d8b56b"
  });
}

function drawSpo2Chart() {
  drawMetricChart({
    canvas: "spo2Canvas", type: "spo2", rangeKey: "spo2", fromAll: "spo2",
    subId: "spo2-chart-sub", statIds: ["spo2-avg", "spo2-high", "spo2-low"],
    emptyMsg: "Measure a few more times to see the trend",
    stroke: "#14b8a6", fill: a => `rgba(13,148,136,${a})`, dot: "#14b8a6"
  });
}

function drawHRVChart() {
  drawMetricChart({
    canvas: "hrvCanvas", type: "hrv", rangeKey: "hrv",
    subId: "hrv-chart-sub", statIds: ["hrv-avg", "hrv-high", "hrv-low"],
    emptyMsg: "Measure a few more times to see the trend",
    stroke: "#3b82f6", fill: a => `rgba(59,130,246,${a})`, dot: "#a78bfa"
  });
}

function drawTempChart() {
  const c = initCanvas("tempCanvas");
  if (!c) return;
  const { ctx, width, height } = c;
  const cutoff = Date.now() - (RANGE_DAYS[chartRange.temp] || 7) * 86400000;
  const pts = [];
  for (const rec of records) {
    if (rec.type === "tempHist" && Array.isArray(rec.data))
      for (const x of rec.data) if (x.temp && (x.t || 0) >= cutoff) pts.push({ t: x.t, v: x.temp });
  }
  pts.sort((a, b) => a.t - b.t);
  const values = pts.slice(-40).map(p => p.v);
  const sub = $("temp-chart-sub");
  if (sub) sub.textContent = values.length ? `${values.length} samples` : "No data";
  if (values.length) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    setStats(["temp-latest", "temp-avg", "temp-high", "temp-low"],
      [values[values.length - 1].toFixed(1), avg.toFixed(1),
       Math.max(...values).toFixed(1), Math.min(...values).toFixed(1)]);
  } else {
    setStats(["temp-latest", "temp-avg", "temp-high", "temp-low"], ["--", "--", "--", "--"]);
  }
  if (values.length < 2) return drawEmpty(ctx, width, height, "Sync temp to see the chart");
  drawArea(ctx, width, height, values, "#d99a5b", a => `rgba(217,154,91,${a})`, "#d99a5b");
}

function drawSleepChart() {
  const c = initCanvas("sleepCanvas");
  if (!c) return;
  const { ctx, width, height } = c;
  let points = [];
  for (const rec of filterByRange(records, chartRange.sleep))
    if (rec.type === "sleep" && typeof rec.data.score === "number") points.push(rec.data.score);
  points = points.reverse().slice(-20);
  const sub = $("sleep-chart-sub");
  if (sub) sub.textContent = points.length ? `${points.length} samples` : "No data";
  if (points.length < 2) return drawEmpty(ctx, width, height, "Sync sleep to see the chart");
  drawArea(ctx, width, height, points, "#3b82f6", a => `rgba(59,130,246,${a})`, "#3b82f6");
}

function drawBPChart() {
  const c = initCanvas("bpCanvas");
  if (!c) return;
  const { ctx, width, height } = c;
  const cutoff = Date.now() - (RANGE_DAYS[chartRange.bp] || 7) * 86400000;
  let points = [];
  for (const rec of records) {
    if (rec.type === "bp" && rec.data && new Date(rec.time).getTime() >= cutoff)
      points.push({ sys: rec.data.sys, dia: rec.data.dia });
    else if (rec.type === "all" && Array.isArray(rec.data))
      for (const x of rec.data) if (x.sys && (x.t || 0) >= cutoff) points.push({ sys: x.sys, dia: x.dia });
    else if (rec.type === "bpHist" && Array.isArray(rec.data))
      for (const x of rec.data) if (x.sys && (x.t || 0) >= cutoff) points.push({ sys: x.sys, dia: x.dia });
  }
  points = points.slice(-20);
  const sub = $("bp-chart-sub");
  if (sub) sub.textContent = points.length ? `${points.length} samples` : "No data";
  if (points.length < 2) {
    setStats(["bp-avg", "bp-high", "bp-low"], ["--", "--", "--"]);
    return drawEmpty(ctx, width, height, "Measure a few more times to see the BP chart");
  }
  const sys = points.map(p => p.sys), dia = points.map(p => p.dia);
  setStats(["bp-avg", "bp-high", "bp-low"], [
    `${Math.round(sys.reduce((a, b) => a + b, 0) / sys.length)}/${Math.round(dia.reduce((a, b) => a + b, 0) / dia.length)}`,
    `${Math.max(...sys)}/${Math.max(...dia)}`,
    `${Math.min(...sys)}/${Math.min(...dia)}`
  ]);
  const SYS = 120, DIA = 80, min = 40, max = 180;
  const stepX = width / (points.length - 1);
  const yOf = v => height - ((v - min) / (max - min)) * (height - 20) - 10;
  ctx.save();
  ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(216,181,107,0.6)";
  ctx.beginPath(); ctx.moveTo(0, yOf(SYS)); ctx.lineTo(width, yOf(SYS)); ctx.stroke();
  ctx.fillStyle = "rgba(216,181,107,0.9)"; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
  ctx.setLineDash([]); ctx.fillText("120", 2, yOf(SYS) - 2);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "rgba(13,148,136,0.6)";
  ctx.beginPath(); ctx.moveTo(0, yOf(DIA)); ctx.lineTo(width, yOf(DIA)); ctx.stroke();
  ctx.fillStyle = "rgba(13,148,136,0.9)"; ctx.setLineDash([]); ctx.fillText("80", 2, yOf(DIA) - 2);
  ctx.restore();
  const drawLine = (key, color) => {
    ctx.beginPath();
    points.forEach((pt, i) => { const x = i * stepX, y = yOf(pt[key]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
  };
  drawLine("sys", "#d8b56b"); drawLine("dia", "#8fb8a8");
  points.forEach((pt, i) => {
    const x = i * stepX;
    [["sys", "#d8b56b", SYS], ["dia", "#8fb8a8", DIA]].forEach(([k, col, lim]) => {
      ctx.beginPath(); ctx.arc(x, yOf(pt[k]), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = pt[k] > lim ? "#ef4444" : col; ctx.fill();
    });
  });
}

function drawPressureChart() {
  const c = initCanvas("pressureCanvas");
  if (!c) return;
  const { ctx, width, height } = c;
  if ($("pressureDateLabel")) $("pressureDateLabel").textContent = dateLabel(pressureDate);
  if ($("pressureDateNav")) $("pressureDateNav").style.display = chartRange.pressure === "day" ? "" : "none";
  let raw = [];
  if (chartRange.pressure === "day") {
    for (const rec of records)
      if (rec.type === "pressure" && rec.data)
        for (const x of rec.data) if (sameDay(new Date(x.t), pressureDate)) raw.push(x);
  } else {
    for (const rec of filterByRange(records, chartRange.pressure))
      if (rec.type === "pressure" && rec.data) for (const x of rec.data) raw.push(x);
  }
  const sub = $("pressure-chart-sub");
  if (sub) sub.textContent = raw.length ? `${raw.length} samples` : "No data";
  if (!raw.length) {
    setStats(["pressure-avg", "pressure-high", "pressure-low"], ["--", "--", "--"]);
    return drawEmpty(ctx, width, height, "Sync stress to see the chart");
  }
  const values = raw.map(x => x.pressure);
  setStats(["pressure-avg", "pressure-high", "pressure-low"], [
    Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    Math.max(...values), Math.min(...values)
  ]);
  let bars;
  if (chartRange.pressure === "day") {
    bars = new Array(24).fill(null);
    for (const x of raw) bars[new Date(x.t).getHours()] = x.pressure;
  } else bars = raw.slice(-24).map(x => x.pressure);
  const barW = width / bars.length;
  bars.forEach((v, i) => {
    if (v == null) return;
    const h = (v / 100) * (height - 10);
    ctx.fillStyle = "#d8b56b";
    ctx.beginPath();
    const x = i * barW + barW * 0.15, bw = barW * 0.7;
    ctx.roundRect(x, height - h, bw, h, 4);
    ctx.fill();
  });
}

function drawHypnogram() {
  const c = initCanvas("hypnoCanvas");
  if (!c) return;
  const { ctx, width, height } = c;
  const rec = records.find(r => {
    if (r.type !== "sleep" || !r.data?.segments?.length) return false;
    const t0 = Math.min(...r.data.segments.map(s => new Date(s.start).getTime()));
    return sameDay(new Date(t0), hypnoDate);
  });
  if ($("hypnoDateLabel")) $("hypnoDateLabel").textContent = dateLabel(hypnoDate);
  if (!rec) {
    setStats(["hypno-deep", "hypno-light", "hypno-rem", "hypno-total", "hypno-awake", "hypno-start", "hypno-end"],
      ["--", "--", "--", "--", "--", "--", "--"]);
    if ($("hypno-analysis")) $("hypno-analysis").textContent = "";
    return drawEmpty(ctx, width, height, "No sleep data for this day — try another date");
  }
  const d = rec.data;
  setStats(["hypno-deep", "hypno-light", "hypno-rem", "hypno-total", "hypno-awake"], [
    `${d.deepMin}min`, `${d.lightMin}min`, `${d.remMin}min`,
    `${Math.floor(d.totalMin / 60)}h${d.totalMin % 60}min`,
    `${d.awakeMin ?? 0}min`
  ]);
  const segs = d.segments;
  const tMin = Math.min(...segs.map(s => new Date(s.start).getTime()));
  const tMax = Math.max(...segs.map(s => new Date(s.start).getTime() + s.durSec * 1000));
  setStats(["hypno-start", "hypno-end"], [
    fmt(new Date(tMin)).split(" ").pop().slice(0, 5),
    fmt(new Date(tMax)).split(" ").pop().slice(0, 5)
  ]);
  if ($("hypno-analysis")) {
    const text = d.totalMin >= 420 ? "Sleep duration looks good." : d.totalMin >= 300 ? "Sleep duration is average — a bit more rest would help." : "Sleep duration is short — consider resting more.";
    $("hypno-analysis").textContent = `${text}`;
  }
  const span = (tMax - tMin) || 1;
  const xOf = t => (t - tMin) / span * width;
  const LEVEL = {
    3: { y: height * 0.12, h: height * 0.30, color: "#d8b56b" },
    2: { y: height * 0.46, h: height * 0.30, color: "#3b82f6" },
    5: { y: height * 0.46, h: height * 0.30, color: "#7aa5f8" },
    1: { y: height * 0.80, h: height * 0.18, color: "#3b82f6" },
    4: { y: height * 0.46, h: height * 0.08, color: "#9ca3af" }
  };
  for (const seg of segs) {
    const lvl = LEVEL[seg.stage];
    if (!lvl) continue;
    const x1 = xOf(new Date(seg.start).getTime());
    const x2 = xOf(new Date(seg.start).getTime() + seg.durSec * 1000);
    ctx.fillStyle = lvl.color;
    ctx.beginPath();
    ctx.roundRect(x1, lvl.y, Math.max(x2 - x1, 1.5), lvl.h, 3);
    ctx.fill();
  }
}

function drawStepsChart() {
  const c = initCanvas("stepsCanvas");
  if (!c) return;
  const { ctx, width, height } = c;
  if ($("stepsDateLabel")) $("stepsDateLabel").textContent = dateLabel(stepsDate);
  if ($("stepsDateNav")) $("stepsDateNav").style.display = chartRange.steps === "day" ? "" : "none";
  if ($("stepsHourLabels")) $("stepsHourLabels").style.display = chartRange.steps === "day" ? "" : "none";
  let raw = [];
  for (const rec of records)
    if (rec.type === "stepsHist" && Array.isArray(rec.data))
      for (const x of rec.data) raw.push(x);
  const sub = $("steps-chart-sub");
  if (chartRange.steps === "day") {
    const buckets = new Array(24).fill(0);
    let count = 0;
    for (const x of raw) {
      if (!sameDay(new Date(x.t), stepsDate)) continue;
      const h = typeof x.hour === "number" ? x.hour : new Date(x.t).getHours();
      if (h >= 0 && h < 24) { buckets[h] += x.steps || 0; count++; }
    }
    if (sub) sub.textContent = count ? `${count} segments` : "No data";
    const nonZero = buckets.filter(v => v > 0);
    const total = buckets.reduce((a, b) => a + b, 0);
    setStats(["steps-total", "steps-avg", "steps-high", "steps-low"], [
      total || "--",
      nonZero.length ? Math.round(total / nonZero.length) : "--",
      nonZero.length ? Math.max(...buckets) : "--",
      nonZero.length ? Math.min(...nonZero) : "--"
    ]);
    if (!nonZero.length) return drawEmpty(ctx, width, height, "Sync steps for hourly bars");
    const max = Math.max(...buckets, 1), barW = width / 24;
    buckets.forEach((v, i) => {
      if (v <= 0) return;
      const h = (v / max) * (height - 12);
      ctx.fillStyle = "#d8b56b";
      ctx.beginPath();
      ctx.roundRect(i * barW + barW * 0.15, height - h, barW * 0.7, h, 4);
      ctx.fill();
    });
    return;
  }
  const cutoff = Date.now() - (RANGE_DAYS[chartRange.steps] || 7) * 86400000;
  const byDay = new Map();
  for (const x of raw) {
    if (x.t < cutoff) continue;
    const key = startOfDay(new Date(x.t)).getTime();
    byDay.set(key, (byDay.get(key) || 0) + (x.steps || 0));
  }
  const points = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
  if (sub) sub.textContent = points.length ? `${points.length} days` : "No data";
  if (!points.length) {
    setStats(["steps-total", "steps-avg", "steps-high", "steps-low"], ["--", "--", "--", "--"]);
    return drawEmpty(ctx, width, height, "Sync steps to see the chart");
  }
  const total = points.reduce((a, b) => a + b, 0);
  setStats(["steps-total", "steps-avg", "steps-high", "steps-low"], [
    total, Math.round(total / points.length), Math.max(...points), Math.min(...points)
  ]);
  if (points.length === 1) {
    const max = points[0] || 1;
    ctx.fillStyle = "#d8b56b";
    ctx.beginPath();
    ctx.roundRect(width * 0.35, height - (points[0] / max) * (height - 12), width * 0.3, (points[0] / max) * (height - 12), 6);
    ctx.fill();
    return;
  }
  drawArea(ctx, width, height, points, "#d8b56b", a => `rgba(216,181,107,${a})`, "#d8b56b");
}

function refreshAll() {
  renderHist();
  drawTrendChart();
  drawSleepChart();
  drawBPChart();
  drawPressureChart();
  drawHypnogram();
  drawSpo2Chart();
  drawHRVChart();
  drawStepsChart();
  drawTempChart();
}
