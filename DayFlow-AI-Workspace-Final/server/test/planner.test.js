import test from "node:test";
import assert from "node:assert/strict";
import { buildStudyPlan } from "../src/planner.js";

const tasks = [
  { id: 1, title: "DBMS revision", duration_minutes: 90, priority: "high", due_date: "2026-10-24", completed: false },
  { id: 2, title: "Java practice", duration_minutes: 60, priority: "medium", due_date: null, completed: false },
  { id: 3, title: "Already finished", duration_minutes: 30, priority: "high", completed: true }
];

test("fills the selected schedule window and adds clock times and breaks", () => {
  const plan = buildStudyPlan(tasks, 180, { start_time: "14:00", break_every_minutes: 50, break_minutes: 10 });
  assert.equal(plan.total_minutes, 180);
  assert.equal(plan.start_time, "14:00");
  assert.equal(plan.end_time, "17:00");
  assert.equal(plan.items.reduce((sum, item) => sum + item.minutes, 0), 180);
  assert.ok(plan.items.some((item) => item.type === "break"));
  assert.ok(plan.items.every((item) => item.start_time && item.end_time));
  assert.equal(plan.items[0].task_id, 1);
});

test("excludes completed tasks and does not mutate source tasks", () => {
  const before = JSON.stringify(tasks);
  const plan = buildStudyPlan(tasks, 90, { start_time: "09:30" });
  assert.ok(plan.items.every((item) => item.task_title !== "Already finished"));
  assert.equal(JSON.stringify(tasks), before);
});

test("returns a helpful empty plan when there are no pending tasks", () => {
  const plan = buildStudyPlan([{ id: 9, title: "Done", completed: true }], 180);
  assert.equal(plan.items.length, 0);
  assert.match(plan.note, /no pending tasks/i);
});

test("clamps invalid duration and start-time inputs safely", () => {
  const plan = buildStudyPlan(tasks, Number.NaN, { start_time: "99:99" });
  assert.equal(plan.total_minutes, 180);
  assert.equal(plan.start_time, "09:00");
});

test("reports task time that cannot fit instead of silently dropping it", () => {
  const plan = buildStudyPlan([
    { id: 10, title: "Long assignment", duration_minutes: 180, priority: "high", completed: false }
  ], 60, { start_time: "08:00", break_every_minutes: 50, break_minutes: 10 });
  assert.ok(plan.unscheduled_tasks.length > 0);
  assert.equal(plan.unscheduled_tasks[0].task_id, 10);
  assert.ok(plan.unscheduled_minutes > 0);
  assert.match(plan.note, /too short/i);
});


test("reserves the requested final review period", () => {
  const plan = buildStudyPlan(tasks, 180, { start_time: "08:00", review_minutes: 20 });
  const finalItem = plan.items.at(-1);
  assert.equal(finalItem.task_title, "Final review");
  assert.equal(finalItem.minutes, 20);
  assert.equal(finalItem.end_time, "11:00");
  assert.equal(plan.items.reduce((sum, item) => sum + item.minutes, 0), 180);
});


test("does not count catch-up buffers as task focus minutes", () => {
  const tasks = [{ id: 1, title: "Short task", duration_minutes: 15, priority: "high", completed: false }];
  const plan = buildStudyPlan(tasks, 60, { start_time: "09:00", break_every_minutes: 50, break_minutes: 10 });
  const taskMinutes = plan.items.filter((item) => item.type === "task").reduce((sum, item) => sum + item.minutes, 0);
  const bufferMinutes = plan.items.filter((item) => item.type === "buffer").reduce((sum, item) => sum + item.minutes, 0);
  assert.equal(plan.focus_minutes, taskMinutes);
  assert.ok(bufferMinutes > 0);
  assert.equal(plan.items.reduce((sum, item) => sum + item.minutes, 0), 60);
});
