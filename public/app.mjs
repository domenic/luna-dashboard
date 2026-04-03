import { locales } from "./locale.mjs";

if (!globalThis.Temporal) {
  const { Temporal } = await import("https://esm.sh/temporal-polyfill");
  globalThis.Temporal = Temporal;
}

const L = locales[new URLSearchParams(location.search).get("lang")] ?? locales.en;

// ============================================================
// Configuration
// ============================================================

const NNBSP = "\u202F"; // narrow no-break space (SI unit separator)

const DAYS_PER_MONTH = 365.25 / 12;

// Royal Canin JP: Mini Indoor Puppy
const FOOD_TABLE = {
  ageMonths: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  dryGramsByAdultKg: {
    2: [50, 56, 57, 57, 49, 41, 41, 40, 40],
    4: [81, 91, 95, 95, 87, 78, 69, 68, 67],
  },
};

const CONFIG = {
  name: "Luna",
  birthday: "2025-12-21",
  food: {
    expectedAdultKg: 2.7,
    waterTaperStartDay: 95,
    waterTaperEndDay: 122,
    initialWaterPerDry: 55 / 45,
  },
  camera: {
    src: "luna-cam",
    apiURL: "http://cam.local",
  },
  recentWeightsCount: 5,
  countAnimationMS: 1200,
  sparkleIntervalMS: 800,
  dataRefreshMS: 30 * 1000,
  titleRotateMS: 15 * 60 * 1000,
  ageRefreshMS: 60 * 1000,
};

const MILESTONES = [
  { ageDays: 0, label: "Birthday!" },
  { ageDays: 73, label: "Went home!" },
  { ageWeeks: 12, label: "Human socialization window starts closing" },
  { ageWeeks: 15, label: "Ready to go on walks outside" },
  { ageWeeks: 18, label: "Dog socialization window starts closing" },
  { ageWeeks: 18, label: "Ensure bite inhibition" },
  { ageWeeks: 24, label: "Spay eligible" },
  { ageWeeks: 26, label: "Adolescence begins / adult teeth fully in" },
  { ageWeeks: 43, label: "Transition to adult food" },
  { ageWeeks: 52, label: "Fully grown" },
];

function milestoneDays(m) {
  return m.ageDays ?? m.ageWeeks * 7;
}

// ============================================================
// Age calculations (Temporal API)
// ============================================================

const BIRTHDAY = Temporal.PlainDate.from(CONFIG.birthday);

function today() {
  return Temporal.Now.plainDateISO();
}

function now() {
  return Temporal.Now.plainDateTimeISO();
}

function age() {
  return BIRTHDAY.until(today());
}

function ageDays() {
  return age().total({ unit: "days", relativeTo: BIRTHDAY });
}

// ============================================================
// API helpers
// ============================================================

