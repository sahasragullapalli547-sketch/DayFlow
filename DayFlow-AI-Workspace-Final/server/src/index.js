import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { queries, db } from "./db.js";
import { parseIntent, helpText } from "./intents.js";
import { buildStudyPlan } from "./planner.js";
import { extractTaskBatch } from "./batchTasks.js";
import { getLLMStatus, interpretWithLLM } from "./llm.js";
import { loadEnv } from "./env.js";

loadEnv();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set("trust proxy", process.env.TRUST_PROXY === "true");
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "100kb" }));

// Optional HTTP Basic Auth for public demo deployments. Keep credentials in the host's
// environment settings; never bake them into the frontend or source repository.
function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
const appUsername = process.env.APP_USERNAME || "";
const appPassword = process.env.APP_PASSWORD || "";
if (process.env.NODE_ENV === "production" && (!appUsername || !appPassword)) {
  console.error("Refusing to start a production deployment without APP_USERNAME and APP_PASSWORD. Configure both environment variables.");
  process.exit(1);
}
if (appUsername && appPassword) {
  app.use((req, res, next) => {
    // Keep the deployment platform's health probe public; no user data is returned.
    if (req.path === "/api/health") return next();
    const header = req.headers.authorization || "";
    const [scheme, encoded] = header.split(" ");
    if (scheme === "Basic" && encoded) {
      let decoded = "";
      try { decoded = Buffer.from(encoded, "base64").toString("utf8"); } catch {}
      const separator = decoded.indexOf(":");
      const username = separator >= 0 ? decoded.slice(0, separator) : "";
      const password = separator >= 0 ? decoded.slice(separator + 1) : "";
      if (safeEqual(username, appUsername) && safeEqual(password, appPassword)) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="DayFlow Demo", charset="UTF-8"');
    return res.status(401).send("Authentication required to access this DayFlow demo.");
  });
}

const assistantRate = new Map();
app.use("/api/assistant", (req, res, next) => {
  if (req.method !== "POST") return next();
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const record = assistantRate.get(key);
  if (!record || now - record.startedAt >= 60_000) {
    assistantRate.set(key, { startedAt: now, count: 1 });
    return next();
  }
  record.count += 1;
  if (record.count > 30) return res.status(429).json({ error: "Too many assistant requests. Please wait a minute and try again." });
  return next();
});

function taskFromRow(row) {
  return row ? { ...row, completed: Boolean(row.completed) } : null;
}

function allTasks() {
  return queries.listTasks.all().map(taskFromRow);
}

function isRealISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
}

function validateTaskFields(body) {
  const title = String(body?.title ?? "").trim();
  if (title.length < 2 || title.length > 160) {
    return { error: "Task title must be 2–160 characters." };
  }

  const dueDate = body?.due_date || null;
  if (dueDate !== null && !isRealISODate(dueDate)) {
    return { error: "Due date must be a real calendar date in YYYY-MM-DD format." };
  }

  const dueTime = body?.due_time || null;
  if (dueTime !== null && (typeof dueTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime))) {
    return { error: "Deadline time must use HH:MM format." };
  }

  const rawDuration = body?.duration_minutes === undefined
    ? 60
    : Number(body.duration_minutes);
  if (!Number.isFinite(rawDuration) || rawDuration < 15 || rawDuration > 600) {
    return { error: "Duration must be between 15 and 600 minutes." };
  }

  const priority = body?.priority ?? "medium";
  if (!["low", "medium", "high"].includes(priority)) {
    return { error: "Priority must be low, medium, or high." };
  }

  return {
    value: {
      title,
      due_date: dueDate,
      due_time: dueTime,
      duration_minutes: Math.round(rawDuration),
      priority
    }
  };
}

