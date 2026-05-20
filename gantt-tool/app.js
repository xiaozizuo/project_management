const STORAGE_KEY = "gantt_tool_data_v1";
const API_BASE = "/api";
const SIDEBAR_WIDTH_KEY = "gantt_sidebar_width";
const SUMMARY_COLLAPSED_KEY = "gantt_summary_collapsed";
const SUMMARY_SPLIT_KEY = "gantt_summary_split_left";
const SIDEBAR_WIDTH_MIN = 220;
const SIDEBAR_WIDTH_MAX = 680;

const NODE_OPTIONS = ["计划", "立项", "采购", "实施", "上线试运行", "验收"];

const dom = {
  projectList: document.getElementById("projectList"),
  mainLayout: document.getElementById("mainLayout"),
  sidebarResizer: document.getElementById("sidebarResizer"),
  emptyState: document.getElementById("emptyState"),
  projectContent: document.getElementById("projectContent"),
  btnNewProject: document.getElementById("btnNewProject"),
  btnAddTask: document.getElementById("btnAddTask"),
  btnExport: document.getElementById("btnExport"),
  fileImport: document.getElementById("fileImport"),
  backendStatus: document.getElementById("backendStatus"),
  summaryBoard: document.getElementById("summaryBoard"),
  summaryCompact: document.getElementById("summaryCompact"),
  summaryDetails: document.getElementById("summaryDetails"),
  btnSummaryToggle: document.getElementById("btnSummaryToggle"),
  summaryGrid: document.getElementById("summaryGrid"),
  summaryGridResizer: document.getElementById("summaryGridResizer"),
  summaryMonthFilter: document.getElementById("summaryMonthFilter"),
  summaryDeptFilter: document.getElementById("summaryDeptFilter"),
  summaryOwnerFilter: document.getElementById("summaryOwnerFilter"),
  btnSummaryReset: document.getElementById("btnSummaryReset"),
  summaryCards: document.getElementById("summaryCards"),
  deptSummaryBody: document.getElementById("deptSummaryBody"),
  delayTaskList: document.getElementById("delayTaskList"),
  taskTableBody: document.getElementById("taskTableBody"),
  overallPlanProgress: document.getElementById("overallPlanProgress"),
  overallProgress: document.getElementById("overallProgress"),
  ganttContainer: document.getElementById("ganttContainer"),
  ganttScale: document.getElementById("ganttScale"),
  ganttMonthFilter: document.getElementById("ganttMonthFilter"),
  fields: {
    projectName: document.getElementById("projectName"),
    taskCategory: document.getElementById("taskCategory"),
    mainTaskName: document.getElementById("mainTaskName"),
    systemCategory: document.getElementById("systemCategory"),
    ownerUnit: document.getElementById("ownerUnit"),
    ownerDept: document.getElementById("ownerDept"),
    assistUnit: document.getElementById("assistUnit"),
    assistDept: document.getElementById("assistDept"),
    startDate: document.getElementById("startDate"),
    targetDate: document.getElementById("targetDate"),
    ownerPerson: document.getElementById("ownerPerson"),
  },
};

const state = {
  projects: [],
  activeProjectId: null,
  summaryFilters: {
    month: "",
    dept: "",
    owner: "",
  },
};

const runtime = {
  storageMode: "local",
  saveQueue: Promise.resolve(),
  storageNote: "",
  summaryCollapsed: true,
};

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function setBackendStatus() {
  if (!dom.backendStatus) return;
  if (runtime.storageMode === "api") {
    dom.backendStatus.textContent = "存储模式：后端 SQLite";
    dom.backendStatus.title = "当前数据写入 SQLite";
    return;
  }
  const suffix = runtime.storageNote ? `（${runtime.storageNote}）` : "";
  dom.backendStatus.textContent = `存储模式：本地${suffix}`;
  dom.backendStatus.title = "当前数据写入浏览器本地存储";
}

function applyLoadedState(payload) {
  if (!payload || !Array.isArray(payload.projects)) return;
  state.projects = payload.projects.map((p) => ({
    ...p,
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
    snapshots: Array.isArray(p.snapshots) ? p.snapshots : [],
  }));
  state.activeProjectId = payload.activeProjectId || payload.projects[0]?.id || null;
}

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    applyLoadedState(JSON.parse(raw));
  } catch (err) {
    console.error("load local failed", err);
  }
}

async function loadFromApiIfAvailable() {
  try {
    if (window.location.protocol === "file:") {
      runtime.storageMode = "local";
      runtime.storageNote = "请通过 http://127.0.0.1:8081 打开";
      return;
    }

    const health = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (!health.ok) {
      runtime.storageMode = "local";
      runtime.storageNote = "后端未响应";
      return;
    }

    const resp = await fetch(`${API_BASE}/state`, { cache: "no-store" });
    if (!resp.ok) {
      runtime.storageMode = "local";
      runtime.storageNote = "后端状态读取失败";
      return;
    }
    const payload = await resp.json();
    applyLoadedState(payload);
    runtime.storageMode = "api";
    runtime.storageNote = "";
  } catch (err) {
    runtime.storageMode = "local";
    runtime.storageNote = "后端不可达";
  }
}