async function apiGet(url) {
  const res = await fetch(url);
  return res.json();
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiPatch(url, body) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiDelete(url) {
  const res = await fetch(url, { method: "DELETE" });
  return res.json();
}

// ============================================================
// Age display
// ============================================================

function animateCount(el, target, decimals = 0) {
  const from = Number(el.textContent) || 0;
  if (from === target) return;
  const duration = CONFIG.countAnimationMS;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    const val = from + (target - from) * eased;
    el.textContent = decimals ? val.toFixed(decimals) : Math.round(val);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function updateAge() {
  const a = age();
  const days = a.total({ unit: "days", relativeTo: BIRTHDAY });
  const weeks = Math.floor(a.total({ unit: "weeks", relativeTo: BIRTHDAY }));
  const months = a.total({ unit: "months", relativeTo: BIRTHDAY });

  animateCount(document.getElementById("age-days"), days);
  animateCount(document.getElementById("age-weeks"), weeks);
  animateCount(document.getElementById("age-months"), months, 1);

  const next = MILESTONES.find(m => milestoneDays(m) > days);
  const el = document.getElementById("next-milestone");
  if (next) {
    const daysUntil = milestoneDays(next) - days;
    el.innerHTML = L.nextMilestone(next.label, daysUntil);
  } else {
    el.innerHTML = L.allMilestonesReached;
  }
}

// ============================================================
// Milestones
// ============================================================

function updateMilestones() {
  const days = ageDays();
  const container = document.getElementById("timeline");
  container.innerHTML = "";

  const nextMilestone = MILESTONES.find(x => milestoneDays(x) > days);

  for (const m of MILESTONES) {
    const mDays = milestoneDays(m);
    const mWeeks = Math.floor(mDays / 7);
    const div = document.createElement("div");
    const status = mDays <= days ? "past" : m === nextMilestone ? "next" : "future";
    div.className = "milestone " + status;

    const label = document.createElement("div");
    label.className = "milestone-label";
    label.textContent = m.label;

    const ageLabel = document.createElement("div");
    ageLabel.className = "milestone-age";
    const milestoneDate = BIRTHDAY.add({ days: mDays });
    let text = mWeeks >= 52
      ? L.months(Math.round(mWeeks / 4.33)) + " · " + L.dayCount(mDays)
      : L.weeks(mWeeks) + " · " + L.dayCount(mDays);
    text += " · " + formatDate(milestoneDate);
    if (mDays > days) {
      const daysUntil = mDays - days;
      text += " · " + L.daysUntil(daysUntil);
    } else if (mDays < days) {
      const daysAgo = days - mDays;
      text += " · " + L.daysAgo(daysAgo);
    }
    ageLabel.textContent = text;

    div.append(label, ageLabel);
    container.append(div);
  }
}

// ============================================================
// Food
// ============================================================

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function interp1d(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs.at(-1)) return ys.at(-1);
  for (let i = 0; i < xs.length - 1; i++) {
    if (x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
      return lerp(ys[i], ys[i + 1], t);
    }
  }
  return ys.at(-1);
}

function dailyDryGrams(days) {
  const ageMonths = days / DAYS_PER_MONTH;
  const ages = FOOD_TABLE.ageMonths;
  const g2 = interp1d(ages, FOOD_TABLE.dryGramsByAdultKg[2], ageMonths);
  const g4 = interp1d(ages, FOOD_TABLE.dryGramsByAdultKg[4], ageMonths);
  const sizeT = clamp((CONFIG.food.expectedAdultKg - 2) / (4 - 2), 0, 1);
  return Math.round(lerp(g2, g4, sizeT));
}

function waterPerDryGram(days) {
  const { waterTaperStartDay, waterTaperEndDay, initialWaterPerDry } = CONFIG.food;
  if (days <= waterTaperStartDay) return initialWaterPerDry;
  if (days >= waterTaperEndDay) return 0;
  const t = (days - waterTaperStartDay) / (waterTaperEndDay - waterTaperStartDay);
  return initialWaterPerDry * (1 - t);
}

function updateFood() {
  const days = ageDays();
  const dry = dailyDryGrams(days);
  const water = Math.round(dry * waterPerDryGram(days));
  const total = dry + water;
  const container = document.getElementById("food-info");

  let html =
    '<div class="food-total">' + dry + NNBSP + 'g <span>' + L.dryPerDay + '</span></div>' +
    '<div class="food-breakdown">';

  if (water > 0) {
    html +=
      '<div class="food-component">' +
        '<div class="food-amount">' + water + NNBSP + 'g</div>' +
        '<div class="food-label">' + L.water + '</div>' +
      '</div>' +
      '<div class="food-component">' +
        '<div class="food-amount">' + total + NNBSP + 'g</div>' +
        '<div class="food-label">' + L.total + '</div>' +
      '</div>';
  }

  html += '</div>';

  if (days / DAYS_PER_MONTH >= 10) {
    html += '<div class="food-note">' + L.switchToAdultFood + '</div>';
  }

  container.innerHTML = html;
}

// ============================================================
// Weight
// ============================================================

let currentWeights = [];

async function loadWeights() {
  currentWeights = await apiGet("/api/weights");
  renderWeights();
  document.querySelector(".weight").classList.add("loaded");
}

function renderWeights() {
  drawWeightChart(currentWeights);
  renderWeightEntries(currentWeights);
}

function renderWeightEntries(weights) {
  const container = document.getElementById("weight-entries");
  const recent = weights.slice(-CONFIG.recentWeightsCount).reverse();
  container.innerHTML = "";
  for (const w of recent) {
    const row = document.createElement("div");
    row.className = "weight-entry";

    const dateSpan = document.createElement("span");
    dateSpan.className = "weight-entry-date";
    dateSpan.textContent = formatDate(w.date);

    const valSpan = document.createElement("span");
    valSpan.className = "weight-entry-value";
    valSpan.textContent = w.grams + NNBSP + "g";

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.addEventListener("click", () => deleteWeight(w.date));

    row.append(dateSpan, valSpan, btn);
    container.append(row);
  }
}

async function deleteWeight(date) {
  currentWeights = await apiDelete("/api/weights/" + date);
  renderWeights();
}

function plainDateToEpochDay(isoStr) {
  return Temporal.PlainDate.from(isoStr).since("1970-01-01", { largestUnit: "days" }).days;
}

const colors = (() => {
  const v = k => getComputedStyle(document.documentElement).getPropertyValue(k);
  return {
    bg: v("--bg"),
    cardBG: v("--card-bg"),
    cardBorder: v("--card-border"),
    text: v("--text"),
    textDim: v("--text-dim"),
    accent: v("--accent"),
    blue: v("--blue"),
  };
})();

function prepareCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  return { ctx, w: rect.width, h: rect.height };
}

