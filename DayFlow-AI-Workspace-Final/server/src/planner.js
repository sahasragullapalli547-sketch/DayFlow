const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function parseStartTime(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "09:00";
  return value;
}

function addMinutesToClock(clock, minutes) {
  const [hours, mins] = clock.split(":").map(Number);
  const total = (hours * 60 + mins + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function sortTasks(tasks) {
  return tasks.slice().sort((a, b) => {
    const priorityDifference = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (priorityDifference) return priorityDifference;
    if (a.due_date && b.due_date) {
      const dateDifference = a.due_date.localeCompare(b.due_date);
      if (dateDifference) return dateDifference;
    }
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    if (a.due_time && b.due_time) {
      const timeDifference = a.due_time.localeCompare(b.due_time);
      if (timeDifference) return timeDifference;
    }
    if (a.due_time && !b.due_time) return -1;
    if (!a.due_time && b.due_time) return 1;
    return a.id - b.id;
  });
}

/**
 * Builds a deterministic, clock-based schedule. total_minutes is the complete
 * time window (breaks included); focus_minutes is the time allocated to tasks.
 */
export function buildStudyPlan(tasks, requestedMinutes, options = {}) {
  const totalMinutes = clampInteger(requestedMinutes, 180, 30, 720);
  const startTime = parseStartTime(options.start_time);
  const breakEveryMinutes = clampInteger(options.break_every_minutes, 50, 25, 180);
  const breakMinutes = clampInteger(options.break_minutes, 10, 5, 30);
  const reviewMinutes = Math.min(clampInteger(options.review_minutes, 0, 0, 60), totalMinutes - 30);
  const workWindowMinutes = totalMinutes - reviewMinutes;
  const pending = sortTasks(tasks.filter((task) => !task.completed));

  if (!pending.length) {
    return {
      title: `${totalMinutes}-minute focus plan`, start_time: startTime,
      end_time: addMinutesToClock(startTime, totalMinutes), total_minutes: totalMinutes,
      used_minutes: 0, focus_minutes: 0, break_minutes: 0, remaining_minutes: totalMinutes,
      items: [], note: "There are no pending tasks yet. Add tasks with realistic durations, then generate this schedule again."
    };
  }

  const items = [];
  let elapsed = 0;
  let focusSinceBreak = 0;
  let taskIndex = 0;
  let taskRemaining = Math.max(15, Number(pending[0].duration_minutes) || 60);
  let focusMinutes = 0;
  let breakTotal = 0;

  const pushItem = (item, minutes) => {
    const start = addMinutesToClock(startTime, elapsed);
    const end = addMinutesToClock(startTime, elapsed + minutes);
    items.push({ ...item, minutes, start_time: start, end_time: end });
    elapsed += minutes;
  };

  while (elapsed < workWindowMinutes) {
    const timeLeft = workWindowMinutes - elapsed;
    if (focusSinceBreak >= breakEveryMinutes && timeLeft > 0) {
      const length = Math.min(breakMinutes, timeLeft);
      pushItem({ type: "break", task_id: null, task_title: "Short break", priority: "low", reason: `Recovery break after ${breakEveryMinutes} minutes of focused work.` }, length);
      breakTotal += length;
      focusSinceBreak = 0;
      continue;
    }

    if (taskIndex < pending.length) {
      const task = pending[taskIndex];
      const toBreak = Math.max(1, breakEveryMinutes - focusSinceBreak);
      const length = Math.min(taskRemaining, timeLeft, toBreak);
      pushItem({
        type: "task", task_id: task.id, task_title: task.title,
        priority: task.priority || "medium", due_date: task.due_date || null,
        reason: task.priority === "high" ? "High priority: scheduled early." : task.due_date ? `Due ${task.due_date}; ordered by priority and deadline.` : "Ordered by priority, then deadline."
      }, length);
      taskRemaining -= length;
      focusSinceBreak += length;
      focusMinutes += length;
      if (taskRemaining <= 0) {
        taskIndex += 1;
        if (taskIndex < pending.length) taskRemaining = Math.max(15, Number(pending[taskIndex].duration_minutes) || 60);
      }
      continue;
    }

    // A schedule should account for the entire requested window. Use the spare
    // time for a clearly labelled review/buffer rather than silently ending early.
    const toBreak = Math.max(1, breakEveryMinutes - focusSinceBreak);
    const length = Math.min(timeLeft, toBreak, 25);
    pushItem({ type: "buffer", task_id: null, task_title: "Review / catch-up buffer", priority: "low", reason: "Use this time to recap, finish an unfinished step, or prepare the next session." }, length);
    focusSinceBreak += length;
  }

  if (reviewMinutes > 0) {
    pushItem({
      type: "buffer",
      task_id: null,
      task_title: "Final review",
      priority: "low",
      reason: "Reserved from your prompt for a final review before the day ends."
    }, reviewMinutes);
  }

  const scheduled = items.reduce((sum, item) => sum + item.minutes, 0);
  const unscheduledTasks = [];
  if (taskIndex < pending.length) {
    const current = pending[taskIndex];
    if (taskRemaining > 0) {
      unscheduledTasks.push({
        task_id: current.id,
        title: current.title,
        remaining_minutes: taskRemaining,
        priority: current.priority || "medium"
      });
    }
    for (let index = taskIndex + 1; index < pending.length; index += 1) {
      const task = pending[index];
      unscheduledTasks.push({
        task_id: task.id,
        title: task.title,
        remaining_minutes: Math.max(15, Number(task.duration_minutes) || 60),
        priority: task.priority || "medium"
      });
    }
  }
  const unscheduledMinutes = unscheduledTasks.reduce((sum, task) => sum + task.remaining_minutes, 0);
  return {
    title: `${Math.floor(totalMinutes / 60) ? `${Math.floor(totalMinutes / 60)}h ` : ""}${totalMinutes % 60 ? `${totalMinutes % 60}m ` : ""}focus plan`.trim(),
    start_time: startTime,
    end_time: addMinutesToClock(startTime, totalMinutes),
    total_minutes: totalMinutes,
    used_minutes: scheduled,
    focus_minutes: focusMinutes,
    break_minutes: breakTotal,
    remaining_minutes: Math.max(0, totalMinutes - scheduled),
    unscheduled_tasks: unscheduledTasks,
    unscheduled_minutes: unscheduledMinutes,
    break_settings: { every_minutes: breakEveryMinutes, duration_minutes: breakMinutes },
    review_minutes: reviewMinutes,
    items,
    note: unscheduledTasks.length
      ? `This window is too short to fit every pending task. ${unscheduledTasks.length} task(s), with ${unscheduledMinutes} minutes remaining, are not fully scheduled. Review the unscheduled list before saving.`
      : `A clock-based proposal from ${startTime} to ${addMinutesToClock(startTime, totalMinutes)}. It includes ${breakTotal} minutes of breaks and reserves ${reviewMinutes} minutes for final review. Review the allocations before saving.`
  };
}
