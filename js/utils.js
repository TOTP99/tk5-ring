"use strict";
/* ===== Small pure helpers shared by every module ===== */

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hex = a => Array.from(a).map(x => x.toString(16).padStart(2, "0")).join(" ");
const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function pad2(n) { return String(n).padStart(2, "0"); }
function ts(b0, b1, b2, b3) {
  const sec = b0 + b1 * 256 + b2 * 65536 + b3 * 16777216;
  // 戒指发的是本地挂钟(自 2000 年起的秒数), 没有时区概念:
  // 先按 UTC 误读, 再把本机时区偏移反解回去, 否则所有时间整体平移一个 UTC offset
  const labeled = new Date((sec + EPOCH) * 1000);
  return new Date(labeled.getTime() + labeled.getTimezoneOffset() * 60000);
}
function fmt(d) { return d.toLocaleString("zh-CN", { hour12: false }); }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function dateLabel(d) { return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`; }
function filterByRange(list, range) {
  const cutoff = Date.now() - (RANGE_DAYS[range] || 7) * 86400000;
  return list.filter(r => new Date(r.time).getTime() >= cutoff);
}

/* CRC16/CCITT-FALSE + packet framing (unchanged wire protocol) */
function crc16(data) {
  let c = 0xffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i] << 8;
    for (let b = 0; b < 8; b++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c;
}
function packet(type, payload = []) {
  const len = 4 + payload.length + 2;
  const p = new Uint8Array(len);
  p[0] = (type >> 8) & 0xff; p[1] = type & 0xff;
  p[2] = len & 0xff; p[3] = (len >> 8) & 0xff;
  p.set(payload, 4);
  const c = crc16(p.slice(0, len - 2));
  p[len - 2] = c & 0xff; p[len - 1] = (c >> 8) & 0xff;
  return p;
}
function timePayload() {
  const d = new Date(), y = d.getFullYear();
  return new Uint8Array([
    y & 0xff, (y >> 8) & 0xff, d.getMonth() + 1, d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getDay() === 0 ? 6 : d.getDay() - 1
  ]);
}
