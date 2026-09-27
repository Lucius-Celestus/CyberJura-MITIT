const state = { user: null, challenges: [] };

const appEl = document.getElementById("app");
const topbarEl = document.getElementById("topbar");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

// Пофікшено зависання зеленого ефекту: очищення класу .on за таймером
function flashSuccess() {
  const f = document.getElementById("flash-overlay");
  if (!f) return;
  f.classList.remove("on");
  void f.offsetWidth; // reflow для гарантованого перезапуску CSS-анімації
  f.classList.add("on");
  setTimeout(() => {
    f.classList.remove("on");
  }, 650);
  toast("[+] ACCESS GRANTED");
}

function renderMath(element) {
  const target = element || document.getElementById("app");
  if (!target || typeof renderMathInElement !== "function") return;
  try {
    renderMathInElement(target, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      throwOnError: false,
    });
  } catch (e) {
    console.warn("KaTeX render error:", e);
  }
}

// ---------------------------------------------------------------- ROUTER
function go(hash) {
  window.location.hash = hash;
}

window.addEventListener("hashchange", render);
window.addEventListener("load", init);

// ---------------------------------------------------------------- SYSTEM STATUS & KEYBINDINGS
function initSysStatus() {
  function updateClock() {
    const el = document.getElementById("sys-clock");
    if (!el) return;
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    el.textContent = `TIME: ${h}:${m}:${s}`;
  }
  updateClock();
  setInterval(updateClock, 1000);

  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement ? document.activeElement.tagName : "";
    if (["INPUT", "TEXTAREA"].includes(tag)) {
      if (e.key === "Escape") {
        document.activeElement.blur();
      }
      return;
    }
    if (e.key === "1") {
      go("#/challenges");
    } else if (e.key === "2") {
      go("#/leaderboard");
    } else if (e.key === "3") {
      go("#/chill");
    } else if (e.key === "Escape") {
      const hash = window.location.hash || "";
      if (hash.startsWith("#/challenge/")) {
        go("#/challenges");
      }
    }
  });
}

async function init() {
  initSysStatus();
  initAsciiBackground();
  const { ok, data } = await API.get("/api/auth/me");
  if (ok) {
    state.user = data;
    renderTopbar();
    render();
  } else {
    renderAuthScreen();
  }
}

// ---------------------------------------------------------------- TOPBAR
function renderTopbar() {
  if (!state.user) { topbarEl.innerHTML = ""; return; }
  const route = (window.location.hash || "#/challenges").split("/")[1] || "challenges";
  topbarEl.innerHTML = `
    <span class="logo">CTF_PLATFORM // TUI</span>
    <nav>
      <button data-r="challenges" class="${route === "challenges" ? "active" : ""}">[1] ЗАВДАННЯ</button>
      <button data-r="leaderboard" class="${route === "leaderboard" ? "active" : ""}">[2] СКОРБОРД</button>
      <button data-r="chill" class="${route === "chill" ? "active" : ""}">[3] ЯКЩО НЕ ЦІКАВО</button>
    </nav>
    <span class="userbox">
      OPERATOR: <strong>${escapeHtml(state.user.username.toUpperCase())}</strong>${state.user.is_guest ? " [GUEST]" : ""}
      <button id="logout-btn">[ ВИХІД ]</button>
    </span>
  `;
  topbarEl.querySelectorAll("nav button").forEach((b) =>
    b.addEventListener("click", () => go("#/" + b.dataset.r))
  );
  topbarEl.querySelector("#logout-btn").addEventListener("click", async () => {
    await API.post("/api/auth/logout");
    state.user = null;
    topbarEl.innerHTML = "";
    renderAuthScreen();
  });
}

// ---------------------------------------------------------------- AUTH SCREEN
function renderAuthScreen() {
  appEl.innerHTML = `
    <div id="auth-screen">
      <h1>Вхід у систему</h1>
      <div class="subtitle">Автентифікація потрібна для генерації твоїх унікальних прапорців.</div>
      <div class="tabs">
        <button data-mode="login" class="active">Вхід</button>
        <button data-mode="register">Реєстрація</button>
      </div>
      <div id="auth-error"></div>
      <div class="field"><label>Логін</label><input type="text" id="auth-username"></div>
      <div class="field"><label>Пароль</label><input type="password" id="auth-password"></div>
      <button class="primary" id="auth-submit" style="width:100%;">Увійти</button>
      <div style="margin:16px 0;text-align:center;color:var(--fg-dim);font-size:11px;">— або —</div>
      <button class="ghost" id="auth-guest" style="width:100%;">Гостьовий вхід</button>
    </div>
  `;

  let mode = "login";
  const tabs = appEl.querySelectorAll("#auth-screen .tabs button");
  const submitBtn = appEl.querySelector("#auth-submit");
  tabs.forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    tabs.forEach((t) => t.classList.remove("active"));
    b.classList.add("active");
    submitBtn.textContent = mode === "login" ? "[ Увійти ]" : "[ Зареєструватись ]";
  }));

  async function doSubmit() {
    const username = appEl.querySelector("#auth-username").value;
    const password = appEl.querySelector("#auth-password").value;
    const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const { ok, data } = await API.post(url, { username, password });
    const errBox = appEl.querySelector("#auth-error");
    if (!ok) {
      errBox.innerHTML = `<div class="error">${escapeHtml(data?.error || "Помилка")}</div>`;
      return;
    }
    state.user = data;
    renderTopbar();
    go("#/challenges");
    render();
  }

  submitBtn.addEventListener("click", doSubmit);
  appEl.querySelector("#auth-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSubmit();
  });

  appEl.querySelector("#auth-guest").addEventListener("click", async () => {
    const { ok, data } = await API.post("/api/auth/guest");
    if (!ok) return;
    state.user = data;
    renderTopbar();
    go("#/challenges");
    render();
  });
}

