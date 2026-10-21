import assert from "node:assert/strict";
import { test } from "node:test";
import { changeFoodTransition, dailyFoodPlan, foodToday, foodTransition } from "../public/food.mjs";

const birthday = "2025-12-21";
const weights = [{ date: "2026-10-20", grams: 2700 }];
const plan = (date, state) => dailyFoodPlan(date, birthday, weights, state);

test("advances at Japan midnight regardless of the host time zone", t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-21T14:59:59Z") });
  assert.equal(foodToday(), "2026-10-21");
  t.mock.timers.tick(1000);
  assert.equal(foodToday(), "2026-10-22");
});

test("keeps Royal Canin before the start and reaches only Nutro on day 21", () => {
  const before = plan("2026-10-21");
  assert.equal(before.oldGrams, 50);
  assert.equal(before.newGrams, 0);
  assert.equal(before.isBeforeSwitch, true);
  assert.equal(before.fullDate, "2026-11-11");

  const first = plan("2026-10-22");
  assert.equal(first.day, 1);
  assert.equal(first.oldGrams, 47);
  assert.equal(first.newGrams, 3);

  const last = plan("2026-11-11");
  assert.equal(last.day, 21);
  assert.equal(last.oldGrams, 0);
  assert.equal(last.newGrams, 61);
  assert.equal(last.kcal, 220);
  assert.equal(plan("2027-01-01").newGrams, 61);
});

test("projects current weight for Nutro and estimates adult weight for puppy food", () => {
  const entries = [
    { date: "2026-10-21", grams: 3000 },
    { date: "2026-12-01", grams: 5000 },
    { date: "2026-10-22", grams: 0 },
    { date: "2026-10-01", grams: 2000 },
  ];
  const before = dailyFoodPlan("2026-10-21", birthday, entries);
  assert.equal(before.oldGrams, 54);
  assert.equal(before.expectedCurrentKg, 3);
  const after = dailyFoodPlan("2026-11-11", birthday, entries);
  assert.equal(after.newGrams, 65);
  assert.equal(after.weightDate, "2026-10-21");
  assert.ok(after.expectedCurrentKg > 3);
  assert.ok(after.expectedCurrentKg < after.expectedAdultKg);
  assert.equal(after.weightOutsideTable, false);
});

test("projects from the measured growth stage and stops growing at adult size", () => {
  const entries = [{ date: "2026-06-19", grams: 2640 }];
  const measured = dailyFoodPlan("2026-06-19", birthday, entries);
  assert.equal(measured.expectedCurrentKg, 2.64);
  assert.equal(measured.expectedAdultKg, 3);

  const growing = dailyFoodPlan("2026-08-18", birthday, entries);
  assert.ok(Math.abs(growing.expectedCurrentKg - 2.91) < 1e-12);
  assert.equal(growing.newTargetGrams, 64);

  const adult = dailyFoodPlan("2026-12-21", birthday, entries);
  const later = dailyFoodPlan("2027-12-21", birthday, entries);
  assert.equal(adult.expectedCurrentKg, 3);
  assert.equal(adult.newTargetGrams, 65);
  assert.equal(later.expectedCurrentKg, 3);

  const updated = dailyFoodPlan("2026-08-18", birthday, [
    ...entries, { date: "2026-08-18", grams: 3100 },
  ]);
  assert.equal(updated.expectedCurrentKg, 3.1);
  assert.equal(updated.newTargetGrams, 67);
});

test("preserves the live 58 g Royal Canin ration using Luna's October weight", () => {
  const liveWeights = [{ date: "2026-10-09", grams: 3340 }];
  for (const date of ["2026-10-20", "2026-10-21"]) {
    const before = dailyFoodPlan(date, birthday, liveWeights);
    assert.equal(before.oldGrams, 58);
    assert.equal(before.newGrams, 0);
    assert.equal(before.expectedAdultKg.toFixed(2), "3.37");
  }
  const first = dailyFoodPlan("2026-10-22", birthday, liveWeights);
  assert.equal(first.oldGrams, 56);
  assert.equal(first.newGrams, 3);
  assert.equal(first.totalGrams, 59);
  const last = dailyFoodPlan("2026-11-11", birthday, liveWeights);
  assert.equal(last.oldGrams, 0);
  assert.equal(last.newGrams, 70);
  assert.equal(last.kcal, 252);
});

