"use strict";
/* ===== Raw byte decoders for each history type (wire format unchanged — do not alter) ===== */

function decodeHR(bytes) {
  const r = [];
  for (let i = 0; i + 6 <= bytes.length; i += 6) {
    const d = ts(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    r.push({ local: fmt(d), t: d.getTime(), hr: bytes[i + 5] });
  }
  return r;
}

function decodeBP(bytes) {
  const r = [];
  for (let i = 0; i + 8 <= bytes.length; i += 8) {
    const d = ts(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    r.push({ local: fmt(d), t: d.getTime(), sys: bytes[i + 5], dia: bytes[i + 6], hr: bytes[i + 7] });
  }
  return r;
}

function decodeAll(bytes) {
  const r = [];
  for (let i = 0; i + 20 <= bytes.length; i += 20) {
    const d = ts(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    r.push({ local: fmt(d), t: d.getTime(), hr: bytes[i + 6], sys: bytes[i + 7], dia: bytes[i + 8], spo2: bytes[i + 9] });
  }
  return r;
}

function decodePressure(bytes) {
  const r = [];
  for (let i = 0; i + 28 <= bytes.length; i += 28) {
    const d = ts(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const t = d.getTime();
    if (t < Date.now() - 400 * 86400000 || t > Date.now() + 86400000) continue;
    // Body data(0x33): HRV int.frac @6-7(毫秒, 字符串拼接); stress int@8 frac@9, 显示×10 (5,3)->53; fatigue @10-11
    const sInt = bytes[i + 8], sFrac = bytes[i + 9];
    const stress = +(`${sInt}${sFrac}`);
    if (stress < 1 || stress > 100) continue; // 原厂只显示 1~100, 之外的是填充值
    const hInt = bytes[i + 6], hFrac = bytes[i + 7];
    r.push({
      local: fmt(d), t,
      pressure: stress, // 兼容旧 UI 字段名; 实际是 stress(1~100)
      stress,
      hrv: parseFloat(hInt + "." + hFrac),
      fatigue: +(`${bytes[i + 10]}${bytes[i + 11]}`) || 0,
      vo2max: bytes[i + 16]
    });
  }
  return r;
}

function decodeTemp(bytes) {
  const r = [];
  // Temperature(0x1E): 7 字节 [ts:u32][type@4][int@5][frac@6]; 显示=字符串拼接 int.frac
  for (let i = 0; i + 7 <= bytes.length; i += 7) {
    const intV = bytes[i + 5], fracV = bytes[i + 6];
    if (intV === 0 || fracV === 15) continue; // 戒指的"没测过"填充值
    const d = ts(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const t = d.getTime();
    if (t < Date.now() - 400 * 86400000 || t > Date.now() + 86400000) continue;
    r.push({ local: fmt(d), t, temp: parseFloat(intV + "." + fracV), type: bytes[i + 4] });
  }
  return r;
}

function decodeSteps(bytes) {
  const r = [];
  if (!bytes || bytes.length < 14) return r;
  // YCBT sport 记录 14 字节: [start:u32][end:u32][steps:u16][distance:u16][calories:u16]
  for (let i = 0; i + 14 <= bytes.length; i += 14) {
    const d = ts(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
    const t = d.getTime();
    if (t < Date.now() - 400 * 86400000 || t > Date.now() + 86400000) continue;
    const steps = bytes[i + 8] | (bytes[i + 9] << 8);
    if (steps > 100000) continue;
    r.push({
      local: fmt(d), t, steps,
      distance: bytes[i + 10] | (bytes[i + 11] << 8),
      calories: bytes[i + 12] | (bytes[i + 13] << 8),
      hour: d.getHours()
    });
  }
  return r;
}

function decodeSleep(bytes) {
  if (!bytes || bytes.length < 8) return null;
  let start = null, end = null;
  let deepSec = 0, lightSec = 0, remSec = 0, awakeSec = 0, napSec = 0, sessionCount = 0;
  const segments = [];

  let i = 0;
  while (i + 20 <= bytes.length) {
    const len = bytes[i + 2] | (bytes[i + 3] << 8); // 整个 session 的字节数(含这 20 字节 header)
    if (len < 20 || i + len > bytes.length) break;
    const segEnd = i + len;
    const sStart = ts(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const sEnd = ts(bytes[i + 8], bytes[i + 9], bytes[i + 10], bytes[i + 11]);
    if (!start || sStart < start) start = sStart;
    if (!end || sEnd > end) end = sEnd;
    for (let j = i + 20; j + 8 <= segEnd; j += 8) {
      const rawTag = bytes[j];
      const stage = rawTag & 0x0f; // 1深 2浅 3REM 4清醒 5小睡; 高4位是 flag, 不能精确匹配 0xf1
      if (stage < 1 || stage > 5) continue; // 未知 tag 跳过, 绝不能中断(否则 nap 会截断整晚)
      const segStart = ts(bytes[j + 1], bytes[j + 2], bytes[j + 3], bytes[j + 4]);
      const durSec = bytes[j + 5] | (bytes[j + 6] << 8) | (bytes[j + 7] << 16); // u24, 不是 u16
      if (durSec <= 0 || durSec >= 86400) continue;
      segments.push({ type: rawTag, stage, start: segStart, durSec });
      if (stage === 1) deepSec += durSec;
      else if (stage === 2) lightSec += durSec;
      else if (stage === 3) remSec += durSec;
      else if (stage === 4) awakeSec += durSec;
      else if (stage === 5) napSec += durSec;
    }
    sessionCount++;
    i += len;
  }

  if (!segments.length && bytes.length >= 8) {
    // 兜底: 无 session 头的裸 8 字节段
    for (let j = 0; j + 8 <= bytes.length; j += 8) {
      const rawTag = bytes[j];
      const stage = rawTag & 0x0f;
      if (stage < 1 || stage > 5) continue;
      const segStart = ts(bytes[j + 1], bytes[j + 2], bytes[j + 3], bytes[j + 4]);
      const t = segStart.getTime();
      if (t < Date.now() - 400 * 86400000 || t > Date.now() + 86400000) continue;
      const durSec = bytes[j + 5] | (bytes[j + 6] << 8) | (bytes[j + 7] << 16);
      if (durSec <= 0 || durSec >= 86400) continue;
      segments.push({ type: rawTag, stage, start: segStart, durSec });
      if (stage === 1) deepSec += durSec;
      else if (stage === 2) lightSec += durSec;
      else if (stage === 3) remSec += durSec;
      else if (stage === 4) awakeSec += durSec;
      else if (stage === 5) napSec += durSec;
      if (!start || segStart < start) start = segStart;
      const sEnd = new Date(t + durSec * 1000);
      if (!end || sEnd > end) end = sEnd;
    }
    if (segments.length) sessionCount = 1;
  }

  if (!start || !segments.length) return null;
  const asleepSec = deepSec + lightSec + remSec;
  if (asleepSec <= 0) return null;
  const rmin = s => Math.round(s / 60);
  return {
    start: fmt(start), end: fmt(end),
    deepMin: rmin(deepSec), lightMin: rmin(lightSec), remMin: rmin(remSec),
    awakeMin: rmin(awakeSec), napMin: rmin(napSec),
    totalMin: rmin(asleepSec),
    score: Math.round((deepSec / asleepSec) * 100),
    sessionCount, segments
  };
}