function savePlan(plan) {
  const persistedPlan = { ...plan, unsaved: false };
  const totalMinutes = Number(persistedPlan.total_minutes);
  const usedMinutes = Number(persistedPlan.used_minutes ?? 0);

  const save = db.transaction(() => {
    const result = queries.insertPlan.run(
      "Study plan",
      totalMinutes,
      JSON.stringify(persistedPlan)
    );
    return result.lastInsertRowid;
  });

  const id = save();
  const row = queries.getPlan.get(id);

  return {
    id: row.id,
    title: row.title,
    total_minutes: row.total_minutes,
    created_at: row.created_at,
    ...JSON.parse(row.plan_json),
    used_minutes: usedMinutes,
    unsaved: false
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "DayFlow",
    mode: "Alexa+ simulated web experience"
  });
});

app.get("/api/status", (_req, res) => {
  res.json({
    ok: true,
    app: "DayFlow",
    ai: getLLMStatus(),
    features: { tasks: true, plans: true, bulkImport: true, conversationHistory: true }
  });
});

app.get("/api/tasks", (_req, res) => {
  res.json({ tasks: allTasks() });
});

app.post("/api/tasks", (req, res) => {
  const validation = validateTaskFields(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const result = queries.insertTask.run(validation.value);
  return res.status(201).json({
    task: taskFromRow(queries.getTask.get(result.lastInsertRowid))
  });
});

app.put("/api/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Task ID must be a positive integer." });
  if (!queries.getTask.get(id)) return res.status(404).json({ error: "Task not found." });
  const validation = validateTaskFields(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  queries.editTask.run({ ...validation.value, id });
  return res.json({ task: taskFromRow(queries.getTask.get(id)) });
});

app.patch("/api/tasks/:id/complete", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: "Task ID must be a positive integer." });
  }

  const task = queries.getTask.get(id);
  if (!task) return res.status(404).json({ error: "Task not found." });

  let completed;
  if (req.body?.completed === undefined) {
    completed = !Boolean(task.completed);
  } else if (typeof req.body.completed === "boolean") {
    completed = req.body.completed;
  } else {
    return res.status(400).json({ error: "completed must be true or false." });
  }

  queries.updateTask.run(completed ? 1 : 0, id);
  return res.json({ task: taskFromRow(queries.getTask.get(id)) });
});

app.delete("/api/tasks/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: "Task ID must be a positive integer." });
  }

  const result = queries.deleteTask.run(id);
  if (!result.changes) return res.status(404).json({ error: "Task not found." });
  return res.json({ ok: true });
});

app.post("/api/tasks/batch", (req, res) => {
  const tasks = req.body?.tasks;
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 30) {
    return res.status(400).json({ error: "Confirm between 1 and 30 reviewed tasks." });
  }

  const validated = [];
  for (const task of tasks) {
    const validation = validateTaskFields(task);
    if (validation.error) return res.status(400).json({ error: validation.error });
    validated.push(validation.value);
  }

  try {
    const insertAll = db.transaction(() => validated.map((task) => {
      const result = queries.insertTask.run(task);
      return taskFromRow(queries.getTask.get(result.lastInsertRowid));
    }));
    const savedTasks = insertAll();
    return res.status(201).json({
      reply: `Added ${savedTasks.length} tasks to your list.`,
      tasks: allTasks(),
      created: savedTasks
    });
  } catch (error) {
    console.error("Batch task creation failed:", error);
    return res.status(500).json({ error: "The task batch could not be saved." });
  }
});