// ---------------------------------------------------------------- ROUTE DISPATCH
function render() {
  if (!state.user) return;
  appEl.classList.remove("is-matrix");
  renderTopbar();
  const hash = window.location.hash || "#/challenges";
  const parts = hash.replace("#/", "").split("/");

  if (parts[0] === "challenge" && parts[1]) {
    renderChallengeDetail(parts[1]);
  } else if (parts[0] === "leaderboard") {
    renderLeaderboard();
  } else if (parts[0] === "chill" || parts[0] === "boring") {
    renderChillZone();
  } else {
    renderChallengesList();
  }
}

// ---------------------------------------------------------------- CHALLENGES LIST
async function renderChallengesList() {
  appEl.innerHTML = `<div class="center-msg">:: Завантаження завдань ::</div>`;
  const { data } = await API.get("/api/challenges");
  state.challenges = data.challenges || [];
  appEl.classList.add("is-matrix");

  const categories = [...new Set(state.challenges.map((c) => c.category))];
  let html = `
    <div class="page-head">
      <h1>Challenge Matrix</h1>
      <div class="subtitle">Обери завдання — прогрес та динамічні прапорці зберігаються окремо.</div>
    </div>`;

  categories.forEach((cat) => {
    const list = state.challenges.filter((c) => c.category === cat);
    html += `
      <div class="category-label">
        <span class="cat-name">${escapeHtml(cat)}</span>
        <span class="cat-n">${String(list.length).padStart(2, "0")} TASKS</span>
      </div>
      <div class="chal-grid">`;

    list.forEach((c) => {
      const diff = String(c.difficulty || "").toLowerCase();
      let badgeHtml = "";
      if (c.solved && c.is_unranked) {
        badgeHtml = `<span class="badge unranked">SOLVED · UNRANKED</span>`;
      } else if (c.solved) {
        badgeHtml = `<span class="badge solved">SOLVED</span>`;
      } else if (c.writeup_unlocked) {
        badgeHtml = `<span class="badge unranked">UNRANKED</span>`;
      } else {
        badgeHtml = `<span class="badge dim">${escapeHtml(diff || "task")}</span>`;
      }

      const brief = c.brief || "";
      const short = brief.length > 140 ? brief.slice(0, 140) + "…" : brief;

      html += `
        <article class="chal-card tier-${c.points} pts-${c.points} ${escapeHtml(diff)} ${c.solved ? "solved" : ""}" data-id="${c.id}">
          <div class="top-row">
            ${badgeHtml}
            <span class="pts">${c.points} <span>pts</span></span>
          </div>
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(short)}</p>
          <div class="chal-foot">
            <span>${escapeHtml(diff || "task")}</span>
            <span class="go">ВІДКРИТИ</span>
          </div>
        </article>`;
    });

    html += `</div>`;
  });

  appEl.innerHTML = html;
  appEl.querySelectorAll(".chal-card").forEach((el) =>
    el.addEventListener("click", () => go("#/challenge/" + el.dataset.id))
  );
}

