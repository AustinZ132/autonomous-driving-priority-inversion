const TICKS = 12;
const TICK_MS = 520;

const taskMeta = {
  H: { name: "AEB", priority: 1, className: "h" },
  M: { name: "Infotainment", priority: 2, className: "m" },
  L: { name: "Logging", priority: 3, className: "l" },
};

const controls = {
  piToggle: document.querySelector("#piToggle"),
  taskMToggle: document.querySelector("#taskMToggle"),
  lWork: document.querySelector("#lWork"),
  hArrival: document.querySelector("#hArrival"),
  mArrival: document.querySelector("#mArrival"),
  mBurst: document.querySelector("#mBurst"),
  hDeadline: document.querySelector("#hDeadline"),
};

const outputs = {
  lWork: document.querySelector("#lWorkValue"),
  hArrival: document.querySelector("#hArrivalValue"),
  mArrival: document.querySelector("#mArrivalValue"),
  mBurst: document.querySelector("#mBurstValue"),
  hDeadline: document.querySelector("#hDeadlineValue"),
};

const elements = {
  runButton: document.querySelector("#runButton"),
  stepButton: document.querySelector("#stepButton"),
  resetButton: document.querySelector("#resetButton"),
  segments: Array.from(document.querySelectorAll("[data-preset]")),
  deadlineMetric: document.querySelector("#deadlineMetric"),
  waitMetric: document.querySelector("#waitMetric"),
  lockMetric: document.querySelector("#lockMetric"),
  runState: document.querySelector("#runState"),
  schedulerCanvas: document.querySelector("#schedulerCanvas"),
  readyQueue: document.querySelector("#readyQueue"),
  blockedQueue: document.querySelector("#blockedQueue"),
  cpuCore: document.querySelector("#cpuCore"),
  cpuTask: document.querySelector("#cpuTask"),
  cpuCaption: document.querySelector("#cpuCaption"),
  lockCard: document.querySelector("#lockCard"),
  lockOwner: document.querySelector("#lockOwner"),
  nodeH: document.querySelector("#nodeH"),
  nodeM: document.querySelector("#nodeM"),
  nodeL: document.querySelector("#nodeL"),
  timelineGrid: document.querySelector("#timelineGrid"),
  timelineSummary: document.querySelector("#timelineSummary"),
  outcomeCard: document.querySelector("#outcomeCard"),
  outcomeTitle: document.querySelector("#outcomeTitle"),
  outcomeText: document.querySelector("#outcomeText"),
  hStartMetric: document.querySelector("#hStartMetric"),
  hBlockedMetric: document.querySelector("#hBlockedMetric"),
  releaseMetric: document.querySelector("#releaseMetric"),
  inversionMetric: document.querySelector("#inversionMetric"),
  comparisonGrid: document.querySelector("#comparisonGrid"),
  eventLog: document.querySelector("#eventLog"),
};

let currentTick = 0;
let timer = null;
let activePreset = "inversion";
let latestResult = null;

function readSettings() {
  return {
    priorityInheritance: controls.piToggle.checked,
    taskMEnabled: controls.taskMToggle.checked,
    lWork: Number(controls.lWork.value),
    hArrival: Number(controls.hArrival.value),
    mArrival: Number(controls.mArrival.value),
    mBurst: Number(controls.mBurst.value),
    hDeadline: Number(controls.hDeadline.value),
  };
}

function writeSettings(settings) {
  controls.piToggle.checked = settings.priorityInheritance;
  controls.taskMToggle.checked = settings.taskMEnabled;
  controls.lWork.value = String(settings.lWork);
  controls.hArrival.value = String(settings.hArrival);
  controls.mArrival.value = String(settings.mArrival);
  controls.mBurst.value = String(settings.mBurst);
  controls.hDeadline.value = String(settings.hDeadline);
  syncOutputLabels();
}

function syncOutputLabels() {
  outputs.lWork.value = controls.lWork.value;
  outputs.hArrival.value = controls.hArrival.value;
  outputs.mArrival.value = controls.mArrival.value;
  outputs.mBurst.value = controls.mBurst.value;
  outputs.hDeadline.value = controls.hDeadline.value;
}