app.post("/api/assistant", async (req, res) => {
  try {
    const message = String(req.body?.message ?? "").trim();
    if (!message) return res.status(400).json({ error: "Please enter a message." });

    // Prefer semantic interpretation from the configured LLM. All mutations are still validated server-side.
    const aiStatus = getLLMStatus();
    if (aiStatus.configured) {
      try {
        const ai = await interpretWithLLM({ message, history: req.body?.history, tasks: allTasks() });
        if (ai) return handleAIAction(ai, res, message);
      } catch (error) {
        console.error("LLM request failed; using local intent fallback:", error.message);
      }
    }

    const batch = extractTaskBatch(message);
    if (batch.tasks.length >= 2) {
      return res.json({
        intent: "batch_preview",
        reply: `I found ${batch.tasks.length} possible tasks. Review the extracted details below; nothing has been saved yet.`,
        batchPreview: batch
      });
    }

    const parsed = parseIntent(message);

    if (parsed.intent === "help") {
      return res.json({ reply: helpText(), intent: parsed.intent });
    }

    if (parsed.intent === "unknown") {
      const aiStatus = getLLMStatus();
      return res.json({
        reply: aiStatus.configured
          ? "The AI provider could not process that request just now. Check the server terminal and provider configuration, then try again. You can also type ‘help’ for supported local commands."
          : "I'm running in local compatibility mode, so open-ended chat needs an AI model configured. Task commands and basic planning still work. Configure a provider in .env, or type ‘help’ for supported local commands.",
        intent: parsed.intent,
        mode: "fallback"
      });
    }

    if (parsed.intent === "clarify_task") {
      return res.json({
        reply: parsed.message || "What task should I add? Try: Add task DBMS revision due tomorrow.",
        intent: parsed.intent
      });
    }

    if (parsed.intent === "count_tasks") {
      const tasks = allTasks();
      const pendingCount = tasks.filter((task) => !task.completed).length;
      const completedCount = tasks.length - pendingCount;
      const reply = parsed.status === "pending"
        ? `You have ${pendingCount} pending task(s).`
        : parsed.status === "completed"
          ? `You have ${completedCount} completed task(s).`
          : `You have ${tasks.length} task(s) in total: ${pendingCount} pending and ${completedCount} completed.`;
      return res.json({ reply, intent: parsed.intent, tasks, counts: { total: tasks.length, pending: pendingCount, completed: completedCount } });
    }

    if (parsed.intent === "list_tasks") {
      const tasks = allTasks();
      const pendingCount = tasks.filter((task) => !task.completed).length;
      const completedCount = tasks.length - pendingCount;
      return res.json({
        reply: tasks.length
          ? `You have ${pendingCount} pending task(s) and ${completedCount} completed task(s).`
          : "You don't have any tasks yet. Add one to get started.",
        intent: parsed.intent,
        tasks
      });
    }

    if (parsed.intent === "add_task") {
      const validation = validateTaskFields(parsed.task);
      if (validation.error) {
        return res.status(400).json({ error: validation.error });
      }

      const result = queries.insertTask.run(validation.value);
      const saved = taskFromRow(queries.getTask.get(result.lastInsertRowid));

      return res.status(201).json({
        reply: `Added “${saved.title}” as task #${saved.id}.`,
        intent: parsed.intent,
        task: saved,
        tasks: allTasks()
      });
    }

    if (parsed.intent === "delete_task") {
      if (!Number.isSafeInteger(parsed.taskId) || parsed.taskId < 1) {
        return res.json({ reply: "Please provide a valid task number, such as ‘Delete task 1’.", intent: parsed.intent });
      }
      const task = queries.getTask.get(parsed.taskId);
      if (!task) return res.json({ reply: `I couldn't find task #${parsed.taskId}.`, intent: parsed.intent, tasks: allTasks() });
      queries.deleteTask.run(parsed.taskId);
      return res.json({ reply: `Deleted task #${parsed.taskId}: “${task.title}”.`, intent: parsed.intent, tasks: allTasks() });
    }

    if (parsed.intent === "complete_task") {
      if (!Number.isSafeInteger(parsed.taskId) || parsed.taskId < 1) {
        return res.json({
          reply: "Please provide a valid task number, such as “Complete task 1”.",
          intent: parsed.intent
        });
      }

      const task = queries.getTask.get(parsed.taskId);
      if (!task) {
        return res.json({
          reply: `I couldn't find task #${parsed.taskId}. Type “show my tasks” to see task IDs.`,
          intent: parsed.intent,
          tasks: allTasks()
        });
      }

      queries.updateTask.run(1, parsed.taskId);
      const saved = taskFromRow(queries.getTask.get(parsed.taskId));

      return res.json({
        reply: `Marked “${saved.title}” complete.`,
        intent: parsed.intent,
        task: saved,
        tasks: allTasks()
      });
    }

    if (parsed.intent === "create_plan") {
      const plan = buildStudyPlan(allTasks(), parsed.totalMinutes, parsed.options || {});
      return res.json({
        reply: "I've prepared a study plan for your review. Nothing has been saved as a plan yet.",
        intent: parsed.intent,
        plan: { ...plan, unsaved: true }
      });
    }

    return res.json({
      reply: "Try “help” for supported commands.",
      intent: parsed.intent
    });
  } catch (error) {
    console.error("Assistant request failed:", error);
    return res.status(500).json({ error: "Something went wrong while processing that request." });
  }
});