// ---------------------------------------------------------------- CHALLENGE DETAIL
async function renderChallengeDetail(taskId) {
  appEl.innerHTML = `<div class="center-msg">:: ЗАВАНТАЖЕННЯ ДАНИХ ::</div>`;
  const { data: c, ok } = await API.get(`/api/challenges/${taskId}`);
  if (!ok) { appEl.innerHTML = `<div class="center-msg">:: ЗАВДАННЯ НЕ ЗНАЙДЕНО ::</div>`; return; }

  let statusBadge = "";
  if (c.is_unranked) {
    statusBadge = '<span class="badge unranked" style="margin-left:10px;">[ ПОЗА РЕЙТИНГОМ: 0 PTS ]</span>';
  } else if (c.solved) {
    statusBadge = '<span class="badge solved" style="margin-left:10px;">[ SOLVED ]</span>';
  }

  const flagsCount = c.flags_count || 1;
  const flagsLabels = c.flags_labels || [];

  let submitSectionHtml = "";
  if (flagsCount > 1) {
    submitSectionHtml = `
      <div class="card">
        <h2>Submit Flags (${flagsCount})</h2>
        <div style="font-size:12px;color:var(--warn);margin-bottom:12px;line-height:1.5;">
          [!] У цьому завданні <strong>${flagsCount} обов'язкові прапорці</strong>. Обов'язковим є введення кожного з них для зарахування!
        </div>
        <div class="flag-multi-group">
          ${Array.from({ length: flagsCount }, (_, idx) => `
            <div class="flag-multi-item">
              <label>[ ${escapeHtml((flagsLabels[idx] || `Прапорець №${idx + 1}`).toUpperCase())} ]</label>
              <input type="text" class="flag-multi-input" data-index="${idx}" placeholder="FLAG{...}">
            </div>
          `).join("")}
        </div>
        <div style="margin-top:14px;">
          <button id="flag-submit" class="primary">[ ЗДАТИ ВСІ ПРАПОРЦІ ]</button>
        </div>
        <div id="flag-out"></div>
      </div>
    `;
  } else {
    submitSectionHtml = `
      <div class="card">
        <h2>Submit Flag</h2>
        <div class="flag-form">
          <input type="text" id="flag-input" placeholder="FLAG{...}">
          <button id="flag-submit" class="primary">[ ЗДАТИ ПРАПОРЕЦЬ ]</button>
        </div>
        <div id="flag-out"></div>
      </div>
    `;
  }

  appEl.innerHTML = `
    <button class="ghost" id="back-btn">[ESC] &larr; НАЗАД ДО СПИСКУ</button>
    <div style="height:14px;"></div>
    <h1>${escapeHtml(c.title)}</h1>
    <div class="subtitle">${escapeHtml(c.category)} · ${c.points} PTS · ${c.difficulty.toUpperCase()}
      ${statusBadge}
    </div>

    <div class="local-tabs">
      <button data-page="brief" class="active">[ БРИФ ]</button>
      <button data-page="theory">[ ТЕОРІЯ ]</button>
      <button data-page="lab">[ ЛАБОРАТОРІЯ ]</button>
      <button data-page="writeup">[ WRITEUP ${c.writeup_unlocked ? "(ВІДКРИТО)" : ""} ]</button>
    </div>

    <div id="page-brief" class="page active">
      <div class="card">
        <h2>Завдання</h2>
        <p style="line-height:1.7;color:var(--fg-dim);">${escapeHtml(c.brief)}</p>
      </div>
      ${submitSectionHtml}
    </div>

    <div id="page-theory" class="page">
      <div class="card" style="line-height:1.7;">
        ${c.theory}
      </div>
    </div>

    <div id="page-lab" class="page">
      <div class="card">
        <h2>Лабораторний стенд</h2>
        <div id="lab-container"></div>
      </div>
    </div>

    <div id="page-writeup" class="page">
      <div id="writeup-container"></div>
    </div>
  `;

  appEl.querySelector("#back-btn").addEventListener("click", () => go("#/challenges"));

  const tabs = appEl.querySelectorAll(".local-tabs button");
  tabs.forEach((btn) => btn.addEventListener("click", () => {
    tabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    appEl.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + btn.dataset.page));
    renderMath(appEl);
  }));

  // ---- writeup tab logic ----
  const writeupContainer = appEl.querySelector("#writeup-container");
  if (!c.writeup_unlocked) {
    writeupContainer.innerHTML = `
      <div class="writeup-warning">
        <h3>[!] УВАГА: ВІДКРИТТЯ ПОКРОКОВОГО ВРАЙТАПУ (WRITEUP)</h3>
        <p>
          Перегляд авторського розбору розкриває прямий алгоритм розв'язку.
          <strong>Після відкриття це завдання буде виключено з рейтингу в загальному скорборді (0 балів).</strong>
        </p>
        <p style="margin-top:6px;color:#fca5a5;">
          Ви зможете виконати лабораторію та отримати персональний прапорець для навчання, проте воно матиме статус <code>UNRANKED (0 PTS)</code>.
        </p>
        <button id="btn-reveal-writeup" class="danger">Показати Writeup (Зняти завдання з рейтингу)</button>
      </div>
    `;
    writeupContainer.querySelector("#btn-reveal-writeup").addEventListener("click", async () => {
      const confirmed = confirm(
        "Ви дійсно бажаєте відкрити Writeup? Завдання отримає статус UNRANKED і бали за нього НЕ будуть зараховані до скорборду!"
      );
      if (!confirmed) return;

      const { data: res } = await API.post(`/api/challenges/${taskId}/reveal-writeup`);
      if (res.ok) {
        toast("[!] Writeup відкрито. Завдання знято з рейтингу.");
        await renderChallengeDetail(taskId);
        renderMath(appEl);
      }
    });
  } else {
    writeupContainer.innerHTML = `
      <div class="badge unranked" style="margin-bottom:12px;display:inline-block;">[ ВРАЙТАП ВІДКРИТО — ЗАВДАННЯ ПОЗА РЕЙТИНГОМ (0 PTS) ]</div>
      <div class="card" style="line-height:1.8;color:var(--fg-dim);">
        ${c.writeup}
      </div>
    `;
    renderMath(writeupContainer);
  }

  // ---- flag submit ----
  async function submitFlag() {
    const out = appEl.querySelector("#flag-out");
    let payload = { task_id: taskId };

    if (flagsCount > 1) {
      const inputs = appEl.querySelectorAll(".flag-multi-input");
      const flags = Array.from(inputs).map((inp) => inp.value.trim());
      const emptyIdx = flags.findIndex((f) => !f);
      if (emptyIdx !== -1) {
        out.innerHTML = `<div style="color:var(--danger-bright);margin-top:8px;">[X] Обов'язково введіть кожен з ${flagsCount} прапорців! (Поле ${emptyIdx + 1} порожнє)</div>`;
        return;
      }
      payload.flags = flags;
    } else {
      const flag = appEl.querySelector("#flag-input") ? appEl.querySelector("#flag-input").value.trim() : "";
      if (!flag) {
        out.innerHTML = `<div style="color:var(--danger-bright);margin-top:8px;">[X] Введіть прапорець.</div>`;
        return;
      }
      payload.flag = flag;
      payload.flags = [flag];
    }

    const { data } = await API.post("/api/submit-flag", payload);
    if (data.correct) {
      const msg = data.is_unranked
        ? "[+] ACCESS GRANTED (ПОЗА РЕЙТИНГОМ / WRITEUP: +0 pts)"
        : `[+] ACCESS GRANTED — +${data.points} pts`;
      out.innerHTML = `<div style="color:var(--fg);margin-top:8px;">${msg}</div>`;
      flashSuccess();
    } else {
      out.innerHTML = `<div style="color:var(--danger-bright);margin-top:8px;">${escapeHtml(data.message || "[X] Невірний прапорець.")}</div>`;
    }
  }
  appEl.querySelector("#flag-submit").addEventListener("click", submitFlag);
  appEl.querySelectorAll(".flag-multi-input, #flag-input").forEach((inp) => {
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") submitFlag(); });
  });

  // ---- lab widget mount ----
  const labContainer = appEl.querySelector("#lab-container");

  async function onSolved() {
    const { data, ok: flagOk } = await API.get(`/api/challenges/${taskId}/flag`);
    if (flagOk) {
      if (data.flags && data.flags.length > 1) {
        const inputs = appEl.querySelectorAll(".flag-multi-input");
        data.flags.forEach((f, idx) => {
          if (inputs[idx]) inputs[idx].value = f;
        });
        toast(`[i] Усі ${data.flags.length} прапорці згенеровано та підставлено у форму Submit Flag`);
      } else if (data.flag) {
        const single = appEl.querySelector("#flag-input") || appEl.querySelector(".flag-multi-input");
        if (single) single.value = data.flag;
        toast("[i] Прапорець згенеровано та підставлено у форму Submit Flag");
      }
    }
  }

  if (c.widget === "sql-console") {
    initSqlConsole(labContainer, c.lab, onSolved);
  } else if (c.widget === "packet-viewer") {
    initPacketViewer(labContainer, c.lab, onSolved);
  } else if (c.widget === "ducky-sim") {
    initDuckySim(labContainer, c.lab, onSolved);
  } else if (c.widget === "doc-inspector") {
    initDocInspector(labContainer, c.lab, onSolved);
  } else if (c.widget === "cmd-console") {
    initCmdConsole(labContainer, c.lab, onSolved);
  } else if (c.widget === "uart-sim") {
    initUartSim(labContainer, c.lab, onSolved);
  } else if (c.widget === "crypto-console") {
    initCryptoConsole(labContainer, c.lab, onSolved);
  } else if (c.widget === "email-headers") {
    initEmailHeaders(labContainer, c.lab, onSolved);
  } else if (c.lab === "passwords1" || c.widget === "passwords-lab") {
    initPasswordsLab(labContainer, onSolved);
  } else {
    labContainer.innerHTML = `<div class="center-msg">Для цього завдання лабораторія не потрібна.</div>`;
  }

  renderMath(appEl);
}