function currentStatePayload() {
  return {
    projects: state.projects,
    activeProjectId: state.activeProjectId,
  };
}

function queueApiPersist() {
  if (runtime.storageMode !== "api") return;
  const payload = currentStatePayload();
  runtime.saveQueue = runtime.saveQueue
    .then(() =>
      fetch(`${API_BASE}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    )
    .catch((err) => {
      console.error("save api failed", err);
    });
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentStatePayload()));
  queueApiPersist();
}

function clampSidebarWidth(width) {
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, width));
}

function setSidebarWidth(width) {
  if (!dom.mainLayout) return;
  const clamped = clampSidebarWidth(width);
  dom.mainLayout.style.setProperty("--sidebar-width", `${clamped}px`);
  localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
}

function initSidebarResize() {
  if (!dom.mainLayout || !dom.sidebarResizer) return;

  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (Number.isFinite(saved) && saved > 0) {
    setSidebarWidth(saved);
  }

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  const onMouseMove = (evt) => {
    if (!dragging) return;
    const delta = evt.clientX - startX;
    setSidebarWidth(startWidth + delta);
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("sidebar-resizing");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    const p = getActiveProject();
    if (p) renderGantt(p);
  };

  dom.sidebarResizer.addEventListener("mousedown", (evt) => {
    if (window.innerWidth <= 1200) return;
    dragging = true;
    startX = evt.clientX;
    const current = getComputedStyle(dom.mainLayout).getPropertyValue("--sidebar-width").trim();
    startWidth = Number.parseInt(current || "320", 10) || 320;
    document.body.classList.add("sidebar-resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  dom.sidebarResizer.addEventListener("dblclick", () => {
    setSidebarWidth(320);
    const p = getActiveProject();
    if (p) renderGantt(p);
  });
}

function getActiveProject() {
  return state.projects.find((p) => p.id === state.activeProjectId) || null;
}

function createEmptyProject() {
  const id = uid();
  return {
    id,
    projectCode: `P-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${id.slice(-4).toUpperCase()}`,
    projectName: "",
    taskCategory: "类别A",
    mainTaskName: "",
    systemCategory: "系统A",
    projectMeasure: "",
    ownerUnit: "",
    ownerDept: "",
    assistUnit: "",
    assistDept: "",
    startDate: "",
    targetDate: "",
    ownerPerson: "",
    tasks: [],
    snapshots: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function toDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToInput(d) {
  return d.toISOString().slice(0, 10);
}

function calcCycleDays(startDate, endDate) {
  const s = toDate(startDate);
  const e = toDate(endDate);
  if (!s || !e || e < s) return "";
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

function calcOverallProgress(tasks) {
  if (!tasks.length) return 0;
  const weighted = tasks.reduce(
    (acc, t) => {
      const cycle = Number(t.cycleDays || 1) || 1;
      const pct = Math.max(0, Math.min(100, Number(t.progress || 0)));
      acc.sum += pct * cycle;
      acc.weight += cycle;
      return acc;
    },
    { sum: 0, weight: 0 },
  );
  return weighted.weight ? Math.round(weighted.sum / weighted.weight) : 0;
}

function calcOverallPlannedProgress(tasks) {
  const validTasks = (tasks || []).filter((t) => t.expectedStartDate && t.expectedEndDate);
  if (!validTasks.length) return 0;

  const today = atStartOfDay(new Date());
  const weighted = validTasks.reduce(
    (acc, t) => {
      const start = toDate(t.expectedStartDate);
      const end = toDate(t.expectedEndDate);
      if (!start || !end || end < start) return acc;

      const totalDays = Math.max(1, Math.round((atStartOfDay(end) - atStartOfDay(start)) / 86400000) + 1);
      let plannedPct = 0;
      if (today < atStartOfDay(start)) {
        plannedPct = 0;
      } else if (today > atStartOfDay(end)) {
        plannedPct = 100;
      } else {
        const elapsedDays = Math.max(1, Math.round((today - atStartOfDay(start)) / 86400000) + 1);
        plannedPct = Math.round((elapsedDays / totalDays) * 100);
      }

      acc.sum += plannedPct * totalDays;
      acc.weight += totalDays;
      return acc;
    },
    { sum: 0, weight: 0 },
  );

  return weighted.weight ? Math.round(weighted.sum / weighted.weight) : 0;
}

function monthKey(dateLike) {
  if (!dateLike) return "";
  return dateLike.slice(0, 7);
}

function atStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthIndexBetween(startMonth, date) {
  return (date.getFullYear() - startMonth.getFullYear()) * 12 + (date.getMonth() - startMonth.getMonth());
}

function renderGanttToolbarState() {
  const scale = dom.ganttScale?.value || "month";
  const disabled = scale === "year";
  dom.ganttMonthFilter.disabled = disabled;
  dom.ganttMonthFilter.title = disabled ? "年视图不按月份筛选" : "按月份筛选";
}

function upsertSnapshot(project) {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const idx = project.snapshots.findIndex((x) => x.month === key);
  const payload = {
    month: key,
    updatedAt: new Date().toISOString(),
    overallProgress: calcOverallProgress(project.tasks),
    taskCount: project.tasks.length,
    doneCount: project.tasks.filter((x) => !!x.actualDoneDate).length,
    delayedCount: project.tasks.filter((x) => isDelayed(x)).length,
  };
  if (idx >= 0) {
    project.snapshots[idx] = payload;
  } else {
    project.snapshots.push(payload);
  }
}

function isDelayed(task) {
  if (!task.expectedEndDate) return false;
  if (task.actualDoneDate) return false;
  const today = new Date();
  const due = toDate(task.expectedEndDate);
  return due ? due < new Date(today.toDateString()) : false;
}

function getProjectStatus(project) {
  const tasks = project.tasks || [];
  if (!tasks.length) return "未开始";
  if (tasks.every((t) => !!t.actualDoneDate)) return "已完成";
  if (tasks.some((t) => isDelayed(t))) return "延期";
  return "进行中";
}

function taskOverlapMonth(task, month) {
  if (!month) return true;
  if (!task.expectedStartDate || !task.expectedEndDate) return false;
  return monthKey(task.expectedStartDate) <= month && monthKey(task.expectedEndDate) >= month;
}

function projectMatchMonth(project, month) {
  if (!month) return true;
  const tasks = project.tasks || [];
  if (tasks.some((t) => taskOverlapMonth(t, month))) return true;
  if (project.startDate && project.targetDate) {
    return monthKey(project.startDate) <= month && monthKey(project.targetDate) >= month;
  }
  return false;
}

function renderSummaryFilterOptions() {
  const deptSet = new Set();
  const ownerSet = new Set();
  state.projects.forEach((p) => {
    if (p.ownerDept) deptSet.add(p.ownerDept);
    if (p.ownerPerson) ownerSet.add(p.ownerPerson);
  });

  const depts = Array.from(deptSet).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const owners = Array.from(ownerSet).sort((a, b) => a.localeCompare(b, "zh-CN"));

  dom.summaryMonthFilter.value = state.summaryFilters.month || "";

  const deptCurrent = state.summaryFilters.dept;
  dom.summaryDeptFilter.innerHTML =
    '<option value="">全部部门</option>' +
    depts.map((dept) => `<option value="${escapeHtml(dept)}">${escapeHtml(dept)}</option>`).join("");
  if (depts.includes(deptCurrent)) {
    dom.summaryDeptFilter.value = deptCurrent;
  } else {
    state.summaryFilters.dept = "";
  }

  const ownerCurrent = state.summaryFilters.owner;
  dom.summaryOwnerFilter.innerHTML =
    '<option value="">全部负责人</option>' +
    owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join("");
  if (owners.includes(ownerCurrent)) {
    dom.summaryOwnerFilter.value = ownerCurrent;
  } else {
    state.summaryFilters.owner = "";
  }
}

function getSummaryFilteredProjects() {
  const { month, dept, owner } = state.summaryFilters;
  return state.projects.filter((p) => {
    if (dept && p.ownerDept !== dept) return false;
    if (owner && p.ownerPerson !== owner) return false;
    if (!projectMatchMonth(p, month)) return false;
    return true;
  });
}

function renderSummaryBoard() {
  const projects = getSummaryFilteredProjects();
  const allTasks = projects.flatMap((p) => p.tasks || []);
  const doneProjects = projects.filter((p) => getProjectStatus(p) === "已完成").length;
  const delayedProjects = projects.filter((p) => getProjectStatus(p) === "延期").length;
  const inProgressProjects = projects.filter((p) => getProjectStatus(p) === "进行中").length;
  const delayedTasks = allTasks.filter((t) => isDelayed(t));
  const avgProgress = projects.length
    ? Math.round(projects.reduce((sum, p) => sum + calcOverallProgress(p.tasks || []), 0) / projects.length)
    : 0;

  dom.summaryCompact.innerHTML = [
    `项目 ${projects.length}`,
    `进行中 ${inProgressProjects}`,
    `延期 ${delayedProjects}`,
    `平均进度 ${avgProgress}%`,
  ]
    .map((x) => `<span class="summary-chip">${x}</span>`)
    .join("");

  dom.summaryCards.innerHTML = [
    { label: "项目总数", value: projects.length },
    { label: "进行中项目", value: inProgressProjects },
    { label: "已完成项目", value: doneProjects },
    { label: "延期项目", value: delayedProjects },
    { label: "任务总数", value: allTasks.length },
    { label: "平均进度", value: `${avgProgress}%` },
  ]
    .map(
      (x) =>
        `<div class="metric-card"><div class="metric-label">${x.label}</div><div class="metric-value">${x.value}</div></div>`,
    )
    .join("");

  const deptMap = new Map();
  projects.forEach((p) => {
    const key = p.ownerDept || "未填写";
    const prev = deptMap.get(key) || { projectCount: 0, progressSum: 0, delayedTaskCount: 0 };
    prev.projectCount += 1;
    prev.progressSum += calcOverallProgress(p.tasks || []);
    prev.delayedTaskCount += (p.tasks || []).filter((t) => isDelayed(t)).length;
    deptMap.set(key, prev);
  });

  const deptRows = Array.from(deptMap.entries())
    .sort((a, b) => b[1].projectCount - a[1].projectCount)
    .map(([dept, val]) => {
      const avg = val.projectCount ? Math.round(val.progressSum / val.projectCount) : 0;
      return `<tr><td>${escapeHtml(dept)}</td><td>${val.projectCount}</td><td>${avg}%</td><td>${val.delayedTaskCount}</td></tr>`;
    })
    .join("");
  dom.deptSummaryBody.innerHTML = deptRows || '<tr><td colspan="4">暂无数据</td></tr>';

  const topDelay = delayedTasks
    .map((t) => ({
      title: t.title || "未命名任务",
      due: t.expectedEndDate || "",
      delayDays: t.expectedEndDate
        ? Math.max(0, Math.round((atStartOfDay(new Date()) - atStartOfDay(toDate(t.expectedEndDate))) / 86400000))
        : 0,
    }))
    .sort((a, b) => b.delayDays - a.delayDays)
    .slice(0, 10);

  dom.delayTaskList.innerHTML = topDelay.length
    ? topDelay
        .map((x) => `<li>${escapeHtml(x.title)}（截至 ${x.due || "未知"}，延期 ${x.delayDays} 天）</li>`)
        .join("")
    : "<li>暂无延期任务</li>";
}

function setSummaryCollapsed(collapsed) {
  runtime.summaryCollapsed = !!collapsed;
  if (!dom.summaryBoard || !dom.btnSummaryToggle) return;
  dom.summaryBoard.classList.toggle("collapsed", runtime.summaryCollapsed);
  dom.btnSummaryToggle.textContent = runtime.summaryCollapsed ? "展开" : "收起";
  localStorage.setItem(SUMMARY_COLLAPSED_KEY, runtime.summaryCollapsed ? "1" : "0");
}

function initSummaryBoardCollapse() {
  const saved = localStorage.getItem(SUMMARY_COLLAPSED_KEY);
  setSummaryCollapsed(saved === null ? true : saved === "1");
}

function setSummarySplitRatio(leftRatio) {
  if (!dom.summaryGrid) return;
  const left = Math.max(30, Math.min(70, Number(leftRatio) || 40));
  const right = 100 - left;
  dom.summaryGrid.style.setProperty("--summary-left", `${left}fr`);
  dom.summaryGrid.style.setProperty("--summary-right", `${right}fr`);
  localStorage.setItem(SUMMARY_SPLIT_KEY, String(left));
}

function initSummarySplitRatio() {
  const saved = Number(localStorage.getItem(SUMMARY_SPLIT_KEY));
  setSummarySplitRatio(Number.isFinite(saved) && saved > 0 ? saved : 40);
}

function initSummaryGridResize() {
  if (!dom.summaryGrid || !dom.summaryGridResizer) return;

  let dragging = false;

  const onMouseMove = (evt) => {
    if (!dragging) return;
    const rect = dom.summaryGrid.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const total = Math.max(1, rect.width);
    const leftRatio = (x / total) * 100;
    setSummarySplitRatio(leftRatio);
  };

  const onMouseUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("summary-grid-resizing");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  dom.summaryGridResizer.addEventListener("mousedown", (evt) => {
    dragging = true;
    document.body.classList.add("summary-grid-resizing");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    evt.preventDefault();
  });
}

function renderProjectList() {
  dom.projectList.innerHTML = "";

  state.projects.forEach((project) => {
    const li = document.createElement("li");
    li.className = `project-item${project.id === state.activeProjectId ? " active" : ""}`;
    const progress = calcOverallProgress(project.tasks);
    const delayed = project.tasks.filter((x) => isDelayed(x)).length;

    li.innerHTML = `
      <div><strong>${project.projectName || "未命名项目"}</strong></div>
      <div class="project-meta">
        <span>${project.projectCode || "无编号"}</span>
        <span>进度 ${progress}%</span>
      </div>
      <div class="project-meta">
        <span>${project.ownerPerson || "未设置责任人"}</span>
        <span class="${delayed ? "task-delay" : ""}">延期 ${delayed}</span>
      </div>
    `;

    li.addEventListener("click", () => {
      state.activeProjectId = project.id;
      persist();
      renderAll();
    });

    dom.projectList.appendChild(li);
  });
}

function bindProjectFields(project) {
  Object.entries(dom.fields).forEach(([key, input]) => {
    const defaultValue = (key === "taskCategory" && input.options?.[0]?.value) ||
      (key === "systemCategory" && input.options?.[0]?.value) ||
      "";
    input.value = project[key] || defaultValue;
    input.onchange = () => {
      project[key] = input.value.trim();
      project.updatedAt = new Date().toISOString();
      if (!project.projectCode && project.projectName && project.startDate) {
        project.projectCode = `${project.projectName.slice(0, 6)}-${project.startDate.replaceAll("-", "")}`;
      }
      upsertSnapshot(project);
      persist();
      renderProjectList();
      renderGantt(project);
    };
  });
}

function renderTaskTable(project) {
  dom.taskTableBody.innerHTML = "";

  project.tasks.forEach((task, index) => {
    const tr = document.createElement("tr");
    const delayedCls = isDelayed(task) ? "task-delay" : "";
    const doneCls = task.actualDoneDate ? "task-complete" : "";

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><input data-k="title" value="${escapeHtml(task.title)}" /></td>
      <td><input data-k="desc" value="${escapeHtml(task.desc)}" /></td>
      <td>
        <select data-k="mainNode">
          ${NODE_OPTIONS.map((op) => `<option value="${op}" ${op === task.mainNode ? "selected" : ""}>${op}</option>`).join("")}
        </select>
      </td>
      <td><input data-k="expectedStartDate" type="date" value="${task.expectedStartDate || ""}" /></td>
      <td><input data-k="expectedEndDate" type="date" value="${task.expectedEndDate || ""}" /></td>
      <td><input data-k="cycleDays" value="${task.cycleDays || ""}" readonly /></td>
      <td><input data-k="progress" type="number" min="0" max="100" value="${Number(task.progress || 0)}" /></td>
      <td><input data-k="actualDoneDate" type="date" value="${task.actualDoneDate || ""}" class="${doneCls}" /></td>
      <td><input data-k="deliverable" value="${escapeHtml(task.deliverable || "")}" /></td>
      <td><button data-action="remove" class="ghost ${delayedCls}">删除</button></td>
    `;

    tr.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("change", (evt) => {
        const k = evt.target.getAttribute("data-k");
        if (!k) return;
        let val = evt.target.value;
        if (k === "progress") {
          val = String(Math.max(0, Math.min(100, Number(val) || 0)));
        }
        task[k] = val;
        task.cycleDays = calcCycleDays(task.expectedStartDate, task.expectedEndDate);
        if (task.actualDoneDate && Number(task.progress || 0) < 100) {
          task.progress = 100;
        }
        project.updatedAt = new Date().toISOString();
        upsertSnapshot(project);
        persist();
        renderAll();
      });
    });

    tr.querySelector("button[data-action='remove']").addEventListener("click", () => {
      if (!window.confirm("确认删除该明细吗？")) return;
      project.tasks.splice(index, 1);
      project.updatedAt = new Date().toISOString();
      upsertSnapshot(project);
      persist();
      renderAll();
    });

    dom.taskTableBody.appendChild(tr);
  });
}

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseDateFromText(text, keys) {
  for (const key of keys) {
    const reg = new RegExp(`${key}[:：]?\\s*([0-9]{4}[-/.年][0-9]{1,2}[-/.月][0-9]{1,2}日?)`);
    const m = text.match(reg);
    if (m?.[1]) {
      return normalizeDate(m[1]);
    }
  }
  return "";
}