app.post("/api/plans/propose", (req, res) => {
  const totalMinutes = Number(req.body?.total_minutes);
  if (!Number.isInteger(totalMinutes) || totalMinutes < 30 || totalMinutes > 720) {
    return res.status(400).json({ error: "Choose a schedule between 30 minutes and 12 hours." });
  }
  const startTime = req.body?.start_time ?? "09:00";
  if (typeof startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    return res.status(400).json({ error: "Start time must use 24-hour HH:MM format." });
  }
  const breakEvery = Number(req.body?.break_every_minutes ?? 50);
  const breakLength = Number(req.body?.break_minutes ?? 10);
  if (!Number.isInteger(breakEvery) || breakEvery < 25 || breakEvery > 180 || !Number.isInteger(breakLength) || breakLength < 5 || breakLength > 30) {
    return res.status(400).json({ error: "Break frequency must be 25–180 minutes and break duration 5–30 minutes." });
  }
  const reviewMinutes = Number(req.body?.review_minutes ?? 0);
  if (!Number.isInteger(reviewMinutes) || reviewMinutes < 0 || reviewMinutes > 60 || reviewMinutes > totalMinutes - 30) {
    return res.status(400).json({ error: "Final review must be between 0 and 60 minutes and leave at least 30 minutes for the schedule." });
  }
  const plan = buildStudyPlan(allTasks(), totalMinutes, { start_time: startTime, break_every_minutes: breakEvery, break_minutes: breakLength, review_minutes: reviewMinutes });
  return res.json({ plan: { ...plan, unsaved: true } });
});

app.post("/api/plans", (req, res) => {
  const plan = req.body?.plan;
  const totalMinutes = Number(plan?.total_minutes);

  if (!plan ||
      !Array.isArray(plan.items) ||
      !Number.isInteger(totalMinutes) ||
      totalMinutes < 30 ||
      totalMinutes > 720) {
    return res.status(400).json({
      error: "A valid proposed plan with a total between 30 minutes and 12 hours is required."
    });
  }

  const validItems = plan.items.every((item) =>
    item &&
    ["task", "break", "buffer"].includes(item.type || "task") &&
    ((item.type === "break" || item.type === "buffer") || Number.isSafeInteger(Number(item.task_id))) &&
    typeof item.task_title === "string" &&
    item.task_title.trim().length > 0 &&
    Number.isInteger(Number(item.minutes)) &&
    Number(item.minutes) > 0 &&
    Number(item.minutes) <= totalMinutes &&
    typeof item.start_time === "string" && typeof item.end_time === "string"
  );
  const scheduledMinutes = plan.items.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  if (validItems && scheduledMinutes !== totalMinutes) {
    return res.status(400).json({ error: "Schedule blocks must add up exactly to the selected time window." });
  }

  if (!validItems) {
    return res.status(400).json({ error: "One or more study-plan items are invalid." });
  }

  try {
    const saved = savePlan(plan);
    return res.status(201).json({ plan: saved, id: saved.id });
  } catch (error) {
    console.error("Saving study plan failed:", error);
    return res.status(500).json({ error: "The study plan could not be saved." });
  }
});

