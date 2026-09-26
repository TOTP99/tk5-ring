"use strict";
/* ===== BLE transport (send/feed/handle) + connect/disconnect + measurement flow ===== */

async function send(type, payload = []) {
  if (!c1) return;
  const p = packet(type, payload);
  log(`TX 0x${type.toString(16).padStart(4, "0")} [${hex(p)}]`);
  try {
    if (c1.properties.writeWithoutResponse) await c1.writeValueWithoutResponse(p);
    else await c1.writeValue(p);
  } catch (e) { log("TX ERR " + e.message); }
}

function feed(kind, data) {
  let buf = kind === "C1" ? c1Buf : c3Buf;
  buf = cat(buf, new Uint8Array(data));
  while (buf.length >= 4) {
    const total = buf[2] | (buf[3] << 8);
    if (total < 6) { buf = buf.slice(1); continue; }
    if (buf.length < total) break;
    const pkt = buf.slice(0, total);
    buf = buf.slice(total);
    const type = (pkt[0] << 8) | pkt[1];
    const payload = pkt.slice(4, pkt.length - 2);
    const ok = (pkt[pkt.length - 2] | (pkt[pkt.length - 1] << 8)) === crc16(pkt.slice(0, pkt.length - 2));
    log(`RX ${kind} 0x${type.toString(16).padStart(4, "0")} ${ok ? "OK" : "BAD"} [${hex(payload)}]`);
    handle(type, payload);
  }
  if (kind === "C1") c1Buf = buf; else c3Buf = buf;
}