// ---------------------------------------------------------------- email-headers widget (phishing-1 & phishing-2)
async function initEmailHeaders(container, labId, onSolved) {
  if (labId === "phishing2") {
    return initPhishingUrls(container, labId, onSolved);
  }

  const { data } = await API.get(`/api/lab/${labId}/email`);
  const options = [
    { id: "spf_fail", label: "SPF = fail (Невідповідність дозволеного IP сервера відправника)" },
    { id: "dkim_fail", label: "DKIM = fail (Невірний або відсутній цифровий RSA-підпис домену)" },
    { id: "reply_to_mismatch", label: "Reply-To не збігається з доменом відправника From" },
    { id: "return_path_mismatch", label: "Return-Path вказує на сторонній спам-домен" },
  ];
  container.innerHTML = `
    <pre style="background:#000;border:1px solid var(--fg-dim);padding:12px;font-size:12px;color:var(--fg-dim);white-space:pre-wrap;">${escapeHtml(data.raw_headers)}</pre>
    <div style="margin-top:14px;">
      <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;">
        Позначте квадратиками [ ] усі виявлені індикатори підробки листа:
      </div>
      ${options.map((o) => `
        <label style="display:flex;align-items:center;gap:10px;text-transform:none;font-size:13px;color:var(--fg);margin-bottom:10px;cursor:pointer;">
          <input type="checkbox" data-flag="${o.id}" style="width:18px;height:18px;cursor:pointer;accent-color:var(--accent,#33ff33);">
          <span>${escapeHtml(o.label)}</span>
        </label>`).join("")}
    </div>
    <div style="margin-top:14px;">
      <button id="email-submit">Перевірити індикатори підробки</button>
    </div>
    <div id="email-out"></div>
    <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
      <strong>Інструкція аудитора:</strong> Знайдений у заголовках <code>X-Security-Audit-Flag</code> прапорець скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
    </div>
  `;
  container.querySelector("#email-submit").addEventListener("click", async () => {
    const picked = [...container.querySelectorAll("input[type=checkbox]:checked")].map((el) => el.dataset.flag);
    const { data: res } = await API.post(`/api/lab/${labId}/answer`, { flags: picked });
    const out = container.querySelector("#email-out");
    out.innerHTML = res.task_solved
      ? `<div style="color:var(--fg);margin-top:8px;">${escapeHtml(res.message || "[OK] Усі ознаки фішингу визначено правильно!")}</div>`
      : `<div style="color:var(--fg-dim);margin-top:8px;">[X] Набір індикаторів неповний або невірний. Перевірте заголовки SPF, DKIM та маршрутизації.</div>`;
    if (res.task_solved) onSolved();
  });
}

