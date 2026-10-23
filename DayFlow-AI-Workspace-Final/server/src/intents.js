import { z } from "zod";

const taskInput = z.object({
  title: z.string().trim().min(2, "Please provide a task name.").max(160),
  due_date: z.string().nullable().optional(),
  duration_minutes: z.number().int().min(15).max(600).default(60),
  priority: z.enum(["low", "medium", "high"]).default("medium")
});

function localISODate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isRealISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function dateFromText(text) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return isRealISODate(iso[1]) ? { date: iso[1] } : { error: "That date is not valid. Use a real date in YYYY-MM-DD format." };
  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) return { date: localISODate() };
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    return { date: localISODate(tomorrow) };
  }
  return { date: null };
}

function parseDuration(text, fallback = 60) {
  const hourMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minuteMatch = text.match(/\b(\d+)\s*(?:minutes?|mins?|m)\b/i);
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60);
  if (minuteMatch) return Number(minuteMatch[1]);
  return fallback;
}

function parseClockTime(text) {
  const match = text.match(/\b(?:starting\s+)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return "09:00";
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3].toLowerCase().replaceAll(".", "");
  if (hour < 1 || hour > 12 || minute > 59) return "09:00";
  if (suffix === "pm" && hour !== 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function removeCommandMetadata(text) {
  return text
    .replace(/^\s*(?:please\s+)?(?:add|create|remember)\s+(?:a\s+)?(?:new\s+)?task\b\s*/i, "")
    .replace(/^\s*(?:please\s+)?(?:add|create|remember)\s+/i, "")
    .replace(/^\s*(?:new\s+task|new)\s+/i, "")
    .replace(/^\s*task\s+/i, "")
    .replace(/\s+due(?:\s+on)?\s+(?:today|tomorrow|\d{4}-\d{2}-\d{2})\b/ig, "")
    .replace(/\b(?:today|tomorrow)\b/ig, "")
    .replace(/\b(?:high priority|medium priority|low priority|urgent|important|high|medium|low)\b/ig, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b/ig, "")
    .replace(/\s+/g, " ").trim().replace(/^[,;:\-]+|[,;:\-]+$/g, "").trim();
}

export function parseIntent(rawText) {
  const text = String(rawText ?? "").trim();
  const lower = text.toLowerCase();
  if (!text || /^(help|what can you do|commands)$/i.test(text)) return { intent: "help" };

  if (/\b(?:delete|remove)\s+(?:(?:my|the)\s+)?(?:task\s*)?(?:#\s*)?(\d+)\b/i.test(text)) {
    const match = text.match(/\b(?:delete|remove)\s+(?:(?:my|the)\s+)?(?:task\s*)?(?:#\s*)?(\d+)\b/i);
    return { intent: "delete_task", taskId: Number(match[1]) };
  }
  if (/\b(how many|count|number of)\b/.test(lower) && /\b(tasks?|to-?dos?|assignments?)\b/.test(lower)) {
    if (/\b(completed|complete|finished|done)\b/.test(lower)) return { intent: "count_tasks", status: "completed" };
    if (/\b(pending|incomplete|unfinished|remaining|left)\b/.test(lower)) return { intent: "count_tasks", status: "pending" };
    return { intent: "count_tasks", status: "all" };
  }

  if (/\b(show|list|view|display)\b/.test(lower) && /\b(tasks?|to-?dos?|assignments?)\b/.test(lower)) return { intent: "list_tasks" };

  const completeMatch = lower.match(/\b(?:complete|finish|done|mark)\s+(?:(?:task|number|#)\s*)?(\d+)\b/);
  if (completeMatch) return { intent: "complete_task", taskId: Number(completeMatch[1]) };

  const planLanguage = /\b(plan|planning|schedule|timetable|organize|organise)\b/.test(lower);
  const durationMentioned = /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b/i.test(lower);
  if (planLanguage && (durationMentioned || /\b(my day|my tasks|study|work|session|next few hours)\b/.test(lower))) {
    const totalMinutes = parseDuration(lower, 180);
    const breakEvery = lower.match(/\b(?:break|rest)\s+(?:every\s+)?(\d+)\s*(?:minutes?|mins?)\b/i);
    const breakLength = lower.match(/\b(\d+)\s*(?:minute|min)\s+break\b/i);
    return {
      intent: "create_plan",
      totalMinutes: Math.max(30, Math.min(totalMinutes, 600)),
      options: { start_time: parseClockTime(text), break_every_minutes: breakEvery ? Number(breakEvery[1]) : 50, break_minutes: breakLength ? Number(breakLength[1]) : 10 }
    };
  }

  const looksLikeAdd = /^(?:please\s+)?(?:add|create|remember|new)\b/i.test(text) || /^(?:please\s+)?task\b/i.test(text) || /\bdue(?:\s+on)?\s+(?:today|tomorrow|\d{4}-\d{2}-\d{2})\b/i.test(text);
  if (looksLikeAdd) {
    const dateResult = dateFromText(text);
    if (dateResult.error) return { intent: "clarify_task", message: dateResult.error };
    const priority = /\b(high priority|high|urgent|important)\b/i.test(text) ? "high" : /\b(low priority|low)\b/i.test(text) ? "low" : "medium";
    const duration = parseDuration(text);
    const parsed = taskInput.safeParse({ title: removeCommandMetadata(text), due_date: dateResult.date, duration_minutes: Math.max(15, Math.min(600, duration)), priority });
    if (!parsed.success) return { intent: "clarify_task", message: parsed.error.issues[0]?.message || "Please provide a task name." };
    return { intent: "add_task", task: parsed.data };
  }
  return { intent: "unknown" };
}

export function helpText() {
  return [
    "I can manage tasks and build a clock-based schedule.",
    "• Add task DBMS revision due tomorrow high 90 minutes",
    "• Show my tasks",
    "• How many pending tasks do I have?",
    "• How many tasks have I completed?",
    "• Complete task 1",
    "• Delete task 1",
    "• Make a study plan for 3 hours starting at 2 PM",
    "• Plan my day for 2 hours with a 5 minute break every 25 minutes",
    "Use the task controls to edit details. Plans are proposals until you save them."
  ].join("\n");
}