function normalizeDate(dateText) {
  const digits = dateText
    .replace("年", "-")
    .replace("月", "-")
    .replace("日", "")
    .replaceAll("/", "-")
    .replaceAll(".", "-")
    .split("-")
    .filter(Boolean)
    .map((x) => Number(x));

  if (digits.length !== 3) return "";
  const [y, m, d] = digits;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return "";
  }
  return dateToInput(dt);
}

function parseSimpleField(text, labels) {
  for (const lb of labels) {
    const reg = new RegExp(`${lb}[:：]?\\s*([^\\n\\r，。,；;]+)`);
    const m = text.match(reg);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function extractFromText(project, text) {
  const pick = (current, next) => (current ? current : next || "");

  project.projectName = pick(project.projectName, parseSimpleField(text, ["任务名称", "项目名称"]));
  project.mainTaskName = pick(project.mainTaskName, parseSimpleField(text, ["主任务名称"]));
  project.ownerUnit = pick(project.ownerUnit, parseSimpleField(text, ["责任单位"]));
  project.ownerDept = pick(project.ownerDept, parseSimpleField(text, ["责任部门"]));
  project.assistUnit = pick(project.assistUnit, parseSimpleField(text, ["协办单位"]));
  project.assistDept = pick(project.assistDept, parseSimpleField(text, ["协办部门"]));
  project.ownerPerson = pick(project.ownerPerson, parseSimpleField(text, ["科信部责任人", "责任人"]));
  project.startDate = pick(project.startDate, parseDateFromText(text, ["立项日期", "开始日期"]));
  project.targetDate = pick(project.targetDate, parseDateFromText(text, ["目标验收日期", "预计完成日期"]));

  if (!project.projectCode && project.projectName && project.startDate) {
    project.projectCode = `${project.projectName.slice(0, 6)}-${project.startDate.replaceAll("-", "")}`;
  }

  project.updatedAt = new Date().toISOString();
}

function renderGantt(project) {
  renderGanttToolbarState();

  const month = dom.ganttMonthFilter.value;
  const scale = dom.ganttScale?.value || "month";
  const tasks = project.tasks
    .filter((t) => t.expectedStartDate && t.expectedEndDate)
    .filter((t) => {
      if (scale === "year") return true;
      return month ? monthKey(t.expectedStartDate) <= month && monthKey(t.expectedEndDate) >= month : true;
    })
    .sort((a, b) => a.expectedStartDate.localeCompare(b.expectedStartDate));

  if (!tasks.length) {
    dom.ganttContainer.innerHTML = '<div class="empty-state">暂无可绘制任务，请先填写预计起止日期</div>';
    return;
  }

  const rawStart = tasks.map((t) => toDate(t.expectedStartDate)).reduce((a, b) => (a < b ? a : b));
  const rawEnd = tasks.map((t) => toDate(t.expectedEndDate)).reduce((a, b) => (a > b ? a : b));
  const rowH = 34;
  const leftCol = 250;
  const h = tasks.length * rowH + 60;
  const containerWidth = Math.max(360, (dom.ganttContainer?.clientWidth || 0) - 2);
  const timelineWidth = Math.max(120, containerWidth - leftCol - 30);
  let svg = "";

  if (scale === "year") {
    const start = atStartOfDay(new Date(rawStart.getFullYear(), 0, 1));
    const end = atStartOfDay(new Date(rawEnd.getFullYear(), 11, 31));
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const totalMonths = monthIndexBetween(startMonth, endMonth) + 1;
    const totalDays = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
    const dayUnitW = timelineWidth / totalDays;
    const width = Math.ceil(leftCol + timelineWidth + 24);
    const monthPx = timelineWidth / totalMonths;
    const monthLineStep = monthPx < 6 ? 3 : 1;
    const showQuarterLabel = monthPx >= 14;
    const showHalfYearLabel = monthPx >= 8;
    const minLabelGap = 52;
    let lastLabelX = -Infinity;

    svg = `<svg class="gantt-svg" width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect x="0" y="0" width="${width}" height="${h}" fill="#fbfdff"/>`;

    for (let i = 0; i <= totalMonths; i++) {
      const dt = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      const x = leftCol + Math.round((atStartOfDay(dt) - start) / 86400000) * dayUnitW;
      const isYearBoundary = dt.getMonth() === 0;
      const isMajorMonthTick = i % monthLineStep === 0;
      if (isYearBoundary || isMajorMonthTick) {
        svg += `<line x1="${x}" y1="30" x2="${x}" y2="${h}" stroke="${isYearBoundary ? "#8aa5c7" : "#edf1f7"}" stroke-width="${isYearBoundary ? 2 : 1}" />`;
      }

      if (isYearBoundary) {
        if (x - lastLabelX >= minLabelGap) {
          svg += `<text x="${x + 2}" y="16">${dt.getFullYear()}年</text>`;
          lastLabelX = x;
        }
      } else if (showQuarterLabel && dt.getMonth() % 3 === 0) {
        if (x - lastLabelX >= minLabelGap) {
          svg += `<text x="${x + 2}" y="16">${String(dt.getMonth() + 1).padStart(2, "0")}月</text>`;
          lastLabelX = x;
        }
      } else if (!showQuarterLabel && showHalfYearLabel && dt.getMonth() % 6 === 0) {
        if (x - lastLabelX >= minLabelGap) {
          svg += `<text x="${x + 2}" y="16">${String(dt.getMonth() + 1).padStart(2, "0")}月</text>`;
          lastLabelX = x;
        }
      }
    }

    tasks.forEach((t, idx) => {
      const y = 40 + idx * rowH;
      const s = toDate(t.expectedStartDate);
      const e = toDate(t.expectedEndDate);
      const sx = leftCol + Math.round((atStartOfDay(s) - start) / 86400000) * dayUnitW;
      const ex = leftCol + (Math.round((atStartOfDay(e) - start) / 86400000) + 1) * dayUnitW;
      const w = Math.max(8, ex - sx);
      const progress = Math.max(0, Math.min(100, Number(t.progress || 0)));
      const progressW = Math.round((w * progress) / 100);
      const barColor = isDelayed(t) ? "#fca5a5" : "#8cc7de";

      svg += `<text x="8" y="${y + 14}">${escapeHtml(t.title || `任务${idx + 1}`)}</text>`;
      svg += `<rect x="${sx}" y="${y}" width="${w}" height="18" rx="4" fill="${barColor}" />`;
      svg += `<rect x="${sx}" y="${y}" width="${progressW}" height="18" rx="4" fill="#146c94" />`;

      if (t.actualDoneDate) {
        const done = toDate(t.actualDoneDate);
        const dx = leftCol + Math.round((atStartOfDay(done) - start) / 86400000) * dayUnitW;
        svg += `<line x1="${dx}" y1="${y - 2}" x2="${dx}" y2="${y + 20}" stroke="#157f1f" stroke-width="2" />`;
      }
    });

    svg += "</svg>";
    dom.ganttContainer.innerHTML = svg;
    return;
  }

  const start = atStartOfDay(rawStart);
  const end = atStartOfDay(rawEnd);
  const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
  const unitW = timelineWidth / totalDays;
  const width = Math.ceil(leftCol + timelineWidth + 24);
  const lineStep = Math.max(1, Math.ceil(4 / Math.max(unitW, 0.1)));
  const labelStep = Math.max(1, Math.ceil(46 / Math.max(unitW, 0.1)));
  const minLabelGap = Math.max(46, Math.ceil(8 / Math.max(unitW, 0.1)) * unitW);
  const showDayLabel = unitW >= 12;
  let lastLabelX = -Infinity;

  svg = `<svg class="gantt-svg" width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${h}" fill="#fbfdff"/>`;

  for (let i = 0; i <= totalDays; i++) {
    const dt = new Date(start.getTime() + i * 86400000);
    const x = leftCol + i * unitW;
    const isYearBoundary = dt.getMonth() === 0 && dt.getDate() === 1;
    const isMonthBoundary = dt.getDate() === 1;
    const isMajorDayTick = i % lineStep === 0;
    if (isYearBoundary || isMonthBoundary || isMajorDayTick) {
      svg += `<line x1="${x}" y1="30" x2="${x}" y2="${h}" stroke="${isYearBoundary ? "#8aa5c7" : "#edf1f7"}" stroke-width="${isYearBoundary ? 2 : 1}" />`;
    }

    if (isYearBoundary) {
      if (x - lastLabelX >= minLabelGap) {
        svg += `<text x="${x + 2}" y="16">${dt.getFullYear()}年</text>`;
        lastLabelX = x;
      }
    } else if (isMonthBoundary) {
      if (x - lastLabelX >= minLabelGap) {
        svg += `<text x="${x + 2}" y="16">${String(dt.getMonth() + 1).padStart(2, "0")}月</text>`;
        lastLabelX = x;
      }
    } else if (showDayLabel && labelStep <= 16 && i % labelStep === 0) {
      if (x - lastLabelX >= minLabelGap) {
        svg += `<text x="${x + 2}" y="16">${dateToInput(dt).slice(5)}</text>`;
        lastLabelX = x;
      }
    }
  }

  tasks.forEach((t, idx) => {
    const y = 40 + idx * rowH;
    const s = toDate(t.expectedStartDate);
    const e = toDate(t.expectedEndDate);
    const sx = leftCol + Math.round((atStartOfDay(s) - start) / 86400000) * unitW;
    const ex = leftCol + (Math.round((atStartOfDay(e) - start) / 86400000) + 1) * unitW;
    const w = Math.max(16, ex - sx);
    const progress = Math.max(0, Math.min(100, Number(t.progress || 0)));
    const progressW = Math.round((w * progress) / 100);
    const barColor = isDelayed(t) ? "#fca5a5" : "#8cc7de";

    svg += `<text x="8" y="${y + 14}">${escapeHtml(t.title || `任务${idx + 1}`)}</text>`;
    svg += `<rect x="${sx}" y="${y}" width="${w}" height="18" rx="4" fill="${barColor}" />`;
    svg += `<rect x="${sx}" y="${y}" width="${progressW}" height="18" rx="4" fill="#146c94" />`;

    if (t.actualDoneDate) {
      const done = toDate(t.actualDoneDate);
      const dx = leftCol + Math.round((atStartOfDay(done) - start) / 86400000) * unitW;
      svg += `<line x1="${dx}" y1="${y - 2}" x2="${dx}" y2="${y + 20}" stroke="#157f1f" stroke-width="2" />`;
    }
  });

  svg += "</svg>";
  dom.ganttContainer.innerHTML = svg;
}

function renderActiveProject() {
  const project = getActiveProject();
  if (!project) {
    dom.emptyState.classList.remove("hidden");
    dom.projectContent.classList.add("hidden");
    return;
  }

  dom.emptyState.classList.add("hidden");
  dom.projectContent.classList.remove("hidden");

  bindProjectFields(project);
  renderTaskTable(project);
  const overallPlan = calcOverallPlannedProgress(project.tasks);
  dom.overallPlanProgress.textContent = `${overallPlan}%`;
  const overall = calcOverallProgress(project.tasks);
  dom.overallProgress.textContent = `${overall}%`;
  renderGantt(project);
}

function renderAll() {
  setBackendStatus();
  renderSummaryFilterOptions();
  renderSummaryBoard();
  renderProjectList();
  renderActiveProject();
}

function addTask(project) {
  project.tasks.push({
    id: uid(),
    title: "",
    desc: "",
    mainNode: NODE_OPTIONS[0],
    expectedStartDate: "",
    expectedEndDate: "",
    cycleDays: "",
    progress: 0,
    actualDoneDate: "",
    deliverable: "",
    createdAt: new Date().toISOString(),
  });
  project.updatedAt = new Date().toISOString();
  upsertSnapshot(project);
  persist();
  renderAll();
}

function addProject() {
  const p = createEmptyProject();
  state.projects.push(p);
  state.activeProjectId = p.id;
  upsertSnapshot(p);
  persist();
  renderAll();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gantt-tool-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      if (!Array.isArray(parsed.projects)) {
        throw new Error("无效的导入文件");
      }
      state.projects = parsed.projects;
      state.activeProjectId = parsed.activeProjectId || parsed.projects[0]?.id || null;
      persist();
      renderAll();
      alert("导入成功");
    } catch (err) {
      console.error(err);
      alert("导入失败：文件格式不正确");
    }
  };
  reader.readAsText(file, "utf-8");
}

