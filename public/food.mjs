export const FOOD_CONFIG = {
  switchStartDate: "2026-10-22",
  switchDays: 21,
  timeZone: "Asia/Tokyo",
};

// Royal Canin JP: Mini Indoor Puppy, 396 kcal/100 g.
const PUPPY_TABLE = {
  ageMonths: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  dryGramsByAdultKg: {
    2: [50, 56, 57, 57, 49, 41, 41, 40, 40],
    4: [81, 91, 95, 95, 87, 78, 69, 68, 67],
  },
};

// Preserve the existing puppy ration's adult-weight estimate from the measured age.
const SMALL_DOG_GROWTH_CURVE = {
  ageDays: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 365],
  adultWeightFraction: [0.10, 0.18, 0.35, 0.50, 0.65, 0.78, 0.88, 0.94, 0.97, 0.99, 1.00],
};

// Nutro Natural Choice JP: 超小型犬～小型犬用 成犬用 ラム＆玄米.
// The adult feeding table is indexed by body weight (体重, kg). Verified 2026-10-21:
// https://nutro.jp/products/nc_d_adult_toy_lamb_br
export const NUTRO_TABLE = {
  sourceURL: "https://nutro.jp/products/nc_d_adult_toy_lamb_br",
  kcalPerGram: 3.6,
  weightKg: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  dryGrams: [30, 50, 65, 80, 90, 105, 120, 130, 140, 155],
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 365.25 / 12;

function daysBetween(start, end) {
  return (Date.parse(end) - Date.parse(start)) / MS_PER_DAY;
}

function addDays(date, days) {
  return new Date(Date.parse(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function interpolate(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; ++i) {
    if (x <= xs[i]) {
      return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    }
  }
  return ys.at(-1);
}

export function foodToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FOOD_CONFIG.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function foodTransition(date, state = {}) {
  const elapsed = daysBetween(FOOD_CONFIG.switchStartDate, state.pausedOn ?? date);
  const day = Math.max(0, Math.min(FOOD_CONFIG.switchDays, elapsed + 1 - (state.delayDays ?? 0)));
  return {
    day,
    share: day / FOOD_CONFIG.switchDays,
    isBeforeSwitch: date < FOOD_CONFIG.switchStartDate,
    isPaused: state.pausedOn !== undefined,
    fullDate: state.pausedOn === undefined
      ? addDays(FOOD_CONFIG.switchStartDate, FOOD_CONFIG.switchDays - 1 + (state.delayDays ?? 0))
      : undefined,
  };
}

// Holding and stepping back are saved on the server so every caregiver sees the same plan.
export function changeFoodTransition(date, state, action) {
  const transition = foodTransition(date, state);
  if (transition.isBeforeSwitch) return state;
  if (action === "resume") {
    if (!transition.isPaused) return state;
    return { delayDays: (state.delayDays ?? 0) + daysBetween(state.pausedOn, date) };
  }
  if (action === "hold" || action === "back") {
    const day = Math.max(0, transition.day - (action === "back" ? 1 : 0));
    return {
      delayDays: daysBetween(FOOD_CONFIG.switchStartDate, date) + 1 - day,
      pausedOn: date,
    };
  }
  throw new RangeError("Unknown food transition action");
}

export function dailyFoodPlan(date, birthday, weights, state = {}) {
  const transition = foodTransition(date, state);
  const latestWeight = weights
    .filter(w => w.date <= date && Number.isFinite(w.grams) && w.grams > 0)
    .sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!latestWeight) return undefined;
  const expectedAdultKg = latestWeight.grams / 1000 / interpolate(
    SMALL_DOG_GROWTH_CURVE.ageDays,
    SMALL_DOG_GROWTH_CURVE.adultWeightFraction,
    daysBetween(birthday, latestWeight.date),
  );
  const ageDays = daysBetween(birthday, date);
  // Project body weight between measurements using the dashboard's growth model.
  // This estimate is an app assumption; Nutro does not prescribe this growth model.
  const expectedCurrentKg = expectedAdultKg * interpolate(
    SMALL_DOG_GROWTH_CURVE.ageDays, SMALL_DOG_GROWTH_CURVE.adultWeightFraction, ageDays,
  );
  const ageMonths = ageDays / DAYS_PER_MONTH;
  const puppyTargets = [2, 4].map(kg =>
    interpolate(PUPPY_TABLE.ageMonths, PUPPY_TABLE.dryGramsByAdultKg[kg], ageMonths));
  const oldTarget = interpolate([2, 4], puppyTargets, expectedAdultKg);
  const newTarget = interpolate(NUTRO_TABLE.weightKg, NUTRO_TABLE.dryGrams, expectedCurrentKg);

  // Blend fractions of each food's full daily ration, preserving both table endpoints.
  // Round only the portions to weigh; derive the displayed total and calories from those portions.
  const oldGrams = Math.round(oldTarget * (1 - transition.share));
  const newGrams = Math.round(newTarget * transition.share);
  return {
    ...transition,
    oldGrams,
    newGrams,
    totalGrams: oldGrams + newGrams,
    kcal: Math.round(oldGrams * 3.96 + newGrams * NUTRO_TABLE.kcalPerGram),
    newTargetGrams: Math.round(newTarget),
    expectedCurrentKg,
    expectedAdultKg,
    weightDate: latestWeight.date,
    weightOutsideTable: expectedCurrentKg < NUTRO_TABLE.weightKg[0] || expectedCurrentKg > NUTRO_TABLE.weightKg.at(-1),
  };
}
