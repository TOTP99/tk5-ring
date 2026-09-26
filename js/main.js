"use strict";
/* ===== Event wiring + app bootstrap (runs last, after all other modules are loaded) ===== */

document.addEventListener("click", e => {
  const btn = e.target.closest("button");
  if (btn) {
    btn.classList.add("glow");
    setTimeout(() => btn.classList.remove("glow"), 400);
    playClick();
  }
});

document.querySelectorAll("[data-mode]").forEach(b => {
  b.onclick = async () => {
    if (isMeasuring && +b.dataset.mode !== -1) return;
    const mode = +b.dataset.mode;
    if (mode >= 0) {
      isMeasuring = true;
      const cardKey = MODE_CARD[mode];
      const dur = MODE_DURATION[mode] || 28000;
      const expect = MODE_EXPECT[mode] ?? null;
      await measureAndWait(mode, expect, dur, cardKey);
    } else {
      await measure(mode);
    }
  };
});

const btnPower = $("btnPower");
if (btnPower) {
  btnPower.addEventListener("change", async () => {
    if (btnPower.checked) {
      btnPower.disabled = true;
      try { await connect(); }
      finally { btnPower.disabled = false; }

      if (!$("status")?.classList.contains("connected") &&
          !$("statusL1")?.textContent?.includes("In progress")) {
        btnPower.checked = false;
      }
    } else {
      disconnect();
      setStatus("Disconnected", "disconnected");
    }
  });
}
$("btnSteps").onclick = () => send(0x020c);
document.querySelectorAll("[data-h]").forEach(b => b.onclick = () => hist(b.dataset.h));
$("btnCopy").onclick = async () => { try { await navigator.clipboard.writeText(logs.join("\n")); } catch (_) {} };
$("btnClearLog").onclick = () => { logs = []; $("log").textContent = ""; };
$("btnClearRec").onclick = () => {
  if (confirm("Clear local records?")) clearAllRecords();
};

setupRangeTabs("trend-range", "trend", drawTrendChart);
setupRangeTabs("sleep-range", "sleep", drawSleepChart);
setupRangeTabs("bp-range", "bp", drawBPChart);
setupRangeTabs("pressure-range", "pressure", drawPressureChart);
setupRangeTabs("spo2-range", "spo2", drawSpo2Chart);
setupRangeTabs("hrv-range", "hrv", drawHRVChart);
setupRangeTabs("steps-range", "steps", drawStepsChart);
setupRangeTabs("temp-range", "temp", drawTempChart);

$("btnControl").onclick = () => {
  const show = $("panel-control").style.display === "none";
  $("panel-control").style.display = show ? "" : "none";
  $("panel-data").style.display = "none";
};
$("btnData").onclick = () => {
  const show = $("panel-data").style.display === "none";
  $("panel-data").style.display = show ? "" : "none";
  $("panel-control").style.display = "none";
};

document.querySelectorAll("[data-back]").forEach(b => b.onclick = () => showPage("page1"));
$("card-hr").onclick = () => { showPage("pageHR"); drawTrendChart(); };
$("card-spo2").onclick = () => { showPage("pageSpO2"); drawSpo2Chart(); };
$("card-bp").onclick = () => { showPage("pageBP"); drawBPChart(); };
$("card-hrv").onclick = () => { showPage("pageHRV"); drawHRVChart(); };
$("card-sleep").onclick = () => { showPage("pageSleep"); drawSleepChart(); drawHypnogram(); };
$("card-pressure").onclick = () => { showPage("pagePressure"); drawPressureChart(); };
$("card-steps").onclick = (e) => { if (e.target.closest("#btnSteps")) return; showPage("pageSteps"); drawStepsChart(); };
$("card-temp").onclick = () => { showPage("pageTemp"); drawTempChart(); };

$("pressureDatePrev").onclick = () => { pressureDate.setDate(pressureDate.getDate() - 1); drawPressureChart(); };
$("pressureDateNext").onclick = () => { pressureDate.setDate(pressureDate.getDate() + 1); drawPressureChart(); };
$("hypnoDatePrev").onclick = () => { hypnoDate.setDate(hypnoDate.getDate() - 1); drawHypnogram(); };
$("hypnoDateNext").onclick = () => { hypnoDate.setDate(hypnoDate.getDate() + 1); drawHypnogram(); };
$("stepsDatePrev").onclick = () => { stepsDate.setDate(stepsDate.getDate() - 1); drawStepsChart(); };
$("stepsDateNext").onclick = () => { stepsDate.setDate(stepsDate.getDate() + 1); drawStepsChart(); };

/* ---- Bootstrap ---- */
updateClock();
setInterval(updateClock, 1000);
initWeather();
initSoundEffects();
initSeasonEffect();
hydrateFromRecords();
refreshAll();