function drawWeightChart(weights) {
  const canvas = document.getElementById("weight-chart");
  const { ctx, w, h } = prepareCanvas(canvas);

  ctx.clearRect(0, 0, w, h);

  if (weights.length === 0) {
    ctx.fillStyle = colors.textDim;
    ctx.font = "0.9rem system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(L.noDataYet, w / 2, h / 2);
    return;
  }

  const pad = { top: 10, right: 10, bottom: 10, left: 10 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const grams = weights.map(e => e.grams);
  let minG = Math.min(...grams);
  let maxG = Math.max(...grams);
  if (minG === maxG) {
    minG -= 100;
    maxG += 100;
  } else {
    const range = maxG - minG;
    minG -= range * 0.1;
    maxG += range * 0.1;
  }

  const epochDays = weights.map(e => plainDateToEpochDay(e.date));
  let minD = epochDays[0];
  let maxD = epochDays[epochDays.length - 1];
  if (minD === maxD) {
    minD -= 1;
    maxD += 1;
  }

  const scaleX = d => pad.left + ((d - minD) / (maxD - minD)) * plotW;
  const scaleY = g => pad.top + plotH - ((g - minG) / (maxG - minG)) * plotH;

  // Line
  ctx.beginPath();
  ctx.strokeStyle = colors.blue;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  weights.forEach((entry, i) => {
    const x = scaleX(epochDays[i]);
    const y = scaleY(entry.grams);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  for (let i = 0; i < weights.length; i++) {
    const x = scaleX(epochDays[i]);
    const y = scaleY(weights[i].grams);
    ctx.beginPath();
    ctx.fillStyle = colors.blue;
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = colors.cardBG;
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

}

// ============================================================
// Events
// ============================================================

let currentEvents = [];

async function loadEvents() {
  currentEvents = await apiGet("/api/events");
  renderEvents();
  document.querySelector(".events").classList.add("loaded");
}

function eventToPlainDate(event) {
  if (event.date) return Temporal.PlainDate.from(event.date);
  if (event.ageWeeks !== undefined) {
    return BIRTHDAY.add({ days: event.ageWeeks * 7 });
  }
  return today();
}

function renderEvents() {
  const container = document.getElementById("events-list");
  const now = today();

  const upcoming = currentEvents
    .map(e => ({ ...e, computedDate: eventToPlainDate(e) }))
    .filter(e => Temporal.PlainDate.compare(e.computedDate, now) >= 0)
    .sort((a, b) => Temporal.PlainDate.compare(a.computedDate, b.computedDate));

  if (upcoming.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-style: italic;">' + L.noUpcomingEvents + '</div>';
    return;
  }

  container.innerHTML = "";
  for (const e of upcoming) {
    const daysUntil = now.until(e.computedDate, { largestUnit: "days" }).days;
    const daysLabel = daysUntil === 0 ? L.today : daysUntil === 1 ? L.tomorrow : L.daysUntil(daysUntil);
    const item = document.createElement("div");
    item.className = "event-item";

    const dateSpan = document.createElement("span");
    dateSpan.className = "event-date";
    dateSpan.textContent = formatDate(e.computedDate) + " ";
    const small = document.createElement("small");
    small.textContent = "(" + daysLabel + ")";
    dateSpan.append(small);

    const titleSpan = document.createElement("span");
    titleSpan.className = "event-title";
    titleSpan.textContent = e.title;

    const btn = document.createElement("button");
    btn.className = "event-delete";
    btn.textContent = "×";
    btn.addEventListener("click", () => deleteEvent(e.id));

    item.append(dateSpan, titleSpan, btn);
    container.append(item);
  }
}

async function deleteEvent(id) {
  currentEvents = await apiDelete("/api/events/" + id);
  renderEvents();
}

// ============================================================
// Camera (on-demand lightbox via go2rtc <video-stream>)
// ============================================================

function setupCameraLightbox() {
  const lightbox = document.getElementById("camera-lightbox");
  const streamURL = CONFIG.camera.apiURL + "/api/ws?src=" + CONFIG.camera.src;

  document.getElementById("camera-btn").addEventListener("click", () => {
    const loading = document.createElement("p");
    loading.textContent = L.connecting;

    const stream = document.createElement("video-stream");
    stream.src = streamURL;
    stream.addEventListener("playing", () => lightbox.classList.remove("loading"), { capture: true });

    lightbox.classList.add("loading");
    lightbox.append(loading, stream);
    lightbox.showModal();
  });

  lightbox.addEventListener("close", () => {
    lightbox.classList.remove("loading");
    lightbox.innerHTML = "";
  });

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) lightbox.close();
  });
}

// ============================================================
// Accident tracker
// ============================================================

function deriveLastAccident() {
  const accidents = currentPottyLog.filter(e => e.accident);
  if (accidents.length === 0) return undefined;
  const latest = accidents.reduce((a, b) => a.time > b.time ? a : b);
  return Temporal.PlainDate.from(latest.time);
}

function renderAccidentTracker(lastDate) {
  const container = document.getElementById("accident-tracker");
  const days = lastDate
    ? lastDate.until(today(), { largestUnit: "days" }).days
    : "?";

  container.className = "accident-tracker" + (days === 0 ? " zero-days" : "");

  let html =
    '<div class="accident-text">' + L.sinceLastAccident(days) + '</div>';

  // Streak grid: one cell per day from first potty entry to today
  const accidents = currentPottyLog.filter(e => e.accident);
  const countByDate = new Map();
  for (const e of accidents) {
    const date = e.time.slice(0, 10);
    countByDate.set(date, (countByDate.get(date) || 0) + 1);
  }

  const firstEntry = currentPottyLog.length > 0
    ? currentPottyLog.reduce((a, b) => a.time < b.time ? a : b).time.slice(0, 10)
    : undefined;

  if (firstEntry) {
    // Align to Sunday start: back up to the Sunday on or before the first entry
    const firstDate = Temporal.PlainDate.from(firstEntry);
    const start = firstDate.subtract({ days: firstDate.dayOfWeek % 7 });
    const end = today();
    const totalDays = start.until(end, { largestUnit: "days" }).days + 1;
    const weeks = Math.ceil(totalDays / 7);

    html += '<div class="streak-grid">';
    let d = start;
    for (let i = 0; i < weeks * 7; i++) {
      const key = d.toString();
      const inRange = Temporal.PlainDate.compare(d, firstDate) >= 0 &&
                      Temporal.PlainDate.compare(d, end) <= 0;
      const count = inRange ? (countByDate.get(key) || 0) : -1;
      const level = count < 0 ? "empty" : Math.min(count, 4);
      const title = inRange
        ? formatDate(d) + ": " + L.accidents(count)
        : "";
      html += '<div class="streak-cell level-' + level + '"' +
        (title ? ' title="' + title + '"' : '') + '></div>';
      d = d.add({ days: 1 });
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

// ============================================================
// Poop timing visualizations
// ============================================================

function poopData() {
  const t = today();
  return currentPottyLog
    .filter(e => e.type === "poop")
    .map(e => {
      const dt = Temporal.PlainDateTime.from(e.time);
      const hour = dt.hour + dt.minute / 60 + dt.second / 3600;
      const daysAgo = Temporal.PlainDate.from(e.time).until(t, { largestUnit: "days" }).days;
      const weight = 0.5 ** (daysAgo / 7);
      return { hour, weight, time: e.time };
    });
}

const TIME_LABELS = [
  [0, "0"], [6, "6"], [12, "12"], [18, "18"],
];

function drawTimeAxis(ctx, w, h, pad) {
  const plotW = w - pad.left - pad.right;
  ctx.fillStyle = colors.textDim;
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const [hour, label] of TIME_LABELS) {
    const x = pad.left + (hour / 24) * plotW;
    ctx.fillText(label, x, h - pad.bottom + 3);
    ctx.beginPath();
    ctx.strokeStyle = colors.cardBorder;
    ctx.lineWidth = 1;
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, h - pad.bottom);
    ctx.stroke();
  }

  // Current time marker
  const n = Temporal.Now.plainTimeISO();
  const nowHour = n.hour + n.minute / 60;
  const nowX = pad.left + (nowHour / 24) * plotW;
  ctx.beginPath();
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.moveTo(nowX, pad.top);
  ctx.lineTo(nowX, h - pad.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDayScatter(canvas, data) {
  const { ctx, w, h } = prepareCanvas(canvas);
  if (data.length === 0) return;

  const pad = { top: 8, right: 8, bottom: 16, left: 28 };
  poopVizPad = { left: pad.left, right: pad.right, w };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  drawTimeAxis(ctx, w, h, pad);

  // Compute days-ago range
  const t = today();
  const oldest = data.reduce((a, b) => a.time < b.time ? a : b).time.slice(0, 10);
  const maxDaysAgo = Temporal.PlainDate.from(oldest).until(t, { largestUnit: "days" }).days;

  const scaleY = daysAgo => maxDaysAgo === 0
    ? pad.top + plotH / 2
    : pad.top + (daysAgo / maxDaysAgo) * plotH;

  // Y-axis labels at reasonable intervals
  const step = maxDaysAgo <= 7 ? 1 : maxDaysAgo <= 21 ? 3 : 7;
  ctx.fillStyle = colors.textDim;
  ctx.font = "9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let d = 0; d <= maxDaysAgo; d += step) {
    const y = scaleY(d);
    const label = L.chartDaysAgo(d);
    ctx.fillText(label, pad.left - 4, y);
  }

  // Dots
  for (const { hour, weight, time } of data) {
    const date = Temporal.PlainDate.from(time.slice(0, 10));
    const daysAgo = date.until(t, { largestUnit: "days" }).days;

    const x = pad.left + (hour / 24) * plotW;
    const y = scaleY(daysAgo);

    ctx.beginPath();
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.03 + 0.87 * weight;
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawDensityStrip(canvas, data) {
  const { ctx, w, h } = prepareCanvas(canvas);
  if (data.length === 0) return;

  const pad = { top: 6, right: 8, bottom: 16, left: 8 };
  poopVizPad = { left: pad.left, right: pad.right, w };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  drawTimeAxis(ctx, w, h, pad);

  // Weighted Gaussian KDE with wrap-around
  const bandwidth = 1;
  const steps = 200;
  const totalWeight = data.reduce((s, d) => s + d.weight, 0);
  const density = new Array(steps);
  let maxD = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 24;
    let sum = 0;
    for (const { hour, weight } of data) {
      for (const offset of [-24, 0, 24]) {
        const diff = t - (hour + offset);
        sum += weight * Math.exp(-0.5 * (diff / bandwidth) ** 2);
      }
    }
    density[i] = sum / (totalWeight * bandwidth * Math.sqrt(2 * Math.PI));
    if (density[i] > maxD) maxD = density[i];
  }

  // Filled curve
  const scaleX = i => pad.left + (i / steps) * plotW;
  const scaleY = d => pad.top + plotH - (d / maxD) * plotH;

  ctx.beginPath();
  ctx.moveTo(scaleX(0), pad.top + plotH);
  for (let i = 0; i < steps; i++) {
    ctx.lineTo(scaleX(i), scaleY(density[i]));
  }
  ctx.lineTo(scaleX(steps - 1), pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = colors.accent;
  ctx.globalAlpha = 0.25;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Curve stroke
  ctx.beginPath();
  for (let i = 0; i < steps; i++) {
    if (i === 0) ctx.moveTo(scaleX(i), scaleY(density[i]));
    else ctx.lineTo(scaleX(i), scaleY(density[i]));
  }
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Additive strip plot overlay
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  for (const { hour, weight } of data) {
    const x = pad.left + (hour / 24) * plotW;
    ctx.globalAlpha = 0.07 + 0.15 * weight;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

const POOP_VIZ_MODES = [drawDensityStrip, drawDayScatter];

let poopVizMode = 0;
let poopVizPad = undefined;

function renderPoopTimingViz() {
  const canvas = document.getElementById("poop-viz-canvas");
  POOP_VIZ_MODES[poopVizMode](canvas, poopData());
}

function renderPoopPredictorStats() {
  const container = document.getElementById("poop-predictor-stats");
  const entries = todayEntries()
    .map(e => ({ type: e.type, time: Temporal.PlainDateTime.from(e.time) }))
    .sort((a, b) => Temporal.PlainDateTime.compare(b.time, a.time));
  const rightNow = now();
  const poopCount = entries.filter(e => e.type === "poop").length;
  const lastPoop = entries.find(e => e.type === "poop");

  const parts = [];
  parts.push(L.poopsToday(poopCount));

  if (lastPoop) {
    parts.push(L.lastPoop(formatDuration(lastPoop.time.until(rightNow))));
  }

  const nextPoop = expectedNextPoop(rightNow);
  if (nextPoop) {
    const timeStr = formatTime(nextPoop.expected);
    const dur = formatDuration(nextPoop.dur);
    if (nextPoop.isOverdue) {
      parts.push(L.yesterdayPoopOverdue(timeStr, dur));
    } else {
      parts.push(L.yesterdayPoop(timeStr, dur));
    }
  }

  container.innerHTML = parts.map(p => typeof p === "string" ? "<span>" + p + "</span>" : p.html).join("");
}

// ============================================================
// Potty Diary
// ============================================================

let currentPottyLog = [];

async function loadPottyLog() {
  currentPottyLog = await apiGet("/api/potty");
  renderPottyLog();
  document.querySelector(".potty").classList.add("loaded");
}

function entriesForDate(date) {
  const str = date.toString();
  return currentPottyLog.filter(e => e.time.startsWith(str));
}

function todayEntries() {
  return entriesForDate(today());
}

function renderPottyLog() {
  renderPottyPatterns();
  renderPoopTimingViz();
  renderPoopPredictorStats();
  renderPottyEntries();
  renderAccidentTracker(deriveLastAccident());
}

const durationFmt = new Intl.DurationFormat(L.durationLocale, { style: "narrow" });

function formatDuration(dur) {
  const rounded = dur.round({ largestUnit: "hours", smallestUnit: "minutes" });
  if (rounded.blank) return "0m";
  return durationFmt.format(rounded);
}

function formatTime(plainTime) {
  return plainTime.toLocaleString(L.timeLocale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(date) {
  return L.formatDate(date);
}

function expectedNextPoop(rightNow) {
  const poops = currentPottyLog
    .filter(e => e.type === "poop")
    .map(e => Temporal.PlainDateTime.from(e.time))
    .sort(Temporal.PlainDateTime.compare);

  if (poops.length < 2) return undefined;

  const lastPoop = poops.at(-1);
  const target = lastPoop.subtract({ hours: 24 });

  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < poops.length - 1; i++) {
    const dist = Math.abs(target.until(poops[i]).total({ unit: "minutes" }));
    if (dist < closestDist) {
      closestIdx = i;
      closestDist = dist;
    }
  }

  const nextInHistory = poops[closestIdx + 1];
  if (!nextInHistory) return undefined;

  const expected = nextInHistory.toPlainTime();
  const nowTime = rightNow.toPlainTime();

  // If the expected time-of-day is before the last poop's time-of-day,
  // it's for tomorrow (next cycle)
  const isNextCycle = Temporal.PlainTime.compare(expected, lastPoop.toPlainTime()) <= 0;
  const isOverdue = !isNextCycle &&
                    Temporal.PlainTime.compare(nowTime, expected) >= 0 &&
                    Temporal.PlainTime.compare(nowTime, lastPoop.toPlainTime()) >= 0;

  let dur;
  if (isNextCycle) {
    const tomorrowExpected = today().add({ days: 1 }).toPlainDateTime(expected);
    dur = rightNow.until(tomorrowExpected);
  } else if (isOverdue) {
    dur = expected.until(nowTime);
  } else {
    dur = nowTime.until(expected);
  }

  return { expected, dur, isOverdue };
}

function renderPottyPatterns() {
  const container = document.getElementById("potty-patterns");

  const parts = [];

  // Last pee searches the full log so it doesn't reset at midnight
  let lastPeeTime;
  for (const e of currentPottyLog) {
    if (e.type === "pee" && (!lastPeeTime || e.time > lastPeeTime)) {
      lastPeeTime = e.time;
    }
  }
  if (lastPeeTime) {
    parts.push(L.lastPee(formatDuration(Temporal.PlainDateTime.from(lastPeeTime).until(now()))));
  }

  const todayPees = todayEntries()
    .filter(e => e.type === "pee")
    .map(e => ({ type: e.type, time: Temporal.PlainDateTime.from(e.time) }))
    .sort((a, b) => Temporal.PlainDateTime.compare(b.time, a.time));
  if (todayPees.length >= 2) {
    let total = Temporal.Duration.from({ seconds: 0 });
    for (let i = todayPees.length - 1; i >= 1; i--) {
      total = total.add(todayPees[i].time.until(todayPees[i - 1].time));
    }
    const avg = Temporal.Duration.from({ seconds: Math.round(total.total({ unit: "seconds" }) / (todayPees.length - 1)) });
    parts.push(L.avgBetweenPees(formatDuration(avg)));
  }

  container.innerHTML = parts.map(p => typeof p === "string" ? "<span>" + p + "</span>" : p.html).join("");
}

function renderPottyEntries() {
  const container = document.getElementById("potty-log");
  const t = today();
  const yesterday = t.subtract({ days: 1 });
  const todayList = entriesForDate(t);
  const yesterdayList = entriesForDate(yesterday);
  const allEntries = [...todayList, ...yesterdayList].sort((a, b) => b.time.localeCompare(a.time));

  if (allEntries.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 0.8rem; font-style: italic;">' + L.noEntriesToday + '</div>';
    return;
  }

  container.innerHTML = "";
  const todayStr = t.toString();
  let insertedDivider = false;

  for (const e of allEntries) {
    if (!insertedDivider && !e.time.startsWith(todayStr)) {
      insertedDivider = true;
      const divider = document.createElement("div");
      divider.className = "potty-divider";
      divider.innerHTML = '<span>' + L.midnight + '</span>';
      container.append(divider);
    }

    const row = document.createElement("div");
    row.className = "potty-entry" + (e.accident ? " potty-accident" : "");

    const timeSpan = document.createElement("span");
    timeSpan.className = "potty-entry-time";
    timeSpan.textContent = formatTime(Temporal.PlainTime.from(e.time));

    const icon = document.createElement("span");
    icon.className = "potty-entry-icon";
    icon.textContent = e.type === "pee" ? "💧" : "💩";

    const note = document.createElement("span");
    note.className = "potty-entry-note";
    note.textContent = e.note || "";

    // Show full note on hover only when truncated
    if (e.note) {
      const ro = new ResizeObserver(() => {
        note.title = note.scrollWidth > note.clientWidth ? e.note : "";
      });
      ro.observe(note);
    }

    const editBtn = document.createElement("button");
    editBtn.className = "potty-edit";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", () => editPottyEntry(e, row));

    const delBtn = document.createElement("button");
    delBtn.textContent = "×";
    delBtn.addEventListener("click", () => deletePottyEntry(e.id));

    row.append(timeSpan, icon, note, editBtn, delBtn);
    container.append(row);
  }
}

function editPottyEntry(entry, row) {
  // Replace the row content with inline edit fields
  const noteSpan = row.querySelector(".potty-entry-note");
  const editBtn = row.querySelector(".potty-edit");
  const delBtn = row.querySelector("button:last-child");

  const timeInput = document.createElement("input");
  timeInput.type = "time";
  timeInput.className = "potty-edit-time";
  timeInput.value = Temporal.PlainTime.from(entry.time).toString({ smallestUnit: "minute" });

  const noteInput = document.createElement("input");
  noteInput.type = "text";
  noteInput.className = "potty-edit-note";
  noteInput.value = entry.note || "";
  noteInput.placeholder = L.note;

  const saveBtn = document.createElement("button");
  saveBtn.className = "potty-save";
  saveBtn.textContent = "✓";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "potty-cancel";
  cancelBtn.textContent = "×";

  const timeSpan = row.querySelector(".potty-entry-time");
  timeSpan.replaceWith(timeInput);
  noteSpan.replaceWith(noteInput);
  editBtn.replaceWith(saveBtn);
  delBtn.replaceWith(cancelBtn);
  noteInput.focus();

  async function save() {
    const newTime = Temporal.PlainDate.from(entry.time)
      .toPlainDateTime(Temporal.PlainTime.from(timeInput.value)).toString();
    const newNote = noteInput.value.trim() || undefined;
    const patch = {};
    if (newTime !== entry.time) patch.time = newTime;
    if (newNote !== entry.note) patch.note = newNote;
    if (Object.keys(patch).length > 0) {
      currentPottyLog = await apiPatch("/api/potty/" + entry.id, patch);
    }
    renderPottyLog();
  }

  saveBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", () => renderPottyLog());
  noteInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") renderPottyLog();
  });
}

async function deletePottyEntry(id) {
  currentPottyLog = await apiDelete("/api/potty/" + id);
  renderPottyLog();
}

function setupPottyButtons() {
  const timeInput = document.getElementById("potty-time");
  const timeToggle = document.getElementById("potty-time-toggle");

  timeToggle.addEventListener("click", () => {
    const show = timeInput.hidden;
    timeInput.hidden = !show;
    timeToggle.classList.toggle("active", show);
    if (show) timeInput.focus();
  });

  async function logPotty(type) {
    const noteInput = document.getElementById("potty-note");
    const accidentInput = document.getElementById("potty-accident");
    const note = noteInput.value.trim() || undefined;
    const accident = accidentInput.checked;
    let time;
    if (timeInput.value) {
      time = today().toString() + "T" + timeInput.value + ":00";
    } else {
      time = now().toString({ smallestUnit: "second" });
    }
    currentPottyLog = await apiPost("/api/potty", { type, time, note, accident });
    noteInput.value = "";
    accidentInput.checked = false;
    timeInput.value = "";
    timeInput.hidden = true;
    timeToggle.classList.remove("active");
    renderPottyLog();
  }

  document.getElementById("potty-pee").addEventListener("click", () => logPotty("pee"));
  document.getElementById("potty-poop").addEventListener("click", () => logPotty("poop"));

  document.getElementById("potty-export").addEventListener("click", exportPottyLog);

  document.getElementById("poop-viz-toggle").addEventListener("click", () => {
    poopVizMode = (poopVizMode + 1) % POOP_VIZ_MODES.length;
    renderPoopTimingViz();
  });

  const vizCanvas = document.getElementById("poop-viz-canvas");
  const vizTooltip = document.createElement("div");
  vizTooltip.className = "poop-viz-tooltip";
  vizTooltip.hidden = true;
  vizCanvas.parentElement.appendChild(vizTooltip);

  vizCanvas.addEventListener("mousemove", (e) => {
    if (!poopVizPad) { vizTooltip.hidden = true; return; }
    const rect = vizCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const { left, right, w } = poopVizPad;
    const plotW = w - left - right;
    const hour = ((mx - left) / plotW) * 24;
    if (hour < 0 || hour > 24) { vizTooltip.hidden = true; return; }

    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    const time = formatTime(new Temporal.PlainTime(h, m));
    vizTooltip.textContent = time;
    vizTooltip.style.left = `${vizCanvas.offsetLeft + mx}px`;
    vizTooltip.style.top = `${vizCanvas.offsetTop}px`;
    vizTooltip.hidden = false;
  });

  vizCanvas.addEventListener("mouseleave", () => {
    vizTooltip.hidden = true;
  });
}

const EXPORT_DAYS = 3;

function exportPottyLog() {
  const t = today();
  const lines = [];

  for (let i = 0; i < EXPORT_DAYS; i++) {
    const date = t.subtract({ days: i });
    const entries = entriesForDate(date).sort((a, b) => a.time.localeCompare(b.time));
    if (entries.length === 0) continue;

    lines.push("## " + L.formatExportDate(date));
    lines.push("");
    for (const e of entries) {
      const time = formatTime(Temporal.PlainTime.from(e.time));
      const icon = e.type === "pee" ? "💧" : "💩";
      let line = "- " + time + " " + icon;
      if (e.accident) line += " (accident)";
      if (e.note) line += " — " + e.note;
      lines.push(line);
    }
    lines.push("");
  }

  const text = lines.join("\n").trimEnd();
  if (!text) return;

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();

  const btn = document.getElementById("potty-export");
  btn.textContent = "✓";
  setTimeout(() => { btn.textContent = "📋"; }, 1500);
}


// ============================================================
// Auto-reload on deploy
// ============================================================

let buildId;

async function checkForDeploy() {
  try {
    const res = await apiGet("/api/version");
    if (buildId && res.buildId !== buildId) {
      location.reload();
      return;
    }
    buildId = res.buildId;
  } catch {
    // Intentionally ignore errors, since we might be offline and don't want to reload and thus unload the app.
  }
}

// ============================================================
// Forms
// ============================================================

function setupForms() {
  document.getElementById("weight-date").value = today().toString();

  document.getElementById("weight-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = document.getElementById("weight-date").value;
    const grams = Number(document.getElementById("weight-grams").value);
    if (!date || !grams) return;
    currentWeights = await apiPost("/api/weights", { date, grams });
    renderWeights();
    document.getElementById("weight-grams").value = "";
    document.getElementById("weight-date").value = today().toString();
  });

  document.getElementById("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("event-title").value.trim();
    const date = document.getElementById("event-date").value;
    if (!title || !date) return;
    currentEvents = await apiPost("/api/events", { title, date });
    renderEvents();
    document.getElementById("event-title").value = "";
    document.getElementById("event-date").value = "";
    document.getElementById("event-date-wrapper").classList.remove("has-date");
  });

  for (const wrapper of document.querySelectorAll(".date-button")) {
    const input = wrapper.querySelector("input[type='date']");
    wrapper.addEventListener("click", () => input.showPicker());
  }

  document.getElementById("event-date").addEventListener("change", (e) => {
    document.getElementById("event-date-wrapper").classList.toggle("has-date", !!e.target.value);
  });

  document.getElementById("weight-date").addEventListener("change", (e) => {
    document.getElementById("weight-date-wrapper").classList.toggle("has-date", e.target.value !== today().toString());
  });
}

// ============================================================
// Name title
// ============================================================

const TITLES = ["Deticola", "姫", "様", "さん", "ちゃん", "the Maltipoo"];

function pickTitle() {
  document.getElementById("name-title").textContent =
    TITLES[Math.floor(Math.random() * TITLES.length)];
}

// ============================================================
// Sparkles
// ============================================================

const SPARKLE_CHARS = ["✦", "✧", "⋆", "˚", "⁺"];

function spawnSparkle() {
  const hero = document.querySelector(".hero");
  const nameEl = document.querySelector(".name-glow");
  const rect = nameEl.getBoundingClientRect();
  const heroRect = hero.getBoundingClientRect();

  const spark = document.createElement("span");
  spark.className = "sparkle";
  spark.textContent = SPARKLE_CHARS[Math.floor(Math.random() * SPARKLE_CHARS.length)];

  const x = rect.left - heroRect.left + Math.random() * rect.width;
  const y = rect.top - heroRect.top + Math.random() * rect.height;
  spark.style.left = x + "px";
  spark.style.top = y + "px";
  spark.style.color = "var(--accent)";
  spark.style.setProperty("--size", (0.6 + Math.random() * 0.8) + "rem");
  spark.style.setProperty("--duration", (1 + Math.random()) + "s");
  spark.style.setProperty("--dx", (Math.random() * 30 - 15) + "px");
  spark.style.setProperty("--dy", (Math.random() * -20 - 10) + "px");
  spark.style.setProperty("--dx2", (Math.random() * 50 - 25) + "px");
  spark.style.setProperty("--dy2", (Math.random() * -40 - 20) + "px");

  hero.append(spark);
  spark.addEventListener("animationend", () => spark.remove());
}

setInterval(spawnSparkle, CONFIG.sparkleIntervalMS);

// ============================================================
// Top-level init
// ============================================================

const ageUnits = document.querySelectorAll(".age-unit");
ageUnits[0].textContent = L.daysLabel;
ageUnits[1].textContent = L.weeksLabel;
ageUnits[2].textContent = L.monthsLabel;

pickTitle();
setInterval(pickTitle, CONFIG.titleRotateMS);
updateAge();
updateMilestones();
updateFood();
setupForms();
setupPottyButtons();
setupCameraLightbox();

for (const el of document.querySelectorAll(".hero, .food, .milestones")) {
  el.classList.add("loaded");
}

await Promise.all([
  loadWeights(),
  loadEvents(),
  loadPottyLog(),
]);


setInterval(() => {
  updateAge();
  updateMilestones();
  updateFood();
  renderPottyPatterns();
}, CONFIG.ageRefreshMS);

setInterval(() => {
  checkForDeploy();
  loadWeights();
  loadEvents();
  loadPottyLog();
}, CONFIG.dataRefreshMS);

new ResizeObserver(() => drawWeightChart(currentWeights)).observe(document.getElementById("weight-chart"));
new ResizeObserver(() => renderPoopTimingViz()).observe(document.getElementById("poop-viz-canvas"));

window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  checkForDeploy();
  loadWeights().catch(() => {});
  loadEvents().catch(() => {});
  loadPottyLog().catch(() => {});
});
