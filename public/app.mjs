if (!globalThis.Temporal) {
  const { Temporal } = await import("https://esm.sh/temporal-polyfill");
  globalThis.Temporal = Temporal;
}

// ============================================================
// Configuration
// ============================================================

const NNBSP = "\u202F"; // narrow no-break space (SI unit separator)

const CONFIG = {
  name: "Luna",
  birthday: "2025-12-21",
  food: {
    baseGrams: 120,
    baseAgeWeeks: 10.5,
    weeklyIncrease: 7.5,
    dryRatio: 0.45,
    waterRatio: 0.55,
    dryOnlyAgeWeeks: 17, // ~4 months
  },
  recentWeightsCount: 5,
  countAnimationMS: 1200,
  sparkleIntervalMS: 800,
  dataRefreshMS: 30 * 1000,
  titleRotateMS: 15 * 60 * 1000,
  ageRefreshMS: 60 * 1000,
  weatherRefreshMS: 30 * 60 * 1000,
};

const MILESTONES = [
  { ageDays: 73, label: "Went home!" },
  { ageWeeks: 12, label: "Human socialization window starts closing" },
  { ageWeeks: 17, label: "Transition to dry food" },
  { ageWeeks: 18, label: "Dog socialization window starts closing" },
  { ageWeeks: 18, label: "Ensure bite inhibition" },
  { ageWeeks: 24, label: "Spay eligible" },
  { ageWeeks: 26, label: "Adolescence begins / adult teeth fully in" },
  { ageWeeks: 52, label: "Fully grown" },
];

function milestoneDays(m) {
  return m.ageDays ?? m.ageWeeks * 7;
}

// WMO weather codes -> [emoji, description]
const WMO_CODES = {
  0:  ["☀️", "Clear sky"],
  1:  ["🌤️", "Mainly clear"],
  2:  ["⛅", "Partly cloudy"],
  3:  ["☁️", "Overcast"],
  45: ["🌫️", "Fog"],
  48: ["🌫️", "Rime fog"],
  51: ["🌦️", "Light drizzle"],
  53: ["🌦️", "Drizzle"],
  55: ["🌧️", "Dense drizzle"],
  61: ["🌦️", "Light rain"],
  63: ["🌧️", "Rain"],
  65: ["🌧️", "Heavy rain"],
  67: ["🌨️", "Freezing rain"],
  71: ["❄️", "Light snow"],
  73: ["❄️", "Snow"],
  75: ["❄️", "Heavy snow"],
  77: ["❄️", "Snow grains"],
  80: ["🌦️", "Light showers"],
  81: ["🌧️", "Showers"],
  82: ["🌧️", "Heavy showers"],
  85: ["❄️", "Snow showers"],
  86: ["❄️", "Heavy snow showers"],
  95: ["⛈️", "Thunderstorm"],
  96: ["⛈️", "Thunderstorm w/ hail"],
  99: ["⛈️", "Thunderstorm w/ heavy hail"],
};

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

function ageWeeks() {
  return age().total({ unit: "weeks", relativeTo: BIRTHDAY });
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
    el.innerHTML = "Next: <strong>" + next.label + "</strong> in " + daysUntil + " day" + (daysUntil === 1 ? "" : "s");
  } else {
    el.innerHTML = "All milestones reached!";
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
    if (mWeeks >= 52) {
      ageLabel.textContent = Math.round(mWeeks / 4.33) + " months · day " + mDays;
    } else {
      ageLabel.textContent = mWeeks + " weeks · day " + mDays;
    }

    div.append(label, ageLabel);
    container.append(div);
  }
}

// ============================================================
// Food
// ============================================================

function updateFood() {
  const currentWeeks = ageWeeks();
  const { baseGrams, baseAgeWeeks, weeklyIncrease, dryRatio, waterRatio, dryOnlyAgeWeeks } = CONFIG.food;
  const totalGrams = Math.round(baseGrams + (currentWeeks - baseAgeWeeks) * weeklyIncrease);
  const container = document.getElementById("food-info");

  if (currentWeeks >= dryOnlyAgeWeeks) {
    container.innerHTML =
      '<div class="food-total">' + totalGrams + NNBSP + 'g <span>/ day</span></div>' +
      '<div class="food-breakdown">' +
        '<div class="food-component">' +
          '<div class="food-amount">' + totalGrams + NNBSP + 'g</div>' +
          '<div class="food-label">dry kibble</div>' +
        '</div>' +
      '</div>' +
      '<div class="food-note">Old enough for dry food only</div>';
  } else {
    const dry = Math.round(totalGrams * dryRatio);
    const water = Math.round(totalGrams * waterRatio);
    const weeksUntilDry = Math.ceil(dryOnlyAgeWeeks - currentWeeks);
    container.innerHTML =
      '<div class="food-total">' + totalGrams + NNBSP + 'g <span>/ day</span></div>' +
      '<div class="food-breakdown">' +
        '<div class="food-component">' +
          '<div class="food-amount">' + dry + NNBSP + 'g</div>' +
          '<div class="food-label">dry kibble</div>' +
        '</div>' +
        '<div class="food-component">' +
          '<div class="food-amount">' + water + NNBSP + 'g</div>' +
          '<div class="food-label">water</div>' +
        '</div>' +
      '</div>' +
      '<div class="food-note">Switch to dry food in ~' + weeksUntilDry + ' weeks</div>';
  }
}