function getPresetSettings(preset) {
  const base = {
    priorityInheritance: false,
    taskMEnabled: true,
    lWork: 4,
    hArrival: 2,
    mArrival: 3,
    mBurst: 5,
    hDeadline: 6,
  };

  if (preset === "inheritance") {
    return { ...base, priorityInheritance: true };
  }

  if (preset === "baseline") {
    return { ...base, taskMEnabled: false, priorityInheritance: false };
  }

  return base;
}

function simulate(settings) {
  const tasks = {
    L: {
      arrived: true,
      remaining: settings.lWork,
      done: false,
      blocked: false,
      basePriority: 3,
    },
    M: {
      arrived: false,
      remaining: settings.taskMEnabled ? settings.mBurst : 0,
      done: !settings.taskMEnabled,
      blocked: false,
      basePriority: 2,
    },
    H: {
      arrived: false,
      remaining: 1,
      done: false,
      blocked: false,
      basePriority: 1,
    },
  };

  let lockOwner = "L";
  let boostLogged = false;
  let hBlockedStart = null;
  let hBlockedEnd = null;
  let hStart = null;
  let hComplete = null;
  let releaseTime = null;
  let inversionTicks = 0;

  const ticks = [];
  const events = [
    {
      time: 0,
      text: "L starts first and acquires Lock S to write LiDAR data into the log.",
      kind: "lock",
    },
  ];

  for (let time = 0; time < TICKS; time += 1) {
    if (time === settings.hArrival) {
      tasks.H.arrived = true;
      events.push({
        time,
        text: "Collision risk is detected. H becomes ready and immediately requests Lock S.",
        kind: "arrival",
      });

      if (lockOwner && lockOwner !== "H") {
        tasks.H.blocked = true;
        hBlockedStart = time;
        events.push({
          time,
          text: "H is moved to the blocked queue because Lock S is still held by L.",
          kind: "blocked",
        });
      }
    }

    if (settings.taskMEnabled && time === settings.mArrival) {
      tasks.M.arrived = true;
      events.push({
        time,
        text: "M becomes ready. It does not need Lock S, but it can still compete for the CPU.",
        kind: "arrival",
      });
    }

    const piActive =
      settings.priorityInheritance &&
      tasks.H.blocked &&
      lockOwner === "L" &&
      !tasks.L.done;

    if (piActive && !boostLogged) {
      boostLogged = true;
      events.push({
        time,
        text: "Priority inheritance is triggered. L inherits H's effective priority while holding Lock S.",
        kind: "boost",
      });
    }

    const ready = getReadyTasks(tasks, piActive);
    const running = ready.length > 0 ? ready[0].id : null;
    const statuses = getTaskStatuses(tasks, running, settings.taskMEnabled);
    const blockedQueue = tasks.H.blocked ? ["H"] : [];
    const readyQueue = ready.map((task) => task.id);
    const displayLockOwner = running === "H" ? "H" : lockOwner || "Free";

    if (tasks.H.blocked && running === "M" && lockOwner === "L") {
      inversionTicks += 1;
    }

    ticks.push({
      time,
      running,
      readyQueue,
      blockedQueue,
      lockOwner: displayLockOwner,
      piActive,
      statuses,
      releaseEvent: false,
    });

    if (running === "L") {
      tasks.L.remaining -= 1;
      if (tasks.L.remaining <= 0) {
        tasks.L.done = true;
        lockOwner = null;
        releaseTime = time + 1;
        ticks[ticks.length - 1].releaseEvent = true;
        events.push({
          time: time + 1,
          text: "L releases Lock S. H can leave the blocked queue on the next scheduling decision.",
          kind: "release",
        });

        if (tasks.H.blocked) {
          tasks.H.blocked = false;
          hBlockedEnd = time + 1;
          events.push({
            time: time + 1,
            text: "H returns to the ready queue with the highest priority.",
            kind: "ready",
          });
        }
      }
    }

    if (running === "M") {
      tasks.M.remaining -= 1;
      if (tasks.M.remaining <= 0) {
        tasks.M.done = true;
        events.push({
          time: time + 1,
          text: "M finishes its CPU burst.",
          kind: "done",
        });
      }
    }

    if (running === "H") {
      hStart = hStart ?? time;
      tasks.H.remaining -= 1;
      if (tasks.H.remaining <= 0) {
        tasks.H.done = true;
        hComplete = time + 1;
        events.push({
          time: time + 1,
          text: "H completes the braking decision and releases Lock S.",
          kind: "done",
        });
      }
    }
  }

  const blockedDuration =
    hBlockedStart === null ? 0 : (hBlockedEnd ?? TICKS) - hBlockedStart;
  const deadlineMet = hStart !== null && hStart <= settings.hDeadline;

  events.push({
    time: hStart ?? TICKS,
    text: deadlineMet
      ? `Deadline met. H starts at t=${hStart}, before or at t=${settings.hDeadline}.`
      : `Deadline missed. H does not start before t=${settings.hDeadline}.`,
    kind: deadlineMet ? "met" : "missed",
  });

  events.sort((a, b) => a.time - b.time);

  return {
    settings,
    ticks,
    events,
    hStart,
    hComplete,
    releaseTime,
    blockedDuration,
    inversionTicks,
    deadlineMet,
  };
}

