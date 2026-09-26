"use strict";
/* ===== Protocol & app-wide constants ===== */

const SVC = "be940000-7333-be46-b7ae-689e71722bd5";
const C1U = "be940001-7333-be46-b7ae-689e71722bd5";
const C3U = "be940003-7333-be46-b7ae-689e71722bd5";
const EPOCH = 946684800;
const REALTIME = new Set([0x0600, 0x0601, 0x0602, 0x0603, 0x0615, 0x040e, 0x0200, 0x020c, 0x0203]);
const HIST_LABEL = { "09": "All", "08": "BP", "06": "HR", "04": "Sleep", "02": "Steps", "1a": "SpO₂", "1e": "Temp", "33": "Stress" };
const MODE_NAME = { 0: "Heart Rate", 1: "Blood Pressure", 2: "SpO₂", 3: "Stress", 10: "HRV" };
const MODE_CARD = { 0: "hr", 1: "bp", 2: "spo2", 10: "hrv", 3: "pressure" };
const MODE_NATURE = { 0: "rhythmic", 2: "rhythmic", 10: "rhythmic", 1: "discrete", 3: "discrete" };
const MODE_DURATION = { 0: 28000, 2: 26000, 10: 30000, 1: 32000, 3: 22000 };
const MODE_EXPECT = { 0: 0, 1: 1, 10: 10, 3: 3 };
const RANGE_DAYS = { day: 1, week: 7, month: 30, year: 365 };
const PAGES = ["page1", "pageHR", "pageSpO2", "pageHRV", "pageBP", "pageSleep", "pagePressure", "pageSteps", "pageTemp"];

/* Calendar labels for the electronic clock card */
const MONTHS_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/* Full weekday names (not abbreviated), e.g. "Monday" */
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* Seasonal falling-emoji effect (Northern Hemisphere meteorological seasons) */
const SEASON_EMOJI = {
  spring: "🌸", // Mar, Apr, May
  summer: "🦋", // Jun, Jul, Aug
  autumn: "🍁", // Sep, Oct, Nov
  winter: "❄️"  // Dec, Jan, Feb
};
function currentSeason(month = new Date().getMonth()) {
  if (month >= 2 && month <= 4) return "spring";
  if (month >= 5 && month <= 7) return "summer";
  if (month >= 8 && month <= 10) return "autumn";
  return "winter";
}