// ============================================================
// Weight
// ============================================================

let currentWeights = [];

async function loadWeights() {
  currentWeights = await apiGet("/api/weights");
  renderWeights();
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

function drawWeightChart(weights) {
  const canvas = document.getElementById("weight-chart");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  if (weights.length === 0) {
    ctx.fillStyle = "#8b949e";
    ctx.font = "0.9rem system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No data yet", w / 2, h / 2);
    return;
  }

  const pad = { top: 15, right: 15, bottom: 25, left: 45 };
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

  // Grid lines
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = "#8b949e";
  ctx.font = "0.7rem system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const val = maxG - ((maxG - minG) / 4) * i;
    const y = pad.top + (plotH / 4) * i;
    ctx.fillText(Math.round(val) + NNBSP + "g", pad.left - 5, y);
  }

  // Line
  ctx.beginPath();
  ctx.strokeStyle = "#58a6ff";
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
    ctx.fillStyle = "#58a6ff";
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#161b22";
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // X-axis date labels
  ctx.fillStyle = "#8b949e";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "0.65rem system-ui, sans-serif";

  if (weights.length <= 8) {
    for (let i = 0; i < weights.length; i++) {
      ctx.fillText(formatDate(weights[i].date), scaleX(epochDays[i]), h - pad.bottom + 6);
    }
  } else {
    ctx.fillText(formatDate(weights[0].date), scaleX(epochDays[0]), h - pad.bottom + 6);
    ctx.textAlign = "right";
    ctx.fillText(formatDate(weights[weights.length - 1].date), scaleX(epochDays[epochDays.length - 1]), h - pad.bottom + 6);
  }
}

// ============================================================
// Events
// ============================================================

let currentEvents = [];

async function loadEvents() {
  currentEvents = await apiGet("/api/events");
  renderEvents();
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
    container.innerHTML = '<div style="color: var(--text-dim); font-style: italic;">No upcoming events</div>';
    return;
  }

  container.innerHTML = "";
  for (const e of upcoming) {
    const daysUntil = now.until(e.computedDate, { largestUnit: "days" }).days;
    const daysLabel = daysUntil === 0 ? "today" : daysUntil === 1 ? "tomorrow" : "in " + daysUntil + "d";
    const prefix = e.approximate ? "~" : "";

    const item = document.createElement("div");
    item.className = "event-item";

    const dateSpan = document.createElement("span");
    dateSpan.className = "event-date";
    dateSpan.textContent = prefix + formatDate(e.computedDate) + " ";
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
// Weather
// ============================================================

async function updateWeather() {
  const container = document.getElementById("weather-info");
  try {
    const data = await apiGet("/api/weather");
    if (data.error) throw new Error(data.error);

    if (data.location) {
      document.getElementById("weather-location").textContent = data.location;
    }

    const cur = data.current;
    const code = cur.weather_code;
    const [icon, desc] = WMO_CODES[code] || ["🌤️", "Unknown"];
    const high = Math.round(data.daily.temperature_2m_max[0]);
    const low = Math.round(data.daily.temperature_2m_min[0]);

    container.innerHTML =
      '<div class="weather-current">' +
        '<span class="weather-icon">' + icon + '</span>' +
        '<div>' +
          '<div class="weather-temp">' + Math.round(cur.temperature_2m) + NNBSP + '°C</div>' +
          '<div class="weather-desc">' + desc + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="weather-details">' +
        '<div>Feels like ' + Math.round(cur.apparent_temperature) + NNBSP + '°C</div>' +
        '<div>High ' + high + '° / Low ' + low + '°</div>' +
        '<div>Humidity ' + cur.relative_humidity_2m + '%</div>' +
      '</div>';
  } catch {
    container.innerHTML = '<div class="weather-error">Could not load weather</div>';
  }
}

// ============================================================
// Accident tracker
// ============================================================

function deriveLastAccident() {
  const accidents = currentPottyLog.filter(e => e.accident);
  if (accidents.length === 0) return undefined;
  return accidents
    .map(e => Temporal.PlainDateTime.from(e.time))
    .reduce((a, b) => Temporal.PlainDateTime.compare(a, b) > 0 ? a : b)
    .toPlainDate();
}

function renderAccidentTracker(lastDate) {
  const container = document.getElementById("accident-tracker");
  const days = lastDate
    ? lastDate.until(today(), { largestUnit: "days" }).days
    : "?";

  container.className = "accident-tracker" + (days === 0 ? " zero-days" : "");
  container.innerHTML =
    '<span class="accident-count">' + days + '</span> day' + (days === 1 ? "" : "s") +
    ' since last accident';
}

// ============================================================
// Potty Diary
// ============================================================

let currentPottyLog = [];

async function loadPottyLog() {
  currentPottyLog = await apiGet("/api/potty");
  renderPottyLog();
}

function todayEntries() {
  const todayStr = today().toString();
  return currentPottyLog.filter(e => e.time.startsWith(todayStr));
}

function renderPottyLog() {
  renderPottyPatterns();
  renderPottyEntries();
  renderAccidentTracker(deriveLastAccident());
}

const durationFmt = new Intl.DurationFormat("en", { style: "narrow" });

function formatDuration(dur) {
  const rounded = dur.round({ largestUnit: "hours", smallestUnit: "minutes" });
  if (rounded.blank) return "0m";
  return durationFmt.format(rounded);
}

function renderPottyPatterns() {
  const container = document.getElementById("potty-patterns");
  const entries = todayEntries().sort((a, b) => b.time.localeCompare(a.time));
  const rightNow = now();

  const lastPee = entries.find(e => e.type === "pee");
  const lastPoop = entries.find(e => e.type === "poop");
  const pees = entries.filter(e => e.type === "pee");
  const poopCount = entries.filter(e => e.type === "poop").length;

  const parts = [];

  if (lastPee) {
    parts.push("Last pee: " + formatDuration(Temporal.PlainDateTime.from(lastPee.time).until(rightNow)) + " ago");
  }
  if (lastPoop) {
    parts.push("Last poop: " + formatDuration(Temporal.PlainDateTime.from(lastPoop.time).until(rightNow)) + " ago");
  }
  if (pees.length >= 2) {
    const sorted = pees.map(e => Temporal.PlainDateTime.from(e.time)).sort(Temporal.PlainDateTime.compare);
    let total = Temporal.Duration.from({ seconds: 0 });
    for (let i = 1; i < sorted.length; i++) {
      total = total.add(sorted[i - 1].until(sorted[i]));
    }
    const avg = Temporal.Duration.from({ seconds: Math.round(total.total({ unit: "seconds" }) / (sorted.length - 1)) });
    parts.push("Avg between pees: " + formatDuration(avg));
  }
  parts.push("Poops today: " + poopCount);

  container.innerHTML = parts.map(p => "<span>" + p + "</span>").join("");
}

function renderPottyEntries() {
  const container = document.getElementById("potty-log");
  const entries = todayEntries().sort((a, b) => b.time.localeCompare(a.time));

  if (entries.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 0.8rem; font-style: italic;">No entries today</div>';
    return;
  }

  container.innerHTML = "";
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = "potty-entry" + (e.accident ? " potty-accident" : "");

    const timeSpan = document.createElement("span");
    timeSpan.className = "potty-entry-time";
    timeSpan.textContent = e.time.slice(11, 16);

    const icon = document.createElement("span");
    icon.className = "potty-entry-icon";
    icon.textContent = e.type === "pee" ? "💧" : "💩";

    const note = document.createElement("span");
    note.className = "potty-entry-note";
    note.textContent = e.note || "";

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.addEventListener("click", () => deletePottyEntry(e.id));

    row.append(timeSpan, icon, note, btn);
    container.append(row);
  }
}