function getReadyTasks(tasks, piActive) {
  const ready = [];

  if (tasks.H.arrived && !tasks.H.done && !tasks.H.blocked && tasks.H.remaining > 0) {
    ready.push({ id: "H", priority: tasks.H.basePriority });
  }

  if (tasks.M.arrived && !tasks.M.done && !tasks.M.blocked && tasks.M.remaining > 0) {
    ready.push({ id: "M", priority: tasks.M.basePriority });
  }

  if (tasks.L.arrived && !tasks.L.done && !tasks.L.blocked && tasks.L.remaining > 0) {
    ready.push({ id: "L", priority: piActive ? 1 : tasks.L.basePriority });
  }

  const tieBreak = { H: 0, L: 1, M: 2 };
  return ready.sort((a, b) => a.priority - b.priority || tieBreak[a.id] - tieBreak[b.id]);
}

function getTaskStatuses(tasks, running, taskMEnabled) {
  return {
    H: getStatus(tasks.H, running === "H", true),
    M: taskMEnabled ? getStatus(tasks.M, running === "M", true) : "off",
    L: getStatus(tasks.L, running === "L", true),
  };
}

function getStatus(task, isRunning) {
  if (isRunning) return "running";
  if (!task.arrived) return "pending";
  if (task.blocked) return "blocked";
  if (task.done) return "done";
  return "ready";
}

function render() {
  latestResult = simulate(readSettings());
  currentTick = clamp(currentTick, 0, TICKS - 1);
  renderAt(currentTick);
}

function renderAt(tickIndex) {
  const result = latestResult ?? simulate(readSettings());
  const tick = result.ticks[tickIndex] ?? result.ticks[0];

  renderLiveMetrics(result, tick, tickIndex);
  renderStage(result, tick, tickIndex);
  renderTimeline(result, tickIndex);
  renderAnalysis(result, tickIndex);
  renderComparison(result.settings);
  renderEventLog(result, tickIndex);
}

function renderLiveMetrics(result, tick, tickIndex) {
  const settings = result.settings;
  const visibleWait =
    result.hStart !== null && tickIndex >= result.hStart
      ? result.blockedDuration
      : Math.max(0, Math.min(tickIndex + 1, settings.hDeadline + 1) - settings.hArrival);

  elements.deadlineMetric.textContent = `t=${settings.hDeadline}`;
  elements.waitMetric.textContent = `${Math.min(visibleWait, result.blockedDuration)} ticks`;
  elements.lockMetric.textContent = tick.lockOwner;
  elements.runState.textContent = `t=${tick.time}`;
}

function renderStage(result, tick) {
  const running = tick.running;
  const blocked = tick.statuses.H === "blocked";
  const released = tick.releaseEvent;

  elements.schedulerCanvas.classList.toggle("is-blocked", blocked);
  elements.schedulerCanvas.classList.toggle("is-running", Boolean(running));
  elements.schedulerCanvas.classList.toggle("is-released", released);

  elements.readyQueue.innerHTML = tick.readyQueue.length
    ? tick.readyQueue.map((id) => queueChip(id)).join("")
    : `<span class="queue-chip">Empty</span>`;

  elements.blockedQueue.innerHTML = tick.blockedQueue.length
    ? tick.blockedQueue.map((id) => queueChip(id)).join("")
    : `<span class="queue-chip">Empty</span>`;

  elements.cpuTask.textContent = running ? `${running}: ${taskMeta[running].name}` : "Idle";
  elements.cpuCaption.textContent = getCpuCaption(result, tick);
  elements.cpuCore.classList.toggle("is-active", Boolean(running));

  elements.lockOwner.textContent = tick.lockOwner;
  elements.lockCard.classList.toggle("is-held", tick.lockOwner !== "Free");
  elements.lockCard.classList.toggle("is-free", tick.lockOwner === "Free");

  updateNode(elements.nodeH, "H", tick.statuses.H, running, tick.piActive);
  updateNode(elements.nodeM, "M", tick.statuses.M, running, tick.piActive);
  updateNode(elements.nodeL, "L", tick.statuses.L, running, tick.piActive);
}

