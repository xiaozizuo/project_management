const STORAGE_KEY = "gantt_tool_data_v1";

const NODE_OPTIONS = ["计划", "立项", "采购", "实施", "上线试运行", "验收"];

const dom = {
  projectList: document.getElementById("projectList"),
  emptyState: document.getElementById("emptyState"),
  projectContent: document.getElementById("projectContent"),
  textInput: document.getElementById("textInput"),
  btnExtract: document.getElementById("btnExtract"),
  btnNewProject: document.getElementById("btnNewProject"),
  btnAddTask: document.getElementById("btnAddTask"),
  btnExport: document.getElementById("btnExport"),
  fileImport: document.getElementById("fileImport"),
  taskTableBody: document.getElementById("taskTableBody"),
  overallProgress: document.getElementById("overallProgress"),
  ganttContainer: document.getElementById("ganttContainer"),
  ganttScale: document.getElementById("ganttScale"),
  ganttMonthFilter: document.getElementById("ganttMonthFilter"),
  fields: {
    projectCode: document.getElementById("projectCode"),
    projectName: document.getElementById("projectName"),
    projectMeasure: document.getElementById("projectMeasure"),
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
};

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.projects)) {
      state.projects = parsed.projects;
      state.activeProjectId = parsed.activeProjectId || parsed.projects[0]?.id || null;
    }
  } catch (err) {
    console.error("load failed", err);
  }
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      projects: state.projects,
      activeProjectId: state.activeProjectId,
    }),
  );
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
    input.value = project[key] || "";
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
  project.projectMeasure = pick(project.projectMeasure, parseSimpleField(text, ["工作措施", "工作内容"]));
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
  let svg = "";

  if (scale === "year") {
    const start = atStartOfDay(new Date(rawStart.getFullYear(), 0, 1));
    const end = atStartOfDay(new Date(rawEnd.getFullYear(), 11, 31));
    const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const totalMonths = monthIndexBetween(startMonth, endMonth) + 1;
    const totalDays = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
    const monthUnitW = 36;
    const dayUnitW = (totalMonths * monthUnitW) / totalDays;
    const width = Math.max(900, Math.ceil(totalDays * dayUnitW) + leftCol + 40);

    svg = `<svg class="gantt-svg" width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect x="0" y="0" width="${width}" height="${h}" fill="#fbfdff"/>`;

    for (let i = 0; i <= totalMonths; i++) {
      const dt = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      const x = leftCol + Math.round((atStartOfDay(dt) - start) / 86400000) * dayUnitW;
      const isYearBoundary = dt.getMonth() === 0;
      svg += `<line x1="${x}" y1="30" x2="${x}" y2="${h}" stroke="${isYearBoundary ? "#8aa5c7" : "#edf1f7"}" stroke-width="${isYearBoundary ? 2 : 1}" />`;

      if (isYearBoundary) {
        svg += `<text x="${x + 2}" y="16">${dt.getFullYear()}年</text>`;
      } else if (dt.getMonth() % 3 === 0) {
        svg += `<text x="${x + 2}" y="16">${String(dt.getMonth() + 1).padStart(2, "0")}月</text>`;
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
  const unitW = 22;
  const width = Math.max(900, totalDays * unitW + 280);

  svg = `<svg class="gantt-svg" width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${width}" height="${h}" fill="#fbfdff"/>`;

  for (let i = 0; i <= totalDays; i++) {
    const dt = new Date(start.getTime() + i * 86400000);
    const x = leftCol + i * unitW;
    const isYearBoundary = dt.getMonth() === 0 && dt.getDate() === 1;
    svg += `<line x1="${x}" y1="30" x2="${x}" y2="${h}" stroke="${isYearBoundary ? "#8aa5c7" : "#edf1f7"}" stroke-width="${isYearBoundary ? 2 : 1}" />`;
    if (isYearBoundary) {
      svg += `<text x="${x + 2}" y="16">${dt.getFullYear()}年</text>`;
    } else if (i % 5 === 0) {
      svg += `<text x="${x + 2}" y="16">${dateToInput(dt).slice(5)}</text>`;
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
  const overall = calcOverallProgress(project.tasks);
  dom.overallProgress.textContent = `${overall}%`;
  renderGantt(project);
}

function renderAll() {
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

function bindEvents() {
  dom.btnNewProject.addEventListener("click", addProject);
  dom.btnAddTask.addEventListener("click", () => {
    const p = getActiveProject();
    if (!p) return;
    addTask(p);
  });

  dom.btnExtract.addEventListener("click", () => {
    const p = getActiveProject();
    if (!p) return;
    const text = dom.textInput.value.trim();
    if (!text) {
      alert("请先粘贴文本");
      return;
    }
    extractFromText(p, text);
    upsertSnapshot(p);
    persist();
    renderAll();
  });

  dom.btnExport.addEventListener("click", exportData);

  dom.fileImport.addEventListener("change", (evt) => {
    const file = evt.target.files?.[0];
    if (file) importData(file);
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
}

load();
bindEvents();
if (!state.projects.length) {
  addProject();
} else {
  renderAll();
}
