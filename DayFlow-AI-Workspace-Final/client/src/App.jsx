import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, CalendarDays, Check, CheckCircle2, Circle, Clock3, Command,
  ListTodo, LoaderCircle, MessageCircle, Plus, RefreshCw, Sparkles, Trash2,
  Pencil, X, WandSparkles, CalendarClock
} from "lucide-react";

const API = "/api";
const examples = [
  "I need to revise DBMS tomorrow for 90 minutes; it is urgent",
  "What's still on my plate?",
  "Help me make a realistic 3-hour study plan from 2 PM",
  "I finished the first task"
];

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function priorityClass(priority) { return `priority priority-${priority || "medium"}`; }
function formatMinutes(value) {
  const mins = Number(value) || 0;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return [hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ") || "0m";
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("dayflow-chat") || "null");
      return Array.isArray(saved) && saved.length
        ? saved.slice(-60)
        : [{ role: "assistant", text: "Hey! I’m DayFlow. Tell me what you need to get done, and I’ll help turn it into a clear, timed plan." }];
    } catch {
      return [{ role: "assistant", text: "Hey! I’m DayFlow. Tell me what you need to get done, and I’ll help turn it into a clear, timed plan." }];
    }
  });
  const [aiStatus, setAiStatus] = useState(null);
  const [plan, setPlan] = useState(null);
  const [batchPreview, setBatchPreview] = useState(null);
  const [confirmingBatch, setConfirmingBatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingTask, setEditingTask] = useState(null);
  const [savingTask, setSavingTask] = useState(false);
  const [scheduleMinutes, setScheduleMinutes] = useState("180");
  const [startTime, setStartTime] = useState("09:00");
  const [breakEvery, setBreakEvery] = useState("50");
  const [breakLength, setBreakLength] = useState("10");
  const [buildingPlan, setBuildingPlan] = useState(false);

  async function refreshTasks() {
    const data = await request("/tasks");
    setTasks(data.tasks || []);
  }

  useEffect(() => {
    refreshTasks().catch((error) => setNotice(error.message));
    request("/status").then((data) => setAiStatus(data.ai)).catch(() => setAiStatus({ configured: false, message: "API status unavailable" }));
    request("/plans/latest").then((data) => {
      if (data.plan) {
        setPlan(data.plan);
        setScheduleMinutes(String(data.plan.total_minutes || 180));
        setStartTime(data.plan.start_time || "09:00");
        setBreakEvery(String(data.plan.break_settings?.every_minutes || 50));
        setBreakLength(String(data.plan.break_settings?.duration_minutes || 10));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    try { localStorage.setItem("dayflow-chat", JSON.stringify(chat.slice(-60))); } catch {}
  }, [chat]);

  const pendingCount = tasks.filter((task) => !task.completed).length;
  const completedCount = tasks.length - pendingCount;
  const visibleTasks = useMemo(() => tasks.filter((task) => filter === "all" || (filter === "pending" ? !task.completed : task.completed)), [tasks, filter]);

  async function sendMessage(text = message) {
    const clean = text.trim();
    if (!clean || busy) return;
    setChat((old) => [...old, { role: "user", text: clean }]);
    setMessage("");
    setBusy(true);
    setNotice("");
    try {
      const history = chat.slice(-12).map((item) => ({ role: item.role, content: item.text }));
      const data = await request("/assistant", { method: "POST", body: JSON.stringify({ message: clean, history }) });
      setChat((old) => [...old, { role: "assistant", text: data.reply || "Done." }]);
      if (data.tasks) setTasks(data.tasks);
      if (data.batchPreview) setBatchPreview(data.batchPreview);
      if (data.task) await refreshTasks();
      if (data.plan) {
        setPlan(data.plan);
        setScheduleMinutes(String(data.plan.total_minutes || 180));
        setStartTime(data.plan.start_time || "09:00");
        setBreakEvery(String(data.plan.break_settings?.every_minutes || 50));
        setBreakLength(String(data.plan.break_settings?.duration_minutes || 10));
      }
    } catch (error) {
      setChat((old) => [...old, { role: "assistant", text: `I hit a problem: ${error.message}` }]);
    } finally { setBusy(false); }
  }

  function updateBatchTask(index, field, value) {
    setBatchPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        tasks: current.tasks.map((task, taskIndex) =>
          taskIndex === index ? { ...task, [field]: value } : task
        )
      };
    });
  }

  async function confirmBatchTasks() {
    if (!batchPreview?.tasks?.length || confirmingBatch) return;
    setConfirmingBatch(true);
    try {
      const data = await request("/tasks/batch", {
        method: "POST",
        body: JSON.stringify({ tasks: batchPreview.tasks })
      });
      setTasks(data.tasks || []);
      const scheduleOptions = batchPreview.scheduleOptions;
      if (scheduleOptions) {
        const proposed = await request("/plans/propose", {
          method: "POST",
          body: JSON.stringify(scheduleOptions)
        });
        setPlan(proposed.plan);
        setScheduleMinutes(String(proposed.plan.total_minutes));
        setStartTime(proposed.plan.start_time || scheduleOptions.start_time);
        setBreakEvery(String(proposed.plan.break_settings?.every_minutes || scheduleOptions.break_every_minutes || 50));
        setBreakLength(String(proposed.plan.break_settings?.duration_minutes || scheduleOptions.break_minutes || 10));
        setChat((old) => [...old, { role: "assistant", text: `${data.reply || `Added ${batchPreview.tasks.length} tasks.`} I also prepared a ${formatMinutes(proposed.plan.total_minutes)} schedule starting at ${proposed.plan.start_time}. Review the proposed schedule below; it has not been saved as a plan.` }]);
        setNotice("Tasks saved and a schedule proposal generated. Review deadline conflicts and break constraints before saving the plan.");
      } else {
        setChat((old) => [...old, { role: "assistant", text: data.reply || `Added ${batchPreview.tasks.length} tasks.` }]);
        setNotice(data.reply || "Tasks saved.");
      }
      setBatchPreview(null);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setConfirmingBatch(false);
    }
  }

  async function toggleTask(task) {
    try {
      const data = await request(`/tasks/${task.id}/complete`, { method: "PATCH", body: JSON.stringify({ completed: !task.completed }) });
      setTasks((old) => old.map((item) => item.id === data.task.id ? data.task : item));
      setNotice(data.task.completed ? "Task completed and saved." : "Task reopened and saved.");
    } catch (error) { setNotice(error.message); }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Permanently delete “${task.title}”? This cannot be undone.`)) return;
    try {
      await request(`/tasks/${task.id}`, { method: "DELETE" });
      setTasks((old) => old.filter((item) => item.id !== task.id));
      setNotice(`Deleted “${task.title}”.`);
      if (plan?.items?.some((item) => item.task_id === task.id)) {
        setNotice(`Deleted “${task.title}”. The displayed plan still contains its previous snapshot; regenerate the plan to update it.`);
      }
    } catch (error) { setNotice(error.message); }
  }

  function openEditor(task) {
    setEditingTask({ ...task, due_date: task.due_date || "", due_time: task.due_time || "" });
  }

  async function saveTaskEdit(event) {
    event.preventDefault();
    if (!editingTask || savingTask) return;
    setSavingTask(true);
    try {
      const payload = {
        title: editingTask.title.trim(),
        due_date: editingTask.due_date || null,
        due_time: editingTask.due_time || null,
        duration_minutes: Number(editingTask.duration_minutes),
        priority: editingTask.priority
      };
      const data = await request(`/tasks/${editingTask.id}`, { method: "PUT", body: JSON.stringify(payload) });
      setTasks((old) => old.map((item) => item.id === data.task.id ? data.task : item));
      setEditingTask(null);
      setNotice("Task changes saved.");
    } catch (error) { setNotice(error.message); }
    finally { setSavingTask(false); }
  }

  async function generatePlan(event) {
    event?.preventDefault();
    if (buildingPlan) return;
    setBuildingPlan(true);
    setNotice("");
    try {
      const data = await request("/plans/propose", {
        method: "POST",
        body: JSON.stringify({
          total_minutes: Number(scheduleMinutes), start_time: startTime,
          break_every_minutes: Number(breakEvery), break_minutes: Number(breakLength)
        })
      });
      setPlan(data.plan);
      setChat((old) => [...old, { role: "assistant", text: data.plan.items.length
        ? `Built a ${formatMinutes(data.plan.total_minutes)} schedule from ${data.plan.start_time} to ${data.plan.end_time}. It includes ${formatMinutes(data.plan.break_minutes)} of breaks. Review the timed blocks below before saving.`
        : "There are no pending tasks to schedule yet. Add a task first, then generate the plan again." }]);
      setNotice(data.plan.items.length ? "Detailed schedule generated. Review it below." : "Add at least one pending task to generate a schedule.");
    } catch (error) { setNotice(error.message); }
    finally { setBuildingPlan(false); }
  }

  async function savePlan() {
    if (!plan || !plan.items?.length || !plan.unsaved) return;
    try {
      const data = await request("/plans", { method: "POST", body: JSON.stringify({ plan }) });
      setPlan({ ...data.plan, id: data.id, unsaved: false });
      setNotice("Study plan saved to the database.");
    } catch (error) { setNotice(error.message); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Sparkles size={19} /></div><span>dayflow<span className="brand-dot">.</span></span></div>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <button className="nav-item active"><Command size={17} /> Today <span className="nav-count">{pendingCount}</span></button>
        <button className={`nav-item ${filter === "all" ? "" : ""}`} onClick={() => setFilter("all")}><ListTodo size={17} /> All tasks</button>
        <button className="nav-item" onClick={() => setFilter("pending")}><Circle size={17} /> To do</button>
        <button className="nav-item" onClick={() => setFilter("completed")}><CheckCircle2 size={17} /> Completed</button>
        <div className="sidebar-bottom"><div className="avatar">DF</div><div><strong>DayFlow demo</strong><small>Alexa+ simulated experience</small></div></div>
      </aside>

      <section className="main-panel">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Today</div><div className="topbar-right"><span className={`status-dot ${aiStatus?.configured ? "status-ai" : "status-local"}`} /> {aiStatus?.configured ? `AI configured · ${aiStatus.model}` : "Local compatibility mode"} <button className="icon-button" title="Refresh tasks" onClick={() => refreshTasks().then(() => setNotice("Tasks refreshed from database.")).catch((e) => setNotice(e.message))}><RefreshCw size={16} /></button></div></header>
        <div className="page-content">
          <div className="welcome-row">
            <div><div className="eyebrow"><span className="tiny-spark">✳</span> ALEXA+-INSPIRED · SIMULATED WEB EXPERIENCE</div><h1>Make room for <em>what matters.</em></h1><p className="subheading">A productivity-assistant simulation: capture tasks in natural language, review AI suggestions, and build realistic schedules with clock times and breaks.</p></div>
            <div className="date-chip"><CalendarDays size={16} /> {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
          </div>

          <div className="stats-grid">
            <div className="stat-card"><div className="stat-icon purple"><ListTodo size={17} /></div><span>Pending tasks</span><strong>{pendingCount}</strong><small>Ready for your focus</small></div>
            <div className="stat-card"><div className="stat-icon green"><CheckCircle2 size={17} /></div><span>Completed</span><strong>{completedCount}</strong><small>Small wins add up</small></div>
            <div className="stat-card"><div className="stat-icon amber"><Clock3 size={17} /></div><span>Scheduled window</span><strong>{plan ? formatMinutes(plan.total_minutes) : "—"}</strong><small>{plan ? `${plan.focus_minutes ?? plan.used_minutes ?? 0} focus minutes` : "Generate a plan to begin"}</small></div>
          </div>

          <section className="panel schedule-builder">
            <div className="panel-heading"><div><div className="eyebrow"><CalendarClock size={14} /> DETAILED PLANNER</div><h2>Build a schedule that fits your time</h2><p>Choose the complete time window, start time, and break rhythm. The schedule will account for every minute.</p></div></div>
            <form className="schedule-form" onSubmit={generatePlan}>
              <label>Available time<select value={scheduleMinutes} onChange={(event) => setScheduleMinutes(event.target.value)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option><option value="300">5 hours</option><option value="360">6 hours</option><option value="480">8 hours</option><option value="600">10 hours</option><option value="720">12 hours</option></select></label>
              <label>Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
              <label>Focus interval<select value={breakEvery} onChange={(event) => setBreakEvery(event.target.value)}><option value="25">25 minutes</option><option value="40">40 minutes</option><option value="50">50 minutes</option><option value="60">60 minutes</option><option value="75">75 minutes</option><option value="90">90 minutes</option><option value="120">120 minutes</option></select></label>
              <label>Break length<select value={breakLength} onChange={(event) => setBreakLength(event.target.value)}><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option></select></label>
              <button className="primary-button generate-button" disabled={buildingPlan}><WandSparkles size={15} /> {buildingPlan ? "Building schedule…" : "Generate detailed schedule"}</button>
            </form>
            <div className="planner-hint">Tip: Add task durations and priorities first. High-priority and nearer-deadline tasks are scheduled earlier. Spare time becomes a labelled review buffer.</div>
          </section>

          <div className="content-grid">
            <section className="panel tasks-panel">
              <div className="panel-heading"><div><h2>Your tasks</h2><p>Edit, complete, or delete any task.</p></div><button className="soft-button" onClick={() => { setMessage("Add task "); document.getElementById("chat-input")?.focus(); }}><Plus size={15} /> Add task</button></div>
              <div className="task-filters">{["all", "pending", "completed"].map((item) => <button key={item} className={filter === item ? "filter active-filter" : "filter"} onClick={() => setFilter(item)}>{item === "all" ? "All" : item === "pending" ? "To do" : "Completed"}</button>)}</div>
              <div className="task-list">
                {visibleTasks.length === 0 && <div className="empty-state"><div className="empty-icon"><ListTodo size={23} /></div><strong>{tasks.length ? "No tasks in this filter." : "Your list has breathing room."}</strong><span>{tasks.length ? "Choose another filter to see more tasks." : "Ask DayFlow to add your first task."}</span></div>}
                {visibleTasks.map((task) => <div className={`task-row ${task.completed ? "task-done" : ""}`} key={task.id}>
                  <button className="check-button" aria-label={task.completed ? "Reopen task" : "Complete task"} title={task.completed ? "Reopen task" : "Complete task"} onClick={() => toggleTask(task)}>{task.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button>
                  <div className="task-main"><strong>{task.title}</strong><div className="task-meta"><span>#{task.id}</span>{(task.due_date || task.due_time) && <span><CalendarDays size={12} /> {task.due_date || "Deadline"}{task.due_time ? ` · ${task.due_time}` : ""}</span>}<span><Clock3 size={12} /> {task.duration_minutes} min</span><span className={priorityClass(task.priority)}>{task.priority}</span></div></div>
                  <div className="task-actions"><button className="edit-button" aria-label={`Edit ${task.title}`} title="Edit task" onClick={() => openEditor(task)}><Pencil size={15} /></button><button className="delete-button" aria-label={`Delete ${task.title}`} title="Delete task" onClick={() => deleteTask(task)}><Trash2 size={15} /></button></div>
                </div>)}
              </div>
              <div className="panel-footer"><span>Showing {visibleTasks.length} of {tasks.length} tasks</span><span><span className="status-dot" /> Saved locally</span></div>
            </section>

            <section className="panel assistant-panel">
              <div className="assistant-heading"><div className="assistant-icon"><Sparkles size={18} /></div><div><h2>Talk to DayFlow</h2><p>{aiStatus?.configured ? "Natural conversation with task-aware AI." : "Task-aware assistant · connect an LLM for open-ended chat."}</p></div><span className="beta-tag">{aiStatus?.configured ? "AI CONFIGURED" : "LOCAL MODE"}</span></div>
              <div className="chat-messages">
                {chat.map((item, index) => <div className={`message ${item.role}`} key={index}><div className="message-avatar">{item.role === "assistant" ? <Sparkles size={14} /> : "You"}</div><div className="message-bubble">{item.text}</div></div>)}
                {busy && <div className="message assistant"><div className="message-avatar"><Sparkles size={14} /></div><div className="message-bubble typing"><LoaderCircle size={15} className="spin" /> Thinking…</div></div>}
              </div>
              <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}><input id="chat-input" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add, complete, delete, or plan…" aria-label="Message DayFlow" /><button className="send-button" disabled={!message.trim() || busy} aria-label="Send message"><ArrowUpRight size={18} /></button></form>
              <div className="examples-label">TRY ASKING</div><div className="example-chips">{examples.map((example) => <button key={example} onClick={() => sendMessage(example)} disabled={busy}>{example}</button>)}</div>
              <div className="assistant-footnote"><MessageCircle size={13} /> {aiStatus?.configured ? `Powered by ${aiStatus.provider} · ${aiStatus.model}` : "Local fallback mode · Configure an LLM in .env for typo-tolerant open-ended chat"} · Tasks save to your local database</div>
            </section>
          </div>

          {batchPreview && <section className="panel batch-preview-panel">
            <div className="panel-heading">
              <div><div className="eyebrow">BULK TASK IMPORT</div><h2>Review extracted tasks</h2><p>These are suggestions extracted from your prompt. Nothing is saved until you confirm.</p></div>
              <span className="batch-count">{batchPreview.tasks.length} tasks</span>
            </div>
            <div className="batch-task-list">
              {batchPreview.tasks.map((task, index) => <div className="batch-task-row" key={`${index}-${task.title}`}>
                <div className="batch-task-number">{String(index + 1).padStart(2, "0")}</div>
                <div className="batch-task-fields">
                  <label>Task title<input value={task.title} onChange={(event) => updateBatchTask(index, "title", event.target.value)} maxLength={160} /></label>
                  <div className="batch-task-meta-fields">
                    <label>Duration<select value={task.duration_minutes} onChange={(event) => updateBatchTask(index, "duration_minutes", Number(event.target.value))}>{[15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480, 600].map((mins) => <option key={mins} value={mins}>{formatMinutes(mins)}</option>)}</select></label>
                    <label>Priority<select value={task.priority} onChange={(event) => updateBatchTask(index, "priority", event.target.value)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
                    <label>Due date<input type="date" value={task.due_date || ""} onChange={(event) => updateBatchTask(index, "due_date", event.target.value || null)} /></label>
                    <label>Deadline time<input type="time" value={task.due_time || ""} onChange={(event) => updateBatchTask(index, "due_time", event.target.value || null)} /></label>
                  </div>
                </div>
              </div>)}
            </div>
            {batchPreview.ignoredItems?.length > 0 && <p className="batch-note">Not imported as tasks: {batchPreview.ignoredItems.map((item) => item.title).join(", ")}. These look like break or schedule constraints.</p>}
            {batchPreview.warnings?.map((warning, index) => <p className="batch-warning" key={index}>{warning}</p>)}
            <div className="batch-actions"><span>Review titles, durations, priorities, and deadlines before saving.</span><div><button className="soft-button" onClick={() => setBatchPreview(null)} disabled={confirmingBatch}>Cancel import</button><button className="primary-button" onClick={confirmBatchTasks} disabled={confirmingBatch || batchPreview.tasks.some((task) => !task.title?.trim() || task.title.trim().length < 2)}>{confirmingBatch ? "Saving tasks…" : `Confirm & add ${batchPreview.tasks.length} tasks`}</button></div></div>
          </section>}

          {plan && <section className="panel plan-panel">
            <div className="panel-heading"><div><div className="eyebrow"><CalendarClock size={14} /> FOCUS MODE</div><h2>{plan.title || "Your proposed study plan"}</h2><p>{plan.note || "Review your plan before saving it."}</p></div><div className="plan-total"><strong>{formatMinutes(plan.total_minutes || 0)}</strong><span>{plan.start_time || "—"} – {plan.end_time || "—"}</span></div></div>
            <div className="plan-summary"><span><strong>{plan.focus_minutes ?? plan.used_minutes ?? 0}</strong> focus minutes</span><span><strong>{plan.break_minutes ?? 0}</strong> break minutes</span><span><strong>{plan.items?.length ?? 0}</strong> blocks</span></div>
            {plan.unscheduled_tasks?.length > 0 && <div className="unscheduled-warning"><strong>Not fully scheduled — {plan.unscheduled_minutes} minutes remain</strong><p>The time window cannot fit every task with the current break settings. These tasks need more time:</p><ul>{plan.unscheduled_tasks.map((task) => <li key={task.task_id}>{task.title}: {task.remaining_minutes} minutes remaining</li>)}</ul></div>}
            {!plan.items?.length ? <div className="plan-empty">Add at least one pending task, then generate a schedule.</div> : <div className="plan-items">{plan.items.map((item, index) => <div className={`plan-item plan-item-${item.type || "task"}`} key={`${item.type}-${item.task_id}-${index}`}>
              <div className="plan-time"><strong>{item.start_time || "—"}</strong><span>{item.end_time || "—"}</span></div><div className="plan-number">{String(index + 1).padStart(2, "0")}</div><div className="plan-task"><strong>{item.task_title}</strong><span>{item.reason}</span></div><div className="plan-duration">{item.minutes} min</div>
            </div>)}</div>}
            <div className="plan-actions"><span>{plan.unsaved ? "Proposed schedule · Review the times and blocks before saving." : plan.id ? `Saved to your local database${plan.created_at ? ` · ${new Date(plan.created_at.replace(" ", "T") + "Z").toLocaleString()}` : ""}.` : "Loaded from your saved plans."}</span><div className="plan-action-buttons"><button className="soft-button" onClick={generatePlan} disabled={buildingPlan}><RefreshCw size={14} /> Regenerate</button><button className="primary-button" disabled={!plan.items?.length || !plan.unsaved} onClick={savePlan}>{plan.unsaved ? "Confirm & save plan" : <><Check size={15} /> Saved</>}</button></div></div>
          </section>}

          {notice && <button className="notice" onClick={() => setNotice("")}>{notice} <span>×</span></button>}
          <footer className="page-footer"><span>DAYFLOW AI WORKSPACE</span><span>Capture it. Plan it. Do it.</span><span>{aiStatus?.configured ? "AI-assisted · validated actions" : "Local-first · configure AI for open-ended requests"}</span></footer>
        </div>
      </section>

      {editingTask && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingTask(null); }}>
        <form className="edit-modal" onSubmit={saveTaskEdit}>
          <div className="modal-heading"><div><h2>Edit task</h2><p>Update the details saved in your database.</p></div><button type="button" className="modal-close" onClick={() => setEditingTask(null)} aria-label="Close editor"><X size={18} /></button></div>
          <label>Task name<input value={editingTask.title} onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value })} minLength={2} maxLength={160} required /></label>
          <div className="edit-grid"><label>Due date<input type="date" value={editingTask.due_date} onChange={(event) => setEditingTask({ ...editingTask, due_date: event.target.value })} /></label><label>Deadline time<input type="time" value={editingTask.due_time || ""} onChange={(event) => setEditingTask({ ...editingTask, due_time: event.target.value })} /></label><label>Duration<select value={editingTask.duration_minutes} onChange={(event) => setEditingTask({ ...editingTask, duration_minutes: Number(event.target.value) })}>{[15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600].map((mins) => <option key={mins} value={mins}>{formatMinutes(mins)}</option>)}</select></label></div>
          <label>Priority<select value={editingTask.priority} onChange={(event) => setEditingTask({ ...editingTask, priority: event.target.value })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
          <div className="modal-actions"><button type="button" className="soft-button" onClick={() => setEditingTask(null)}>Cancel</button><button type="submit" className="primary-button" disabled={savingTask}>{savingTask ? "Saving…" : "Save changes"}</button></div>
        </form>
      </div>}
    </main>
  );
}