function queueChip(id) {
  const meta = taskMeta[id];
  return `<span class="queue-chip ${meta.className}">${id}</span>`;
}

function updateNode(node, id, status, running, piActive) {
  node.classList.remove("is-running", "is-blocked", "is-boosted", "is-h", "is-m", "is-l");
  node.classList.add(`is-${taskMeta[id].className}`);
  node.classList.toggle("is-running", running === id);
  node.classList.toggle("is-blocked", status === "blocked");
  node.classList.toggle("is-boosted", id === "L" && piActive);
}

function getCpuCaption(result, tick) {
  if (!tick.running) return "No ready task";
  if (tick.running === "H") return "AEB executes after the mutex becomes available";
  if (tick.running === "L" && tick.piActive) return "L runs with H's effective priority";
  if (tick.running === "L") return "L is inside the critical section";
  if (tick.running === "M" && tick.statuses.H === "blocked") return "M preempts the lock holder";
  if (tick.running === "M") return "M consumes a normal CPU burst";
  return "Scheduler selected the highest ready task";
}

function renderTimeline(result, tickIndex) {
  const rows = [
    {
      label: "CPU",
      getValue: (tick) => tick.running ?? "Idle",
      getClass: (tick) => (tick.running ? `cell-running-${taskMeta[tick.running].className}` : "cell-idle"),
    },
    {
      label: "Lock S",
      getValue: (tick) => tick.lockOwner,
      getClass: (tick) => (tick.lockOwner === "Free" ? "cell-free" : "cell-lock-held"),
    },
    {
      label: "H",
      getValue: (tick) => formatStatus(tick.statuses.H),
      getClass: (tick) => statusClass("h", tick.statuses.H),
    },
    {
      label: "M",
      getValue: (tick) => formatStatus(tick.statuses.M),
      getClass: (tick) => statusClass("m", tick.statuses.M),
    },
    {
      label: "L",
      getValue: (tick) => formatStatus(tick.statuses.L, tick.piActive),
      getClass: (tick) => statusClass("l", tick.statuses.L),
    },
  ];

  const cells = [];
  elements.timelineGrid.style.setProperty("--ticks", TICKS);
  cells.push(`<div class="timeline-cell timeline-label" role="columnheader">Time</div>`);

  for (let time = 0; time < TICKS; time += 1) {
    cells.push(
      `<div class="timeline-cell timeline-time ${time > tickIndex ? "future" : ""} ${
        time === result.settings.hDeadline ? "deadline" : ""
      } ${time === tickIndex ? "current" : ""}" role="columnheader">t${time}</div>`,
    );
  }

  rows.forEach((row) => {
    cells.push(`<div class="timeline-cell timeline-label" role="rowheader">${row.label}</div>`);
    result.ticks.forEach((tick, index) => {
      const classes = [
        row.getClass(tick),
        index > tickIndex ? "future" : "",
        index === result.settings.hDeadline ? "deadline" : "",
        index === tickIndex ? "current" : "",
      ]
        .filter(Boolean)
        .join(" ");

      cells.push(
        `<div class="timeline-cell ${classes}" role="cell" title="${row.label} at t${index}: ${row.getValue(
          tick,
        )}">${row.getValue(tick)}</div>`,
      );
    });
  });

  elements.timelineGrid.innerHTML = cells.join("");
  elements.timelineSummary.textContent = result.deadlineMet
    ? `H starts at t=${result.hStart}; the deadline at t=${result.settings.hDeadline} is met.`
    : `H misses the deadline at t=${result.settings.hDeadline}.`;
}