function handle(type, p) {
  // 04 组是戒指→App 的推送: 必须先回 ACK(04 <key> {00})再解码, 否则戒指会重发;
  // 1 字节 0xFB~0xFF 是错误帧, 不回 ACK
  if ((type >> 8) === 0x04 && !(p.length === 1 && p[0] >= 0xfb)) send(type, [0x00]);
  if (histBusy && type === histEchoType && p.length < 10) {
    log(`${HIST_LABEL[histReqKey] || histReqKey || "?"} — no new records`);
    finishHist();
    return;
  }
  if (histBusy && type !== 0x0580 && type !== histEchoType && !REALTIME.has(type)) {
    if (histType === null) histType = type;
    histChunks.push(p);
    return;
  }
  switch (type) {
    case 0x0200:
      if (p.length === 1 && p[0] >= 0xfb) { log("Device info error 0x" + p[0].toString(16)); break; }
      // 真电量在回复的 payload[5] (0x64=100%)。2026-09-25 用户 SmartHealth 显示 78%,
      // 连上后这里应读出 78 才能最终确认该偏移在 52F5 上成立。
      if (p.length > 5 && p[5] <= 100) setRingBattery(p[5], "02 00");
      else log("02 00 reply [" + hex(p) + "]");
      break;
    case 0x0201:
      // 功能位图回复(约66字节): 哪些传感器可用(体温/血压/压力/疲劳/血糖), 先打原始字节备查
      log("02 01 capability (" + p.length + "B): [" + hex(p) + "]");
      break;
    case 0x020c:
      if (p.length >= 2) {
        const s = p[0] | (p[1] << 8);
        if (s > 0) { $("steps").textContent = s; }
      }
      break;
    case 0x0600:
      if (p.length >= 4) {
        const s = p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24);
        if (s > 0 && s < 200000) { $("steps").textContent = s; }
      } else if (p.length >= 2) {
        const s = p[0] | (p[1] << 8);
        if (s > 0 && s < 200000) { $("steps").textContent = s; }
      }
      break;
    case 0x0615:
      // 电池推送 [充电状态][电量%]: 旧代码误把 p[0](充电状态) 当成了电量
      if (p.length >= 2 && p[1] <= 100) setRingBattery(p[1], p[0] ? "charging" : "06 15");
      else log("06 15 [" + hex(p) + "]");
      break;
    case 0x0601:
      if (p[0] > 0 && p[0] < 250) {
        $("hr").textContent = p[0];
        setDot("hr", evalHR(p[0]));
        add("hr", p[0]);
        if (isMeasuring) onMeasureDone("hr");
      }
      break;
    case 0x0602:
      if (p[0] > 0 && p[0] <= 100) {
        $("spo2").textContent = p[0];
        setDot("spo2", evalSpo2(p[0]));
        add("spo2", p[0]);
        if (isMeasuring) onMeasureDone("spo2");
      }
      break;
    case 0x0603:
      if (p.length >= 3 && p[0] > 0 && p[1] > 0) {
        $("bp").textContent = `${p[0]} / ${p[1]}`;
        $("bpHr").textContent = "HR " + p[2];
        setDot("bp", evalBP(p[0], p[1]));
        add("bp", { sys: p[0], dia: p[1], hr: p[2] });
        if (isMeasuring) onMeasureDone("bp");
      } else if (p.length >= 4 && p[3] > 0) {
        $("hrv").textContent = p[3];
        setDot("hrv", evalHRV(p[3]));
        add("hrv", p[3]);
        if (isMeasuring) onMeasureDone("hrv");
      }
      break;
    case 0x040e:
      if (measureResolve && p[0] === measureExpectCode) {
        const r = measureResolve; measureResolve = null; measureExpectCode = null; r();
      } else if (isMeasuring && MODE_EXPECT[p[0]] != null) {
        const cardKey = MODE_CARD[p[0]];
        if (cardKey) onMeasureDone(cardKey);
      }
      break;
    case 0x0580: {
      send(0x0580, [0x00]);
      const buf = histChunks.reduce(cat, new Uint8Array());
      if (histReqKey === "06") addUnique("hrHist", decodeHR(buf));
      else if (histReqKey === "08") addUnique("bpHist", decodeBP(buf));
      else if (histReqKey === "09") addUnique("all", decodeAll(buf));
      else if (histReqKey === "33") {
        const data = decodePressure(buf);
        addUnique("pressure", data);
        if (data.length && $("pressureVal")) {
          const last = data[data.length - 1];
          $("pressureVal").textContent = last.pressure;
          setDot("pressure", evalPressure(last.pressure));
          if ($("fatigueVal")) $("fatigueVal").textContent = last.fatigue || "--";
          if ($("vo2maxVal")) $("vo2maxVal").textContent = last.vo2max || "--";
          onMeasureDone("pressure");
        }
      } else if (histReqKey === "02") {
        const data = decodeSteps(buf);
        if (data.length) {
          addUnique("stepsHist", data);
          const today = startOfDay(new Date());
          let sum = 0;
          for (const x of data) if (sameDay(new Date(x.t), today)) sum += x.steps;
          if (sum > 0 && $("steps") && ($("steps").textContent === "--" || +$("steps").textContent < sum)) {
            $("steps").textContent = sum;
          }
        } else if (buf.length) add("raw", { key: histReqKey, label: HIST_LABEL[histReqKey] || histReqKey, frameType: histType, hex: hex(buf), bytes: buf.length });
      } else if (histReqKey === "04") {
        const data = decodeSleep(buf);
        if (data) {
          const dup = records.some(r => r.type === "sleep" && r.data && r.data.start === data.start);
          if (!dup) add("sleep", data);
          if ($("sleepMin")) $("sleepMin").textContent = `${Math.floor(data.totalMin / 60)}h${data.totalMin % 60}m`;
          setSleepEmojis(data);
          log(`Sleep parsed: ${data.totalMin} min (deep ${data.deepMin}/light ${data.lightMin}/REM ${data.remMin}/awake ${data.awakeMin}）`);
        } else if (buf.length) {
          add("raw", { key: histReqKey, label: HIST_LABEL[histReqKey] || histReqKey, frameType: histType, hex: hex(buf), bytes: buf.length });
          if ($("sleepMin") && $("sleepMin").textContent === "--") $("sleepMin").textContent = "Data available";
          log(`Sleep data ${buf.length} bytes — could not parse stages (raw saved)`);
        } else {
          if ($("sleepMin") && $("sleepMin").textContent === "--") $("sleepMin").textContent = "No record";
          log("Sleep history empty (ring may not have been worn overnight)");
        }
      } else if (histReqKey === "1e") {
        const data = decodeTemp(buf);
        if (data.length) {
          addUnique("tempHist", data);
          const last = data[data.length - 1];
          if ($("tempVal")) { $("tempVal").textContent = last.temp.toFixed(1); setDot("temp", evalTemp(last.temp)); }
          log(`Temp: ${data.length} records, latest ${last.temp}°C @ ${last.local}`);
        } else if (buf.length) {
          add("raw", { key: histReqKey, label: HIST_LABEL[histReqKey] || histReqKey, frameType: histType, hex: hex(buf), bytes: buf.length });
          log(`Temp data ${buf.length} bytes — no valid records (all fillers?)`);
        } else {
          log("Temp: no records (monitor was just enabled — wear the ring and sync later)");
        }
      } else if (buf.length) {
        add("raw", { key: histReqKey, label: HIST_LABEL[histReqKey] || histReqKey, frameType: histType, hex: hex(buf), bytes: buf.length });
      }
      finishHist();
      break;
    }
  }
}