function importTextAndExtract(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result || "").trim();
      if (!text) {
        alert("导入失败：文本内容为空");
        return;
      }

      if (!getActiveProject()) {
        addProject();
      }
      const project = getActiveProject();
      if (!project) {
        alert("导入失败：无法创建项目");
        return;
      }

      extractFromText(project, text);
      upsertSnapshot(project);
      persist();
      renderAll();
      alert("文本导入并提取成功");
    } catch (err) {
      console.error(err);
      alert("导入失败：文本解析异常");
    }
  };
  reader.readAsText(file, "utf-8");
}

function handleImportFile(file) {
  const lowerName = String(file?.name || "").toLowerCase();
  const isJson = lowerName.endsWith(".json") || String(file?.type || "").includes("json");
  const isText = lowerName.endsWith(".txt") || String(file?.type || "").startsWith("text/");

  if (isJson) {
    importData(file);
    return;
  }
  if (isText) {
    importTextAndExtract(file);
    return;
  }
  alert("仅支持导入 .json 或 .txt 文件");
}

function bindEvents() {
  dom.btnNewProject.addEventListener("click", addProject);
  dom.btnAddTask.addEventListener("click", () => {
    const p = getActiveProject();
    if (!p) return;
    addTask(p);
  });

  dom.btnExport.addEventListener("click", exportData);

  dom.fileImport.addEventListener("change", (evt) => {
    const file = evt.target.files?.[0];
    if (file) handleImportFile(file);
    evt.target.value = "";
  });

  dom.ganttMonthFilter.addEventListener("change", () => {
    const p = getActiveProject();
    if (!p) return;
    renderGantt(p);
  });

  dom.ganttScale.addEventListener("change", () => {
    const p = getActiveProject();
    if (!p) return;
    renderGanttToolbarState();
    renderGantt(p);
  });

  dom.summaryMonthFilter.addEventListener("change", () => {
    state.summaryFilters.month = dom.summaryMonthFilter.value || "";
    renderAll();
  });

  dom.summaryDeptFilter.addEventListener("change", () => {
    state.summaryFilters.dept = dom.summaryDeptFilter.value || "";
    renderAll();
  });

  dom.summaryOwnerFilter.addEventListener("change", () => {
    state.summaryFilters.owner = dom.summaryOwnerFilter.value || "";
    renderAll();
  });

  dom.btnSummaryReset.addEventListener("click", () => {
    state.summaryFilters.month = "";
    state.summaryFilters.dept = "";
    state.summaryFilters.owner = "";
    renderAll();
  });

  dom.btnSummaryToggle.addEventListener("click", () => {
    setSummaryCollapsed(!runtime.summaryCollapsed);
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      const p = getActiveProject();
      if (p) renderGantt(p);
    }, 120);
  });
}

async function initApp() {
  initSidebarResize();
  initSummaryBoardCollapse();
  initSummarySplitRatio();
  initSummaryGridResize();
  loadFromLocal();
  await loadFromApiIfAvailable();
  bindEvents();
  if (!state.projects.length) {
    addProject();
  } else {
    renderAll();
  }
}

initApp();