function formatStatus(status, piActive = false) {
  if (status === "running" && piActive) return "Boost";
  if (status === "running") return "Run";
  if (status === "blocked") return "Block";
  if (status === "ready") return "Ready";
  if (status === "pending") return "Wait";
  if (status === "off") return "Off";
  return "Done";
}

function statusClass(taskClass, status) {
  if (status === "blocked") return "cell-state-blocked";
  if (status === "running") return `cell-state-${taskClass}-running`;
  if (status === "ready") return "cell-state-ready";
  if (status === "pending") return "cell-state-pending";
  return "cell-state-done";
}

function renderAnalysis(result) {
  elements.outcomeCard.classList.toggle("is-met", result.deadlineMet);
  elements.outcomeCard.classList.toggle("is-missed", !result.deadlineMet && result.hStart !== null);
  elements.outcomeTitle.textContent = result.deadlineMet ? "Deadline met" : "Deadline missed";
  elements.outcomeText.textContent = result.deadlineMet
    ? "The wait is bounded because L releases Lock S before H misses the real-time deadline."
    : "H stays blocked too long because the lock holder cannot get enough CPU time to release Lock S.";

  elements.hStartMetric.textContent = formatTime(result.hStart);
  elements.hBlockedMetric.textContent = `${result.blockedDuration} ticks`;
  elements.releaseMetric.textContent = formatTime(result.releaseTime);
  elements.inversionMetric.textContent = `${result.inversionTicks} ticks`;
}

function renderComparison(settings) {
  const withoutPi = simulate({ ...settings, priorityInheritance: false });
  const withPi = simulate({ ...settings, priorityInheritance: true });
  const cases = [
    ["Without PI", withoutPi],
    ["With PI", withPi],
  ];

  elements.comparisonGrid.innerHTML = cases
    .map(([label, result]) => {
      const status = result.deadlineMet ? "Met" : "Missed";
      return `
        <div class="comparison-item ${result.deadlineMet ? "is-met" : "is-missed"}">
          <strong>${label}</strong>
          <dl>
            <div><dt>Deadline</dt><dd>${status}</dd></div>
            <div><dt>H start</dt><dd>${formatTime(result.hStart)}</dd></div>
            <div><dt>H blocked</dt><dd>${result.blockedDuration}</dd></div>
            <div><dt>L release</dt><dd>${formatTime(result.releaseTime)}</dd></div>
          </dl>
        </div>
      `;
    })
    .join("");
}

function renderEventLog(result, tickIndex) {
  const visibleEvents = result.events.filter((event) => event.time <= tickIndex + 1);
  elements.eventLog.innerHTML = visibleEvents
    .map(
      (event) => `
        <li>
          <time>t=${event.time}</time>
          <span>${event.text}</span>
        </li>
      `,
    )
    .join("");
}

function setPreset(preset) {
  activePreset = preset;
  writeSettings(getPresetSettings(preset));
  elements.segments.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === preset);
  });
  stopTimer();
  currentTick = 0;
  render();
}

function markCustomPreset() {
  elements.segments.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === activePreset);
  });
}

function runPlayback() {
  stopTimer();
  currentTick = 0;
  render();
  elements.runButton.disabled = true;
  timer = window.setInterval(() => {
    if (currentTick >= TICKS - 1) {
      stopTimer();
      return;
    }
    currentTick += 1;
    renderAt(currentTick);
  }, TICK_MS);
}

function stepPlayback() {
  stopTimer();
  currentTick = currentTick >= TICKS - 1 ? 0 : currentTick + 1;
  renderAt(currentTick);
}

function resetPlayback() {
  stopTimer();
  currentTick = 0;
  render();
}

function stopTimer() {
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
  elements.runButton.disabled = false;
}

function formatTime(value) {
  return value === null || value === undefined ? "--" : `t=${value}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

Object.values(controls).forEach((control) => {
  control.addEventListener("input", () => {
    syncOutputLabels();
    markCustomPreset();
    stopTimer();
    currentTick = 0;
    render();
  });
});

elements.segments.forEach((button) => {
  button.addEventListener("click", () => setPreset(button.dataset.preset));
});

elements.runButton.addEventListener("click", runPlayback);
elements.stepButton.addEventListener("click", stepPlayback);
elements.resetButton.addEventListener("click", () => setPreset(activePreset));

syncOutputLabels();
setPreset("inversion");
