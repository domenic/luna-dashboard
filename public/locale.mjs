const enDuration = new Intl.DurationFormat("en", { style: "long" });

const en = {
  // Age unit labels (static, for the HTML spans next to animated numbers)
  daysLabel: "days",
  weeksLabel: "weeks",
  monthsLabel: "months",

  // Parameterized units
  days: (n) => enDuration.format({ days: n }),
  weeks: (n) => enDuration.format({ weeks: n }),
  months: (n) => enDuration.format({ months: n }),
  dayCount: (n) => "day " + n,
  daysAgo: (n) => n + "d ago",
  daysUntil: (n) => "in " + n + "d",

  // Labels
  today: "today",
  tomorrow: "tomorrow",
  midnight: "midnight",
  water: "water",
  total: "total",
  dryPerDay: "dry / day",
  connecting: "Connecting\u2026",

  // Templates
  nextMilestone: (label, n) =>
    "Next: <strong>" + label + "</strong> in " + enDuration.format({ days: n }),
  allMilestonesReached: "All milestones reached!",
  sinceLastAccident: (n) =>
    '<span class="accident-count">' + n + "</span> day" + (n === 1 ? "" : "s") +
    " since last accident",
  accidents: (n) => n + " accident" + (n === 1 ? "" : "s"),
  note: "Note",
  switchToAdultFood: "Switch to adult food table",

  // Stats
  poopsToday: (n) => "Poops today: " + n,
  lastPoop: (dur) => "Last poop: " + dur + " ago",
  yesterdayPoop: (time, dur) => "Yesterday's poop: ~" + time + " (in " + dur + ")",
  yesterdayPoopOverdue: (time, dur) => ({
    html: '<span class="overdue">Yesterday\'s poop: ~' + time + " (" + dur + " overdue)</span>",
  }),
  lastPee: (dur) => "Last pee: " + dur + " ago",
  avgBetweenPees: (dur) => "Avg between pees: " + dur,

  // Empty states
  noDataYet: "No data yet",
  noUpcomingEvents: "No upcoming events",
  noEntriesToday: "No entries today",

  // Date/time formatting
  durationLocale: "en",
  timeLocale: "en",
  formatDate: (date) =>
    Temporal.PlainDate.from(date).toLocaleString("en", { month: "short", day: "numeric" }),
  formatExportDate: (date) =>
    Temporal.PlainDate.from(date).toLocaleString("en", { weekday: "long", month: "short", day: "numeric" }),

  // Chart labels
  chartDaysAgo: (n) => (n === 0 ? "0" : "-" + n + "d"),
};

const enXWaei = {
  ...en,

  daysLabel: "日",
  weeksLabel: "週",
  monthsLabel: "ヶ月",

  days: (n) => n + "日",
  weeks: (n) => n + "週",
  months: (n) => n + "ヶ月",
  dayCount: (n) => n + "日目",
  daysAgo: (n) => n + "日前",
  daysUntil: (n) => n + "日後",

  today: "今日",
  tomorrow: "明日",
  midnight: "0時",
  water: "水",
  dryPerDay: "dry / 日",

  nextMilestone: (label, n) =>
    "次: <strong>" + label + "</strong> " + n + "日後",

  formatDate: (date) => {
    const d = Temporal.PlainDate.from(date);
    return d.month + "月" + d.day + "日";
  },

  durationLocale: "ja",

  chartDaysAgo: (n) => (n === 0 ? "0" : "-" + n + "日"),
};

export const locales = { en, "en-x-waei": enXWaei };
