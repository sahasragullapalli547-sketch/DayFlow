const PRIORITIES = [
  { value: "high", pattern: /\b(?:high priority|high|urgent|important)\b/i },
  { value: "low", pattern: /\b(?:low priority|low)\b/i },
  { value: "medium", pattern: /\b(?:medium priority|medium)\b/i }
];

function parseDuration(text) {
  const hours = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = text.match(/\b(\d+)\s*(?:minutes?|mins?|min)\b/i);
  if (minutes) return Number(minutes[1]);
  return 60;
}

function parseDate(text) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const lower = text.toLowerCase();
  const now = new Date();
  if (/\btoday\b/.test(lower)) return localDate(now);
  if (/\btomorrow\b/.test(lower)) {
    now.setDate(now.getDate() + 1);
    return localDate(now);
  }
  return null;
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDeadlineTime(text) {
  const match = text.match(/\b(?:deadline|due|by)\s*:?\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3].toLowerCase().replaceAll(".", "");
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (suffix === "pm" && hour !== 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function cleanTitle(title) {
  return title
    .replace(/\s*[-–—:]\s*$/, "")
    .replace(/[.!]+$/, "")
    .replace(/^\s*(?:task\s*)?/i, "")
    .trim();
}


function parseClock(text, kind) {
  const expression = kind === "start"
    ? /\b(?:start|starting|begin)\s*(?:at)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i
    : /\b(?:finish|end|complete)\s*(?:by|at)?\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i;
  const match = text.match(expression);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3].toLowerCase().replaceAll(".", "");
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (suffix === "pm" && hour !== 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getScheduleOptions(text) {
  const startTime = parseClock(text, "start");
  const endTime = parseClock(text, "end");
  if (!startTime || !endTime) return null;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;
  const totalMinutes = end - start;
  if (totalMinutes < 30 || totalMinutes > 720) return null;
  const breakEvery = text.match(/\b(?:break|rest)\s+(?:after|every)\s+(\d+)\s*(?:minutes?|mins?)\b/i);
  const breakLength = text.match(/\b(\d+)\s*[- ]?minute\s+break\b/i);
  const review = text.match(/\b(?:final\s+)?(\d+)\s*[- ]?minute\s+review\b/i);
  return {
    total_minutes: totalMinutes,
    start_time: startTime,
    break_every_minutes: breakEvery ? Math.max(25, Math.min(180, Number(breakEvery[1]))) : 50,
    break_minutes: breakLength ? Math.max(5, Math.min(30, Number(breakLength[1]))) : 10,
    review_minutes: review ? Math.max(0, Math.min(60, Number(review[1]))) : 0
  };
}

/** Extracts a reviewable batch from numbered task lists. It never writes to the database. */
export function extractTaskBatch(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text || !/\b(?:plan|schedule|organize|organise|tasks|task list|busy day|day)\b/i.test(text)) {
    return { tasks: [], ignoredItems: [], warnings: [] };
  }

  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^\s*(\d{1,2})[.)]\s+(.+)$/);
    if (match) {
      if (current) sections.push(current);
      current = { heading: match[2].trim(), details: [] };
    } else if (current && /^\s*(?:[-*•]\s+|(?:duration|priority|deadline|due|no strict deadline)\s*:)/i.test(line)) {
      current.details.push(line.trim().replace(/^[-*•]\s+/, ""));
    } else if (current && /^\s+/.test(line) && line.trim()) {
      current.details.push(line.trim());
    }
  }
  if (current) sections.push(current);

  const tasks = [];
  const ignoredItems = [];
  const warnings = [];

  for (const section of sections) {
    const combined = [section.heading, ...section.details].join("\n");
    const title = cleanTitle(section.heading);
    if (/\b(lunch|refresh break|afternoon break|short break|take a break|review period)\b/i.test(title)) {
      ignoredItems.push({ title, reason: "Treated as a schedule constraint, not a task." });
      continue;
    }

    const durationMinutes = parseDuration(combined);
    if (durationMinutes < 15 || durationMinutes > 600) {
      warnings.push(`Skipped “${title}”: duration must be between 15 minutes and 10 hours.`);
      continue;
    }

    const priority = PRIORITIES.find((item) => item.pattern.test(combined))?.value || "medium";
    const dueDate = parseDate(combined) || parseDate(text);
    const dueTime = parseDeadlineTime(combined);

    if (title.length < 2 || title.length > 160) {
      warnings.push(`Skipped a task with an invalid title: “${title.slice(0, 50)}”.`);
      continue;
    }

    tasks.push({
      title,
      duration_minutes: durationMinutes,
      priority,
      due_date: dueDate,
      due_time: dueTime
    });
  }

  if (tasks.length < 2) return { tasks: [], ignoredItems, warnings };
  if (tasks.length !== sections.length - ignoredItems.length) {
    warnings.push("Some numbered sections may not have been interpreted as tasks. Review the extracted list before confirming.");
  }
  if (tasks.some((task) => task.due_time && !task.due_date)) {
    warnings.push("Clock deadlines were detected without a date. DayFlow stores the deadline time, but cannot assess date-specific conflicts until a due date is provided.");
  }
  if (ignoredItems.length) {
    warnings.push("Lunch and fixed-time break windows are recognized as constraints, not imported as tasks. This version does not yet guarantee those blocks will be placed inside their requested clock-time windows.");
  }

  return { tasks, ignoredItems, warnings, scheduleOptions: getScheduleOptions(text) };
}