async function deletePottyEntry(id) {
  currentPottyLog = await apiDelete("/api/potty/" + id);
  renderPottyLog();
}

function setupPottyButtons() {
  async function logPotty(type) {
    const noteInput = document.getElementById("potty-note");
    const accidentInput = document.getElementById("potty-accident");
    const note = noteInput.value.trim() || undefined;
    const accident = accidentInput.checked;
    const time = now().toString({ smallestUnit: "second" });
    currentPottyLog = await apiPost("/api/potty", { type, time, note, accident });
    noteInput.value = "";
    accidentInput.checked = false;
    renderPottyLog();
  }

  document.getElementById("potty-pee").addEventListener("click", () => logPotty("pee"));
  document.getElementById("potty-poop").addEventListener("click", () => logPotty("poop"));
}

// ============================================================
// Helpers
// ============================================================

function formatDate(date) {
  return Temporal.PlainDate.from(date).toLocaleString("en", { month: "short", day: "numeric" });
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
    const approximate = document.getElementById("event-approx").checked;
    if (!title || !date) return;
    currentEvents = await apiPost("/api/events", { title, date, approximate });
    renderEvents();
    document.getElementById("event-title").value = "";
    document.getElementById("event-date").value = "";
    document.getElementById("event-date-wrapper").classList.remove("has-date");
    document.getElementById("event-approx").checked = false;
  });

  document.getElementById("event-date").addEventListener("change", (e) => {
    document.getElementById("event-date-wrapper").classList.toggle("has-date", !!e.target.value);
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

pickTitle();
setInterval(pickTitle, CONFIG.titleRotateMS);
updateAge();
updateMilestones();
updateFood();
setupForms();
setupPottyButtons();

await Promise.all([
  loadWeights(),
  loadEvents(),
  updateWeather(),
  loadPottyLog(),
]);

setInterval(() => {
  updateAge();
  updateFood();
  renderPottyPatterns();
}, CONFIG.ageRefreshMS);

setInterval(updateWeather, CONFIG.weatherRefreshMS);

setInterval(() => {
  loadWeights();
  loadEvents();
  loadPottyLog();
}, CONFIG.dataRefreshMS);

window.addEventListener("resize", () => drawWeightChart(currentWeights));