async function initPhishingUrls(container, labId, onSolved) {
  const { data } = await API.get(`/api/lab/${labId}/urls`);
  const urls = data.urls || [];
  const pickedIds = new Set();

  function render() {
    container.innerHTML = `
      <div class="card" style="margin-bottom:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструмент: Детектор Punycode та IDN-гомографів</h2>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;">
          Дослідіть перехоплені веб-посилання. Позначте квадратиками [ ] домени, які використовують кириличні гомогліфи (Punycode xn--):
        </div>

        <table class="pv-table" style="margin-bottom:12px;">
          <thead>
            <tr>
              <th style="width:40px;text-align:center;">Фішинг [ ]</th>
              <th>Відображуваний URL</th>
              <th>Punycode трансляція</th>
              <th>IP призначення</th>
              <th>Статус сертифіката</th>
            </tr>
          </thead>
          <tbody>
            ${urls.map((u) => {
              const isChecked = pickedIds.has(u.id);
              return `
                <tr class="pkt-row ${isChecked ? "picked" : ""}" style="cursor:pointer;" data-id="${u.id}">
                  <td style="text-align:center;">
                    <input type="checkbox" class="phish-cb" data-id="${u.id}" ${isChecked ? "checked" : ""} style="width:18px;height:18px;cursor:pointer;accent-color:var(--accent,#33ff33);">
                  </td>
                  <td><code style="color:var(--fg-bright);">${escapeHtml(u.display_url)}</code></td>
                  <td><code>${escapeHtml(u.punycode_url)}</code></td>
                  <td>${escapeHtml(u.ip_resolution)}</td>
                  <td>${escapeHtml(u.ssl_issuer)}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>

        ${[...pickedIds].length > 0 ? `
          <div style="background:#000;border:1px solid var(--fg);padding:10px;margin-bottom:12px;font-size:12px;">
            <div style="color:var(--fg-bright);font-weight:bold;margin-bottom:6px;">Аналіз обраних фішингових доменів:</div>
            ${[...pickedIds].map((id) => {
              const item = urls.find((u) => u.id === id);
              if (!item) return "";
              return `
                <div style="margin-bottom:6px;line-height:1.5;">
                  <strong>${escapeHtml(item.display_url)}:</strong> ${escapeHtml(item.homoglyph_details || item.status)}<br>
                  ${item.c2_token ? `Прапорець виявлення: <code style="color:var(--fg);font-weight:bold;">${escapeHtml(item.c2_token)}</code>` : ""}
                </div>`;
            }).join("")}
          </div>
        ` : ""}

        <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
          <strong>Інструкція аудитора:</strong> Позначте підроблені ресурси з префіксом <code>xn--</code>. Отримані прапорці <code>FLAG{...}</code> для кожного виявленого фішингового домену скопіюйте та введіть у форму здачі на вкладці 'Бриф' (обидва прапорці є обов'язковими!).
        </div>
      </div>
    `;

    container.querySelectorAll(".phish-cb").forEach((cb) => {
      cb.addEventListener("change", async (e) => {
        const id = Number(cb.dataset.id);
        if (cb.checked) pickedIds.add(id); else pickedIds.delete(id);
        render();
        if (pickedIds.has(2) && pickedIds.has(4)) {
          const { data: res } = await API.post(`/api/lab/${labId}/answer`, { malicious_ids: [2, 4] });
          if (res.task_solved && onSolved) onSolved();
        }
      });
    });

    container.querySelectorAll(".pkt-row").forEach((row) => {
      row.addEventListener("click", async (e) => {
        if (e.target.classList.contains("phish-cb")) return;
        const id = Number(row.dataset.id);
        if (pickedIds.has(id)) pickedIds.delete(id); else pickedIds.add(id);
        render();
        if (pickedIds.has(2) && pickedIds.has(4)) {
          const { data: res } = await API.post(`/api/lab/${labId}/answer`, { malicious_ids: [2, 4] });
          if (res.task_solved && onSolved) onSolved();
        }
      });
    });
  }

  render();
}

// ---------------------------------------------------------------- passwords bonus lab
function initPasswordsLab(container, onSolved) {
  container.innerHTML = `
    <label>Придумай стійку парольну фразу (Passphrase)</label>
    <input type="text" id="pw-input" placeholder="напр. correct-horse-battery-staple-2026">
    <div style="margin-top:10px;font-size:13px;">Оцінка стійкості: <strong id="pw-score">—</strong> / 100 (Необхідно &ge; 90)</div>
    <div id="pw-out"></div>
    <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
      <strong>Інструкція аудитора:</strong> Складіть довгу парольну фразу з кількох слів. Після досягнення оцінки &ge; 90 балів скопіюйте виданий прапорець <code>FLAG{...}</code> та здайте його у форму на вкладці 'Бриф'.
    </div>
  `;
  let timer = null;
  container.querySelector("#pw-input").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const { data } = await API.post("/api/lab/passwords1/check", { password: e.target.value });
      container.querySelector("#pw-score").textContent = data.score;
      if (data.task_solved) {
        container.querySelector("#pw-out").innerHTML = `
          <div style="color:var(--fg);margin-top:8px;">${escapeHtml(data.message || "[OK] Пароль достатньо стійкий!")}</div>
        `;
        if (data.flag) {
          appEl.querySelector("#flag-input").value = data.flag;
        }
        onSolved();
      } else {
        container.querySelector("#pw-out").innerHTML = `<div style="color:var(--fg-dim);margin-top:8px;">[i] Спробуйте додати більше слів або збільшити довжину.</div>`;
      }
    }, 300);
  });
}

// ---------------------------------------------------------------- LEADERBOARD
async function renderLeaderboard() {
  appEl.innerHTML = `<div class="center-msg">:: Завантаження ::</div>`;
  const { data } = await API.get("/api/leaderboard");
  const rows = (data.leaderboard || []).map((r, i) => `
    <tr>
      <td>#${i + 1}</td>
      <td>${escapeHtml(r.username)}${r.is_guest ? " (guest)" : ""}</td>
      <td><strong>${r.points}</strong> pts</td>
      <td>${r.ranked_solved} / ${data.total_tasks} <span style="font-size:11px;color:var(--fg-dim);">(+${r.unranked_solved} unranked)</span></td>
      <td>${escapeHtml(r.last_solve || "—")}</td>
    </tr>`).join("");

  appEl.innerHTML = `
    <h1>Leaderboard</h1>
    <div class="subtitle">Оновлюється в реальному часі. Завдання з відкритим Writeup не додають балів у рейтинг.</div>
    <div class="card">
      <table>
        <thead><tr><th>#</th><th>Нікнейм</th><th>Очки (Ranked)</th><th>Вирішено</th><th>Останнє рішення</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Поки що ніхто нічого не здав</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------- HACKER CHILL ZONE ("ЯКЩО НЕ ЦІКАВО")
function renderChillZone() {
  appEl.classList.remove("is-matrix");

  const HACKER_MOVIES = [
    {
      id: "wargames",
      title: "WarGames (Військові ігри)",
      year: 1983,
      category: "classic",
      catLabel: "Класика 80-90х",
      realism: "4/5",
      quote: "Shall we play a game?",
      desc: "Школяр Девід Лайтман через вардіалінг підключається до військового суперкомп'ютера WOPR у NORAD та випадково запускає симуляцію глобальної ядерної війни. Стрічка вплинула на прийняття першого закону про кіберзлочинність у США."
    },
    {
      id: "sneakers",
      title: "Sneakers (Тихі злодії)",
      year: 1992,
      category: "classic",
      catLabel: "Класика 80-90х",
      realism: "5/5",
      quote: "No more secrets. It's about who controls the information.",
      desc: "Команда легальних пентестерів на чолі з Мартіном Бішопом (Роберт Редфорд) тестує безпеку банків. Їх змушують викрасти чорну скриньку 'Setec Astronomy', здатну зламати будь-яке асиметричне шифрування у світі."
    },
    {
      id: "hackers",
      title: "Hackers (Хакери)",
      year: 1995,
      category: "classic",
      catLabel: "Класика 80-90х",
      realism: "3/5",
      quote: "Hack the Planet! Mess with the best, die like the rest.",
      desc: "Культовий маніфест 90-х: підлітки-хакери на роликах натрапляють на фінансову аферу в корпорації 'Ellingson Mineral' та комп'ютерного хробака 'Da Vinci'. Еталонна кіберпанк-атмосфера та дух цифрової свободи."
    },
    {
      id: "matrix",
      title: "The Matrix (Матриця)",
      year: 1999,
      category: "cyberpunk",
      catLabel: "Кіберпанк",
      realism: "4/5",
      quote: "Wake up, Neo... The Matrix has you.",
      desc: "Шедевр кіберпанку. У культовій сцені Трініті здійснює реальну атаку на електропідстанцію: сканує порт утилітою Nmap v2.54B25 та застосовує справжній exploit ssh1-crc32 для отримання root-доступу до енергомережі."
    },
    {
      id: "takedown",
      title: "Takedown / Track Down (Злом)",
      year: 2000,
      category: "realistic",
      catLabel: "Реалістичні",
      realism: "5/5",
      quote: "The system is never safe from the human factor.",
      desc: "Хроніка реального протистояння легендарного Кевіна Мітніка та експерта з комп'ютерної безпеки Цутому Шимомури. Детальна демонстрація соціальної інженерії, смітникового дайвінгу та клонування стільникових телефонів."
    },
    {
      id: "antitrust",
      title: "Antitrust (Небезпечна правда)",
      year: 2001,
      category: "realistic",
      catLabel: "Реалістичні",
      realism: "4/5",
      quote: "In this business, everybody wants to own the world.",
      desc: "Талановитий розробник потрапляє до монопольної IT-корпорації NURV, яка готує всесвітню супутникову мережу. Незабаром він виявляє, що корпорація фізично знищує програмістів заради крадіжки їхнього Open Source коду."
    },
    {
      id: "whoami",
      title: "Who Am I — Kein System ist sicher (Хто я)",
      year: 2014,
      category: "cyberpunk",
      catLabel: "Кіберпанк",
      realism: "4/5",
      quote: "No system is safe. Humans are always the biggest vulnerability.",
      desc: "Німецький кібертрилер про хакерську групу CLAY. Відмінно показано підземні форуми Даркнету, методики соціальної інженерії, фішинг, проникнення на закриті об'єкти та DDoS-атаки проти держустанов."
    },
    {
      id: "mrrobot",
      title: "Mr. Robot (Містер Робот)",
      year: 2015,
      category: "realistic",
      catLabel: "Реалістичні",
      realism: "5/5",
      quote: "Hello, friend. What I'm about to tell you is top secret.",
      desc: "Еталон технічної достовірності в історії кіно. Елліот Алдерсон використовує справжні інструменти: Kali Linux, Raspberry Pi, Rubber Ducky, RSA, компрометацію SCADA через систему клімат-контролю та Bluetooth-сніфінг."
    },
    {
      id: "citizenfour",
      title: "Citizenfour (Громадянин чотири)",
      year: 2014,
      category: "realistic",
      catLabel: "Реалістичні",
      realism: "5/5",
      quote: "We are building the greatest weapon for oppression in human history.",
      desc: "Оскароносний документальний трилер, знятий у номері готелю в Гонконзі. Едвард Сноуден передає журналістам факти масового стеження АНБ. Автентична робота з Tails OS, шифруванням PGP/GPG та одноразовими паролями."
    },
    {
      id: "blackhat",
      title: "Blackhat (Кібер)",
      year: 2015,
      category: "realistic",
      catLabel: "Реалістичні",
      realism: "4/5",
      quote: "It's not about money. It's not about politics. I can target anyone.",
      desc: "Фільм Майкла Манна про атаку на охолоджувальні системи гонконзької АЕС та Чиказьку товарну біржу. Деталізований реверс-інжиніринг шеллкоду та індустріальних PLC-контролерів у дусі реального хробака Stuxnet."
    }
  ];

  let storedClicks = parseInt(localStorage.getItem("ctf_chill_clicks") || "0", 10);
  if (isNaN(storedClicks) || storedClicks < 0) storedClicks = 0;

  function getRank(count) {
    if (count >= 2048) return { name: "CYBER ARCHITECT", tag: "L5", color: "var(--tier-200)" };
    if (count >= 1024) return { name: "ROOT DAEMON", tag: "L4", color: "var(--tier-150)" };
    if (count >= 512) return { name: "PHRACK READER", tag: "L3", color: "var(--tier-100)" };
    if (count >= 256) return { name: "PACKET SNIFFER", tag: "L2", color: "var(--tier-50)" };
    if (count >= 64)  return { name: "BUFFER EXPLORER", tag: "L1", color: "var(--fg)" };
    return { name: "SCRIPT NOOB", tag: "L0", color: "var(--fg-dim)" };
  }

  appEl.innerHTML = `
    <div class="page-head tui-page-head">
      <div class="tui-double-box">
        <div class="tui-box-title">╔═ [ RECREATION & HACKER ARCHIVE // RESTRICTED TERMINAL ] ═╗</div>
        <p class="subtitle" style="margin: 6px 0 8px;">Втомився від завдань? Прокачай кліки або обери культовий фільм про кібербезпеку.</p>
        <div class="tui-status-strip">
          <span>SYS: ONLINE</span>
          <span>TTY: /dev/ttyS0</span>
          <span>BAUD: 9600</span>
          <span>VT-100 TTY</span>
          <span>PHOSPHOR: P1-GREEN</span>
        </div>
      </div>
    </div>

    <div class="chill-container">
      <!-- LEFT: RETRO CLICKER -->
      <section class="card tui-card chill-clicker-panel">
        <div class="tui-panel-hdr">┌── [ PACKET INJECTOR // CLICKER ] ──┐</div>
        
        <div class="clicker-stats-box">
          <div class="clicker-label">ENTROPY / BYTES HARVESTED:</div>
          <div class="clicker-counter" id="chill-counter-hex">0x${storedClicks.toString(16).toUpperCase().padStart(6, "0")}</div>
          <div class="clicker-counter-dec" id="chill-counter-dec">[ ${storedClicks} BYTES INJECTED ]</div>
          <div class="clicker-rank" id="chill-rank">
            RANK: <span style="color: ${getRank(storedClicks).color}; font-weight: bold;">[${getRank(storedClicks).tag}] ${getRank(storedClicks).name}</span>
          </div>
        </div>

        <div class="clicker-action-zone">
          <button id="chill-click-btn" class="chill-big-btn">
            <span class="btn-line-1">[ INJECT PACKET ]</span>
            <span class="btn-line-2">[ CLICK TO TRANSMIT ]</span>
          </button>
        </div>

        <div class="clicker-meter-box">
          <div class="meter-head">
            <span>INPUT RATE (CPS):</span>
            <span id="chill-cps-val">0.0 / 10.0 MAX</span>
          </div>
          <div class="meter-bar-track">
            <div class="meter-bar-fill" id="chill-cps-fill" style="width: 0%;"></div>
          </div>
        </div>

        <div class="clicker-footer">
          <button id="chill-reset-btn" class="chill-reset-btn">[ Скинути прогрес ]</button>
        </div>
      </section>

      <!-- RIGHT: MOVIE CATALOGUE -->
      <section class="card tui-card chill-movies-panel">
        <div class="tui-panel-hdr">┌── [ HACKER CINEMA ARCHIVE ] ──┐</div>
        <div class="movies-subtitle">Добірка найкращих фільмів про хакерство, пентест, криптографію та кіберпанк:</div>

        <div class="movie-filters" id="movie-filters">
          <button class="movie-filter-btn active" data-cat="all">УСІ (10)</button>
          <button class="movie-filter-btn" data-cat="classic">КЛАСИКА 80-90х</button>
          <button class="movie-filter-btn" data-cat="realistic">РЕАЛІСТИЧНІ</button>
          <button class="movie-filter-btn" data-cat="cyberpunk">КІБЕРПАНК</button>
        </div>

        <div class="movies-list" id="movies-list"></div>
      </section>
    </div>
  `;

  // --- Clicker Logic ---
  const clickBtn = appEl.querySelector("#chill-click-btn");
  const counterHexEl = appEl.querySelector("#chill-counter-hex");
  const counterDecEl = appEl.querySelector("#chill-counter-dec");
  const rankEl = appEl.querySelector("#chill-rank");
  const cpsValEl = appEl.querySelector("#chill-cps-val");
  const cpsFillEl = appEl.querySelector("#chill-cps-fill");
  const resetBtn = appEl.querySelector("#chill-reset-btn");

  const MIN_INTERVAL_MS = 100; // Max 10 CPS
  let lastValidClick = 0;
  let clickHistory = [];
  let clicks = storedClicks;

  function updateCpsGauge() {
    const now = Date.now();
    clickHistory = clickHistory.filter((t) => now - t <= 1000);
    const cps = clickHistory.length;
    cpsValEl.textContent = `${cps.toFixed(1)} / 10.0 MAX`;
    const pct = Math.min(100, Math.round((cps / 10) * 100));
    cpsFillEl.style.width = `${pct}%`;
  }

  // Periodic CPS decay timer
  const cpsTimer = setInterval(() => {
    if (!document.getElementById("chill-cps-val")) {
      clearInterval(cpsTimer);
      return;
    }
    updateCpsGauge();
  }, 300);

  function syncClickerUI() {
    counterHexEl.textContent = `0x${clicks.toString(16).toUpperCase().padStart(6, "0")}`;
    counterDecEl.textContent = `[ ${clicks} BYTES INJECTED ]`;
    const r = getRank(clicks);
    rankEl.innerHTML = `RANK: <span style="color: ${r.color}; font-weight: bold;">[${r.tag}] ${r.name}</span>`;
  }

  clickBtn.addEventListener("click", () => {
    const now = Date.now();
    // Rate limit throttle: ignore if clicked within MIN_INTERVAL_MS
    if (now - lastValidClick < MIN_INTERVAL_MS) {
      return;
    }
    lastValidClick = now;
    clickHistory.push(now);
    clicks++;
    localStorage.setItem("ctf_chill_clicks", clicks);

    syncClickerUI();
    updateCpsGauge();

    // Subtle click animation
    clickBtn.classList.add("btn-pressed-anim");
    setTimeout(() => clickBtn.classList.remove("btn-pressed-anim"), 80);
  });

  resetBtn.addEventListener("click", () => {
    if (confirm("Скинути накопичений лічильник байтів?")) {
      clicks = 0;
      localStorage.setItem("ctf_chill_clicks", 0);
      syncClickerUI();
      updateCpsGauge();
    }
  });

  // --- Movie List Render Logic ---
  let activeCategory = "all";
  const moviesListEl = appEl.querySelector("#movies-list");
  const filterBtns = appEl.querySelectorAll(".movie-filter-btn");

  function renderMovieList() {
    const filtered = activeCategory === "all"
      ? HACKER_MOVIES
      : HACKER_MOVIES.filter((m) => m.category === activeCategory);

    moviesListEl.innerHTML = filtered.map((m) => `
      <article class="movie-card tui-subcard" data-cat="${escapeHtml(m.category)}">
        <div class="movie-hdr">
          <div class="movie-title-box">
            <span class="movie-title">${escapeHtml(m.title)}</span>
            <span class="movie-year">(${m.year})</span>
          </div>
          <div class="movie-badges">
            <span class="movie-cat-badge">[ ${escapeHtml(m.catLabel)} ]</span>
            <span class="movie-realism" title="Технічна достовірність">[ REALISM: ${m.realism} ]</span>
          </div>
        </div>
        <div class="movie-quote">"${escapeHtml(m.quote)}"</div>
        <p class="movie-desc">${escapeHtml(m.desc)}</p>
      </article>
    `).join("");
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.dataset.cat;
      renderMovieList();
    });
  });

  renderMovieList();
}

