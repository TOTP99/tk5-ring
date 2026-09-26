"use strict";
/* ===== Shared mutable state (single source of truth, no re-declaration elsewhere) ===== */

let device = null, c1 = null, c3 = null;
let c1Buf = new Uint8Array(), c3Buf = new Uint8Array();
let histBusy = false, histTimer = null, histType = null, histChunks = [], histReqKey = null, histEchoType = null, histResolve = null;
let measureResolve = null, measureExpectCode = null, isMeasuring = false, measuringMode = null;
let chartRange = { trend: "week", sleep: "week", bp: "day", pressure: "day", spo2: "week", hrv: "week", steps: "day", temp: "week" };
let pressureDate = startOfDay(new Date()), hypnoDate = startOfDay(new Date()), stepsDate = startOfDay(new Date());