test("interpolates the official rows and clamps weights outside the table", () => {
  assert.equal(plan("2026-11-11").newTargetGrams, 61);
  const outside = dailyFoodPlan("2026-11-11", birthday, [{ date: "2026-10-21", grams: 11000 }]);
  assert.equal(outside.weightOutsideTable, true);
  assert.equal(outside.newGrams, 155);
});

test("requires a valid weight recorded on or before the feeding date", () => {
  for (const entries of [
    [],
    [{ date: "2026-11-12", grams: 3340 }],
    [0, -1, NaN, "3340"].map(grams => ({ date: "2026-10-09", grams })),
  ]) {
    assert.equal(dailyFoodPlan("2026-11-11", birthday, entries), undefined);
  }
});

test("increases the new ration every day and calculates totals from weighed portions", () => {
  let previous = plan("2026-10-21");
  for (let i = 0; i < 21; ++i) {
    const date = new Date(Date.UTC(2026, 9, 22 + i)).toISOString().slice(0, 10);
    const current = plan(date);
    assert.ok(current.oldGrams <= previous.oldGrams);
    assert.ok(current.newGrams > previous.newGrams);
    assert.ok(current.newGrams - previous.newGrams <= 3);
    assert.equal(current.totalGrams, current.oldGrams + current.newGrams);
    assert.equal(current.kcal, Math.round(current.oldGrams * 3.96 + current.newGrams * 3.6));
    previous = current;
  }
});

test("holds through calendar days and resumes without jumping ahead", () => {
  const held = changeFoodTransition("2026-10-26", {}, "hold");
  assert.equal(plan("2026-10-26", held).day, 5);
  const later = plan("2026-10-30", held);
  assert.equal(later.day, 5);
  assert.equal(later.isPaused, true);
  assert.equal(later.fullDate, undefined);

  const resumed = changeFoodTransition("2026-10-30", held, "resume");
  assert.equal(plan("2026-10-30", resumed).day, 5);
  assert.equal(plan("2026-10-31", resumed).day, 6);
  assert.equal(plan("2026-10-31", resumed).fullDate, "2026-11-15");
  assert.deepEqual(changeFoodTransition("2026-10-30", resumed, "resume"), resumed);
});

test("steps back repeatedly to the old food and keeps the selected mix on hold", () => {
  let state = changeFoodTransition("2026-10-23", {}, "back");
  assert.equal(plan("2026-10-24", state).day, 1);
  state = changeFoodTransition("2026-10-24", state, "back");
  assert.equal(plan("2026-10-26", state).day, 0);
  assert.equal(plan("2026-10-26", state).newGrams, 0);
  state = changeFoodTransition("2026-10-26", state, "back");
  assert.equal(plan("2026-10-27", state).day, 0);
  state = changeFoodTransition("2026-10-27", state, "resume");
  assert.equal(plan("2026-10-27", state).day, 0);
  assert.equal(plan("2026-10-28", state).day, 1);
  assert.equal(plan("2026-10-28", state).fullDate, "2026-11-17");
});

test("can return to a mixed ration even after the scheduled completion", () => {
  const state = changeFoodTransition("2026-12-01", {}, "back");
  assert.equal(foodTransition("2026-12-01", state).day, 20);
  assert.equal(foodTransition("2026-12-10", state).day, 20);
});

test("does not change the schedule before it starts", () => {
  for (const action of ["hold", "back", "resume"]) {
    assert.deepEqual(changeFoodTransition("2026-10-21", {}, action), {});
  }
});