// ---------------------------------------------------------------- RETRO ASCII BACKGROUND LAYER
function initAsciiBackground() {
  let layer = document.getElementById("ascii-bg-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "ascii-bg-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }

  const ASCII_ARTS = [
    // 1. Cyber Skull / Security Audit
    [
      "     .---.     ",
      "    /     \\    ",
      "   | () () |   ",
      "    \\  ^  /    ",
      "     |||||     ",
      "  [SEC_AUDIT]  "
    ].join("\n"),

    // 2. Retro 3.5\" Diskette
    [
      " .--------------. ",
      " | .----------. | ",
      " | | CYBER-J  | | ",
      " | `----------' | ",
      " |   .------.   | ",
      " |   | [::] |   | ",
      " `---'------'---' "
    ].join("\n"),

    // 3. CRT Terminal Workstation
    [
      " .-----------------. ",
      " | .-------------. | ",
      " | | > SYSTEM OK | | ",
      " | | > C2_TRACER | | ",
      " | `-------------' | ",
      " |      [===]      | ",
      " `-----------------' ",
      "     /         \\     ",
      "   -------------     "
    ].join("\n"),

    // 4. Crypto Security Padlock
    [
      "     .-------.     ",
      "    /         \\    ",
      "   |   .---.   |   ",
      "   |   |   |   |   ",
      "   |___|___|___|   ",
      "   |   [ * ]   |   ",
      "   |    _|_    |   ",
      "   `-----------'   "
    ].join("\n"),

    // 5. Radar Satellite Antenna
    [
      "       /|          ",
      "      / |          ",
      "   .-'  |          ",
      "  /     |          ",
      " |  (*) |---> RX   ",
      "  \\     |          ",
      "   `-._ |          ",
      "       \\|          ",
      "        |          "
    ].join("\n"),

    // 6. Microprocessor IC
    [
      "     | | | | |     ",
      "   .-----------.   ",
      " - | +-------+ | - ",
      " - | | CPU98 | | - ",
      " - | | MITIT | | - ",
      " - | +-------+ | - ",
      "   `-----------'   ",
      "     | | | | |     "
    ].join("\n"),

    // 7. Cyber Eye / Scanner
    [
      "      .--------.      ",
      "   .-'          '-.   ",
      "  /    .------.    \\  ",
      " |    /   __   \\    | ",
      " |   |   (@@)   |   | ",
      "  \\   \\        /   /  ",
      "   '-. '------' .-'   ",
      "      '--------'      "
    ].join("\n"),

    // 8. 8-Bit Cyber Bug / Malware
    [
      "    \\_/    ",
      "  --(_)--  ",
      "   / | \\   ",
      "  /  |  \\  ",
      " [MALWARE] "
    ].join("\n"),

    // 9. Retro Reel Tape
    [
      " .-----------------. ",
      " | ( O )     ( O ) | ",
      " |  \\ \\_______/ /  | ",
      " |   `---------'   | ",
      " | [AUDIT_REEL_01] | ",
      " `-----------------' "
    ].join("\n")
  ];

  function spawnArt() {
    if (!layer || layer.children.length >= 4) return;

    const art = ASCII_ARTS[Math.floor(Math.random() * ASCII_ARTS.length)];
    const el = document.createElement("pre");
    el.className = "ascii-floating-art";
    el.textContent = art;

    const isLeft = Math.random() < 0.5;
    if (isLeft) {
      const leftPercent = 1 + Math.random() * 8.5; // strictly 1vw to 9.5vw
      el.style.left = `${leftPercent.toFixed(1)}vw`;
      el.style.right = "auto";
    } else {
      const rightPercent = 1 + Math.random() * 8.5; // strictly 1vw to 9.5vw from right
      el.style.right = `${rightPercent.toFixed(1)}vw`;
      el.style.left = "auto";
    }

    const startTopPercent = 65 + Math.random() * 25;
    const durationSec = 14 + Math.random() * 8;
    const targetOpacity = (0.13 + Math.random() * 0.12).toFixed(3);

    const tones = [
      "var(--fg-dim)",
      "rgba(51,255,51,0.55)",
      "rgba(57,255,20,0.6)",
      "rgba(30,163,74,0.7)"
    ];
    const color = tones[Math.floor(Math.random() * tones.length)];

    el.style.top = `${startTopPercent.toFixed(1)}vh`;
    el.style.setProperty("--duration", `${durationSec.toFixed(1)}s`);
    el.style.setProperty("--target-opacity", targetOpacity);
    el.style.color = color;

    layer.appendChild(el);

    el.addEventListener("animationend", () => {
      el.remove();
    });
  }

  // Spawn initial art
  spawnArt();
  setTimeout(spawnArt, 1800);
  setInterval(spawnArt, 6000);
}