async function connect() {
  try {
    if (!navigator.bluetooth) throw new Error("Requires Bluefy / Chrome");
    setStatus("Selecting Bluetooth device...", "disconnected");
    if (device?.gatt?.connected) try { device.gatt.disconnect(); } catch (_) {}
    device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "TK5" }, { namePrefix: "tk5" }],
      optionalServices: [SVC]
    });
    await device.gatt.connect();
    const svc = await device.gatt.getPrimaryService(SVC);
    c1 = await svc.getCharacteristic(C1U);
    c3 = await svc.getCharacteristic(C3U);
    c1.addEventListener("characteristicvaluechanged", e => feed("C1", e.target.value.buffer));
    c3.addEventListener("characteristicvaluechanged", e => feed("C3", e.target.value.buffer));
    await c1.startNotifications();
    await c3.startNotifications();
    device.addEventListener("gattserverdisconnected", () => {
      setStatus("Device disconnected", "disconnected");
      c1 = c3 = null;
      histBusy = false;
      isMeasuring = false;
      measuringMode = null;
      measuringCard = null;
      clearProgress();
    });
    setStatus("Connected · " + (device.name || "TK5"), "connected");
    await send(0x0201, [0x47, 0x46]);
    await send(0x0100, timePayload());
    await send(0x021b);
    await send(0x0200);
    await send(0x0203);
    await send(0x020c);
    await send(0x032f, [0x01, 0x00]);
    await send(0x0309, [0x01, 0x00, 0x02, 0xa0]);
    await send(0x0120, [0x01, 60]); // 全天体温监测开(间隔60分钟): 不开戒指不记录体温历史
    (async () => {
      isMeasuring = true;
      try {
        await sleep(500);
        setStatus("Fetching steps...");
        await hist("02");
        setStatus("Fetching sleep data...");
        await hist("04");
        setStatus("Measuring BP — stay still...");
        await measureAndWait(1, 1, MODE_DURATION[1], "bp");
        setStatus("Measuring heart rate...");
        await measureAndWait(0, 0, MODE_DURATION[0], "hr");
        setStatus("Connected · " + (device?.name || "TK5") + " (auto complete)", "connected");
      } catch (e) {
        log("Auto measure error: " + e.message);
        setStatus("Connected · " + (device?.name || "TK5"), "connected");
      } finally {
        isMeasuring = false;
        measuringCard = null;
        clearProgress();
      }
    })();
  } catch (e) {
    setStatus("Connect failed: " + e.message, "disconnected");
    isMeasuring = false;
    measuringCard = null;
    clearProgress();
  }
}

function disconnect() {
  try { if (device?.gatt?.connected) device.gatt.disconnect(); } catch (_) {}
}

async function measure(mode) {
  if (!c1) return;
  if (mode < 0) {
    measuringCard = null;
    isMeasuring = false;
    clearProgress();
    await send(0x032f, [0x00, measuringMode ?? 0]); // stop 必须回显启动时的 mode, 否则停的是心率
    measuringMode = null;
    setStatus("Connected · " + (device?.name || "TK5"), "connected");
    return;
  }
  measuringMode = mode;
  await send(0x032f, [0x01, mode]);
}

async function measureAndWait(mode, expectCode, timeoutMs, cardKey) {
  const nature = MODE_NATURE[mode] || "rhythmic";
  setStatus(nature === "discrete"
    ? `Measuring ${MODE_NAME[mode]} — stay still...`
    : `Measuring ${MODE_NAME[mode]} — keep wearing...`);
  startProgress(cardKey, timeoutMs, nature);
  await measure(mode);
  if (expectCode === null) {
    await sleep(timeoutMs);
  } else {
    await Promise.race([
      new Promise(resolve => { measureExpectCode = expectCode; measureResolve = resolve; }),
      sleep(timeoutMs)
    ]);
    measureResolve = null;
    measureExpectCode = null;
  }
  onMeasureDone(cardKey);
  if (mode === 3) { setStatus("Syncing stress results..."); await hist("33"); }
}

function finishHist() {
  clearTimeout(histTimer);
  histBusy = false; histType = null; histChunks = []; histReqKey = null; histEchoType = null;
  document.querySelectorAll("[data-h]").forEach(b => b.disabled = false);
  setStatus("Connected · " + (device?.name || "TK5"), "connected");
  if (histResolve) { const r = histResolve; histResolve = null; r(); }
}

function hist(key) {
  return new Promise(async resolve => {
    if (!c1) { resolve(); return; }
    if (histBusy) { finishHist(); await sleep(200); }
    histBusy = true; histType = null; histChunks = []; histReqKey = key;
    histEchoType = 0x0500 | parseInt(key, 16);
    histResolve = resolve;
    document.querySelectorAll("[data-h]").forEach(b => b.disabled = true);
    setStatus(`Syncing ${HIST_LABEL[key] || key}…`);
    await send(histEchoType);
    histTimer = setTimeout(() => { if (histBusy) finishHist(); }, 20000);
  });
}