app.get("/api/plans/latest", (_req, res) => {
  try {
    const row = queries.latestPlan.get();
    if (!row) return res.json({ plan: null });

    const storedPlan = JSON.parse(row.plan_json);
    return res.json({
      plan: {
        ...storedPlan,
        id: row.id,
        title: storedPlan.title || row.title,
        total_minutes: row.total_minutes,
        created_at: row.created_at,
        unsaved: false
      }
    });
  } catch (error) {
    console.error("Loading latest study plan failed:", error);
    return res.status(500).json({ error: "The latest study plan could not be loaded." });
  }
});

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const clientDist = path.join(projectRoot, "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
}
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API endpoint not found." });
  if (fs.existsSync(path.join(clientDist, "index.html"))) return res.sendFile(path.join(clientDist, "index.html"));
  return next();
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled API error:", error);
  if (error instanceof SyntaxError && "body" in error) return res.status(400).json({ error: "Request body must be valid JSON." });
  return res.status(500).json({ error: "An unexpected server error occurred." });
});

function listenWithFallback(port, attemptsLeft = 10) {
  const server = app.listen(port);
  server.once("listening", () => {
    console.log(`DAYFLOW_API_PORT=${port}`);
    console.log(`DayFlow API running at http://localhost:${port}`);
  });
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 1) {
      console.warn(`Port ${port} is already in use; trying ${port + 1}.`);
      listenWithFallback(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(`DayFlow could not start on port ${port}:`, error.message);
    process.exitCode = 1;
  });
  return server;
}

function findTaskByTarget(target, tasks) {
  if (Number.isSafeInteger(Number(target)) && String(target).trim() !== "") {
    return tasks.find((task) => task.id === Number(target)) || null;
  }
  const query = String(target || "").trim().toLowerCase();
  if (!query) return null;
  const exact = tasks.filter((task) => task.title.trim().toLowerCase() === query);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = tasks.filter((task) => task.title.toLowerCase().includes(query) || query.includes(task.title.toLowerCase()));
  return partial.length === 1 ? partial[0] : null;
}

function cleanAIOptions(options) {
  if (!options || typeof options !== "object") return null;
  const total = Number(options.total_minutes);
  const start = typeof options.start_time === "string" ? options.start_time : "09:00";
  if (!Number.isInteger(total) || total < 30 || total > 720 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) return null;
  const every = Number(options.break_every_minutes ?? 50);
  const length = Number(options.break_minutes ?? 10);
  const review = Number(options.review_minutes ?? 0);
  if (!Number.isInteger(every) || every < 25 || every > 180 || !Number.isInteger(length) || length < 5 || length > 30 || !Number.isInteger(review) || review < 0 || review > 60 || review >= total) return null;
  return { total_minutes: total, start_time: start, break_every_minutes: every, break_minutes: length, review_minutes: review };
}

