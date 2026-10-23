import test from "node:test";
import assert from "node:assert/strict";
import { extractTaskBatch } from "../src/batchTasks.js";

test("extracts numbered tasks with duration, priority, and clock deadline", () => {
  const prompt = `Plan my day and create a schedule.\n\n1. Finish my DBMS assignment.\n   - Duration: 2 hours.\n   - Priority: High.\n   - Deadline: 11:00 AM.\n\n2. Prepare for Java.\n   - Duration: 90 minutes.\n   - Priority: Medium.\n\n3. Take lunch.\n   - Duration: 40 minutes.`;
  const result = extractTaskBatch(prompt);
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].title, "Finish my DBMS assignment");
  assert.equal(result.tasks[0].duration_minutes, 120);
  assert.equal(result.tasks[0].priority, "high");
  assert.equal(result.tasks[0].due_time, "11:00");
  assert.equal(result.tasks[1].duration_minutes, 90);
  assert.equal(result.ignoredItems.length, 1);
});

test("infers a day window and shared date from the overall prompt", () => {
  const prompt = `Plan my day tomorrow. I can start at 8:00 AM and must finish by 8:00 PM.
1. DBMS assignment
- Duration: 2 hours
- Priority: High
2. Java revision
- Duration: 1 hour
- Priority: Medium`;
  const result = extractTaskBatch(prompt);
  assert.equal(result.tasks.length, 2);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const expectedDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  assert.equal(result.tasks[0].due_date, expectedDate);
  assert.equal(result.scheduleOptions.total_minutes, 720);
  assert.equal(result.scheduleOptions.start_time, "08:00");
} );

test("does not extract a batch from a normal short request", () => {
  const result = extractTaskBatch("Show my tasks");
  assert.equal(result.tasks.length, 0);
});
