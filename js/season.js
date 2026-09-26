"use strict";
/* =====================================================================
   Seasonal falling-emoji ambient effect.
   Spring 🌸 / Summer 🦋 / Autumn 🍁 / Winter ❄️ — picked from the
   device's real current month (see currentSeason() in config.js).
   Runs on a full-screen, pointer-events:none canvas behind the UI.
   Toggled by the small round button under the hero's paw decoration.
===================================================================== */

let seasonCanvas = null, seasonCtx = null, seasonParticles = [], seasonRAF = null, seasonEnabled = true;

function resizeSeasonCanvas() {
  if (!seasonCanvas) return;
  seasonCanvas.width = window.innerWidth;
  seasonCanvas.height = window.innerHeight;
}

function spawnSeasonParticle(emoji) {
  return {
    emoji,
    x: Math.random() * window.innerWidth,
    y: -30,
    size: 16 + Math.random() * 14,
    speed: 0.6 + Math.random() * 1.1,
    drift: (Math.random() - 0.5) * 0.7,
    sway: Math.random() * Math.PI * 2,
    swaySpeed: 0.01 + Math.random() * 0.02,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.02
  };
}

function seasonLoop() {
  if (!seasonEnabled || !seasonCtx) { seasonRAF = null; return; }
  const w = seasonCanvas.width, h = seasonCanvas.height;
  seasonCtx.clearRect(0, 0, w, h);
  const emoji = SEASON_EMOJI[currentSeason()];
  if (Math.random() < 0.035 && seasonParticles.length < 40) seasonParticles.push(spawnSeasonParticle(emoji));
  seasonParticles = seasonParticles.filter(p => p.y < h + 40);
  for (const p of seasonParticles) {
    p.sway += p.swaySpeed;
    p.x += p.drift + Math.sin(p.sway) * 0.6;
    p.y += p.speed;
    p.rotation += p.rotSpeed;
    seasonCtx.save();
    seasonCtx.translate(p.x, p.y);
    seasonCtx.rotate(p.rotation);
    seasonCtx.font = `${p.size}px sans-serif`;
    seasonCtx.textAlign = "center";
    seasonCtx.textBaseline = "middle";
    seasonCtx.globalAlpha = 0.85;
    seasonCtx.fillText(p.emoji, 0, 0);
    seasonCtx.restore();
  }
  seasonRAF = requestAnimationFrame(seasonLoop);
}

function startSeasonEffect() {
  if (seasonRAF || document.hidden) return;
  seasonRAF = requestAnimationFrame(seasonLoop);
}
function stopSeasonEffect() {
  if (seasonRAF) { cancelAnimationFrame(seasonRAF); seasonRAF = null; }
  if (seasonCtx && seasonCanvas) seasonCtx.clearRect(0, 0, seasonCanvas.width, seasonCanvas.height);
  seasonParticles = [];
}

function updateSeasonToggleUI() {
  const btn = $("btnSeasonToggle");
  if (!btn) return;
  btn.textContent = seasonEnabled ? "Effects on" : "Effects";
  btn.classList.toggle("on", seasonEnabled);
  btn.title = seasonEnabled ? "Tap to turn off the ambient effect" : "Tap to turn the ambient effect back on";
}

function initSeasonEffect() {
  seasonCanvas = $("seasonCanvas");
  if (!seasonCanvas) return;
  seasonCtx = seasonCanvas.getContext("2d");
  resizeSeasonCanvas();
  window.addEventListener("resize", resizeSeasonCanvas);

  seasonEnabled = getSeasonEffectEnabled();
  updateSeasonToggleUI();
  if (seasonEnabled) startSeasonEffect();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (seasonRAF) { cancelAnimationFrame(seasonRAF); seasonRAF = null; } }
    else if (seasonEnabled) startSeasonEffect();
  });

  const btn = $("btnSeasonToggle");
  if (btn) {
    btn.onclick = () => {
      seasonEnabled = !seasonEnabled;
      setSeasonEffectEnabled(seasonEnabled);
      updateSeasonToggleUI();
      if (seasonEnabled) startSeasonEffect(); else stopSeasonEffect();
    };
  }
}