function handleAIAction(ai, res, originalMessage) {
  const tasksNow = allTasks();
  const common = { intent: ai.action, mode: "ai" };

  if (ai.action === "chat" || ai.action === "clarify" || ai.action === "help") {
    return res.json({ ...common, reply: ai.reply || (ai.action === "help" ? helpText() : "Could you clarify what you'd like me to do?") });
  }
  if (ai.action === "list_tasks") {
    const pending = tasksNow.filter((task) => !task.completed).length;
    const completed = tasksNow.length - pending;
    return res.json({ ...common, reply: tasksNow.length ? `You have ${pending} pending and ${completed} completed task(s).\n\n${tasksNow.map((task) => `#${task.id} ${task.completed ? "✓" : "○"} ${task.title} · ${task.duration_minutes} min · ${task.priority}`).join("\n")}` : "You don't have any tasks yet.", tasks: tasksNow });
  }
  if (ai.action === "count_tasks") {
    const pending = tasksNow.filter((task) => !task.completed).length;
    const completed = tasksNow.length - pending;
    const status = ["pending", "completed", "all"].includes(ai.status) ? ai.status : "all";
    const reply = status === "pending" ? `You have ${pending} pending task(s).` : status === "completed" ? `You have ${completed} completed task(s).` : `You have ${tasksNow.length} task(s) in total: ${pending} pending and ${completed} completed.`;
    return res.json({ ...common, reply, tasks: tasksNow, counts: { total: tasksNow.length, pending, completed } });
  }
  if (ai.action === "create_tasks") {
    if (!Array.isArray(ai.tasks) || ai.tasks.length === 0 || ai.tasks.length > 30) {
      return res.json({ ...common, intent: "clarify", reply: "I couldn't reliably extract the task details. Please tell me the task names and any durations or deadlines." });
    }
    const reviewed = [];
    for (const task of ai.tasks) {
      const validation = validateTaskFields({
        title: task.title,
        due_date: task.due_date || null,
        due_time: task.due_time || null,
        duration_minutes: Number(task.duration_minutes || 60),
        priority: task.priority || "medium"
      });
      if (validation.error) return res.status(400).json({ error: `Could not validate an extracted task: ${validation.error}` });
      reviewed.push(validation.value);
    }
    const options = cleanAIOptions(ai.schedule_options);
    const shouldPreview = reviewed.length > 1 || Boolean(options) || /\b(plan|schedule|organis|organize|my day|tomorrow|today)\b/i.test(originalMessage);
    if (shouldPreview) {
      return res.json({
        ...common,
        intent: "batch_preview",
        reply: `I extracted ${reviewed.length} task(s). Review the details below; nothing has been saved yet.`,
        batchPreview: { tasks: reviewed, ignoredItems: Array.isArray(ai.ignored_items) ? ai.ignored_items.slice(0, 30) : [], warnings: Array.isArray(ai.warnings) ? ai.warnings.slice(0, 20) : [], scheduleOptions: options }
      });
    }
    const inserted = queries.insertTask.run(reviewed[0]);
    const saved = taskFromRow(queries.getTask.get(inserted.lastInsertRowid));
    return res.status(201).json({ ...common, reply: `Added “${saved.title}” as task #${saved.id}.`, task: saved, tasks: allTasks() });
  }
  if (["complete_task", "delete_task", "update_task"].includes(ai.action)) {
    const target = ai.task_id ?? ai.task_title;
    const task = findTaskByTarget(target, tasksNow);
    if (!task) {
      return res.json({ ...common, intent: "clarify", reply: "I couldn't identify one unique task to change. Tell me its task number or exact title so I don't modify the wrong item.", tasks: tasksNow });
    }
    if (ai.action === "complete_task") {
      queries.updateTask.run(1, task.id);
      const saved = taskFromRow(queries.getTask.get(task.id));
      return res.json({ ...common, reply: `Marked “${saved.title}” as completed.`, task: saved, tasks: allTasks() });
    }
    if (ai.action === "delete_task") {
      queries.deleteTask.run(task.id);
      return res.json({ ...common, reply: `Deleted “${task.title}”.`, tasks: allTasks() });
    }
    const updates = ai.updates && typeof ai.updates === "object" ? ai.updates : {};
    const validation = validateTaskFields({ ...task, ...updates, due_date: updates.due_date === undefined ? task.due_date : updates.due_date, due_time: updates.due_time === undefined ? task.due_time : updates.due_time });
    if (validation.error) return res.status(400).json({ error: validation.error });
    queries.editTask.run({ ...validation.value, id: task.id });
    const saved = taskFromRow(queries.getTask.get(task.id));
    return res.json({ ...common, reply: `Updated “${saved.title}”.`, task: saved, tasks: allTasks() });
  }
  if (ai.action === "create_plan") {
    const options = cleanAIOptions(ai.schedule_options);
    if (!options) return res.json({ ...common, intent: "clarify", reply: ai.reply || "What time should the plan start, and how long is your available window? For example: plan 3 hours starting at 8 AM." });
    const plan = buildStudyPlan(tasksNow, options.total_minutes, { start_time: options.start_time, break_every_minutes: options.break_every_minutes, break_minutes: options.break_minutes, review_minutes: options.review_minutes });
    return res.json({ ...common, reply: "I've prepared a schedule proposal. Review the timed blocks and any unscheduled tasks; the plan has not been saved yet.", plan: { ...plan, unsaved: true } });
  }
  return res.json({ ...common, reply: ai.reply || "I can help with that. Tell me a little more about the outcome you want." });
}

listenWithFallback(PORT);
