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

async function init() {
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
    <span class="logo">CTF_Platform</span>
    <nav>
      <button data-r="challenges" class="${route === "challenges" ? "active" : ""}">Завдання</button>
      <button data-r="leaderboard" class="${route === "leaderboard" ? "active" : ""}">Скорборд</button>
    </nav>
    <span class="userbox">
      USER: <strong>${escapeHtml(state.user.username)}</strong>${state.user.is_guest ? " (guest)" : ""}
      <button id="logout-btn">Вийти</button>
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
        <article class="chal-card ${escapeHtml(diff)} ${c.solved ? "solved" : ""}" data-id="${c.id}">
          <div class="top-row">
            ${badgeHtml}
            <span class="pts">${c.points} <span>pts</span></span>
          </div>
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(short)}</p>
          <div class="chal-foot">
            <span>${escapeHtml(diff || "task")}</span>
            <span class="go">Відкрити</span>
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
  appEl.innerHTML = `<div class="center-msg">:: Завантаження ::</div>`;
  const { data: c, ok } = await API.get(`/api/challenges/${taskId}`);
  if (!ok) { appEl.innerHTML = `<div class="center-msg">Завдання не знайдено</div>`; return; }

  let statusBadge = "";
  if (c.is_unranked) {
    statusBadge = '<span class="badge unranked" style="margin-left:10px;">ПОЗА РЕЙТИНГОМ (0 PTS)</span>';
  } else if (c.solved) {
    statusBadge = '<span class="badge solved" style="margin-left:10px;">SOLVED</span>';
  }

  appEl.innerHTML = `
    <button class="ghost" id="back-btn">&larr; До списку</button>
    <div style="height:14px;"></div>
    <h1>${escapeHtml(c.title)}</h1>
    <div class="subtitle">${escapeHtml(c.category)} · ${c.points} pts · ${c.difficulty.toUpperCase()}
      ${statusBadge}
    </div>

    <div class="local-tabs">
      <button data-page="brief" class="active">Бриф</button>
      <button data-page="theory">Теорія + Приклади</button>
      <button data-page="lab">Лабораторія</button>
      <button data-page="writeup">Writeup ${c.writeup_unlocked ? "(Відкрито)" : ""}</button>
    </div>

    <div id="page-brief" class="page active">
      <div class="card">
        <h2>Завдання</h2>
        <p style="line-height:1.7;color:var(--fg-dim);">${escapeHtml(c.brief)}</p>
      </div>
      <div class="card">
        <h2>Submit Flag</h2>
        <div class="flag-form">
          <input type="text" id="flag-input" placeholder="FLAG{...}">
          <button id="flag-submit">Здати</button>
        </div>
        <div id="flag-out"></div>
      </div>
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
    const flag = appEl.querySelector("#flag-input").value.trim();
    const { data } = await API.post("/api/submit-flag", { task_id: taskId, flag });
    const out = appEl.querySelector("#flag-out");
    if (data.correct) {
      const msg = data.is_unranked
        ? "[+] ACCESS GRANTED (ПОЗА РЕЙТИНГОМ / WRITEUP: +0 pts)"
        : `[+] ACCESS GRANTED — +${data.points} pts`;
      out.innerHTML = `<div style="color:var(--fg);margin-top:8px;">${msg}</div>`;
      flashSuccess();
    } else {
      out.innerHTML = `<div style="color:var(--fg-dim);margin-top:8px;">[X] Невірний прапорець.</div>`;
    }
  }
  appEl.querySelector("#flag-submit").addEventListener("click", submitFlag);
  appEl.querySelector("#flag-input").addEventListener("keydown", (e) => { if (e.key === "Enter") submitFlag(); });

  // ---- lab widget mount ----
  const labContainer = appEl.querySelector("#lab-container");

  async function onSolved() {
    const { data, ok: flagOk } = await API.get(`/api/challenges/${taskId}/flag`);
    if (flagOk && data.flag) {
      appEl.querySelector("#flag-input").value = data.flag;
      toast("[i] Прапорець згенеровано та підставлено у форму Submit Flag");
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
          <strong>Інструкція аудитора:</strong> Позначте підроблені ресурси з префіксом <code>xn--</code>. Знайдений прапорець <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
        </div>
      </div>
    `;

    container.querySelectorAll(".phish-cb").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const id = Number(cb.dataset.id);
        if (cb.checked) pickedIds.add(id); else pickedIds.delete(id);
        render();
      });
    });

    container.querySelectorAll(".pkt-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.classList.contains("phish-cb")) return;
        const id = Number(row.dataset.id);
        if (pickedIds.has(id)) pickedIds.delete(id); else pickedIds.add(id);
        render();
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
