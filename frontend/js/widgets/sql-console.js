function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function initSqlConsole(container, labId, onSolved) {
  if (labId === "sqli1") return renderSqli1(container, onSolved);
  if (labId === "sqli2") return renderSqli2(container, onSolved);
  if (labId === "sqli3") return renderSqli3(container, onSolved);
}

function renderSqli1(container, onSolved) {
  container.innerHTML = `
    <div class="sql-console">
      <div style="font-size:12px;color:var(--fg-dim);margin-bottom:10px;">
        Форма автентифікації користувача (SQL-консоль бекенду):
      </div>
      <label>Логін (Username):</label>
      <input type="text" id="sqli1-user" value="admin" placeholder="Введіть ім'я користувача">
      <div style="height:10px;"></div>
      <label>Пароль (Password):</label>
      <input type="text" id="sqli1-pass" placeholder="Введіть пароль або SQL-пейлоад">
      <div style="margin-top:12px;">
        <button id="sqli1-go">Виконати SQL-запит</button>
      </div>
      <div id="sqli1-out" style="margin-top:14px;"></div>
    </div>`;

  const userIn = container.querySelector("#sqli1-user");
  const passIn = container.querySelector("#sqli1-pass");

  container.querySelector("#sqli1-go").addEventListener("click", async () => {
    const username = userIn.value;
    const password = passIn.value;
    const { data } = await API.post("/api/lab/sqli1/login", { username, password });
    const out = container.querySelector("#sqli1-out");
    if (data.error) {
      out.innerHTML = `<div class="query-line"><span class="lbl">SQL&gt;</span> ${escapeHtml(data.query)}</div><div style="color:var(--fg-dim)">${escapeHtml(data.error)}</div>`;
      return;
    }
    out.innerHTML = `
      <div class="query-line"><span class="lbl">SQL&gt;</span> ${escapeHtml(data.query)}</div>
      <div style="margin-top:6px;color:${data.task_solved ? 'var(--fg)' : 'var(--fg-dim)'};">${escapeHtml(data.message)}</div>
    `;
    if (data.task_solved) onSolved();
  });
}

function renderSqli2(container, onSolved) {
  container.innerHTML = `
    <div class="sql-console">
      <div style="font-size:12px;color:var(--fg-dim);margin-bottom:10px;">
        Пошуковий інтерфейс каталогу продукції:
      </div>
      <label>Параметр пошуку (q):</label>
      <input type="text" id="sqli2-q" placeholder="Введіть пошуковий запит або UNION-пейлоад">
      <div style="margin-top:12px;">
        <button id="sqli2-go">Виконати запит до бази даних</button>
      </div>
      <div id="sqli2-out" style="margin-top:14px;"></div>
    </div>`;

  const qIn = container.querySelector("#sqli2-q");

  container.querySelector("#sqli2-go").addEventListener("click", async () => {
    const q = qIn.value;
    const { data } = await API.post("/api/lab/sqli2/search", { q });
    const out = container.querySelector("#sqli2-out");
    if (data.error) {
      out.innerHTML = `<div class="query-line"><span class="lbl">SQL&gt;</span> ${escapeHtml(data.query)}</div><div style="color:var(--fg-dim)">${escapeHtml(data.error)}</div>`;
      return;
    }
    const rows = (data.results || []).map((r) =>
      `<tr><td>${escapeHtml(r.name || "")}</td><td>${escapeHtml(r.category || "")}</td><td>${escapeHtml(r.description || "")}</td></tr>`
    ).join("");
    out.innerHTML = `
      <div class="query-line"><span class="lbl">SQL&gt;</span> ${escapeHtml(data.query)}</div>
      <table class="result-table"><thead><tr><th>Стовпець 1 (name / title)</th><th>Стовпець 2 (category / code)</th><th>Стовпець 3 (description / details)</th></tr></thead><tbody>${rows || "<tr><td colspan=3>(порожньо)</td></tr>"}</tbody></table>
    `;
    if (data.task_solved) onSolved();
  });
}

function renderSqli3(container, onSolved) {
  container.innerHTML = `
    <div class="sql-console">
      <div style="font-size:12px;color:var(--fg-dim);margin-bottom:10px;">
        Булевий оракул бази даних (Blind SQL Injection):
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Перевірка логічної умови через оракул:</h2>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:8px;">
          Запит виконується у контексті: <code>SELECT id FROM lab_users WHERE username='admin' AND (&lt;condition&gt;)</code>
        </div>
        <div style="display:flex;gap:8px;">
          <input type="text" id="sqli3-cond" placeholder="Введіть умову, наприклад: substr(secret, 1, 1) = 'a'">
          <button id="sqli3-go">Перевірити умову</button>
        </div>
        <div id="sqli3-oracle-out" style="margin-top:10px;"></div>
      </div>

      <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
        <strong>Інструкція аудитора:</strong> Посимвольно відновіть прихований рядок поля <code>secret</code> через булеві умови оракула (наприклад: <code>SUBSTR(secret, 1, 5) = 'FLAG{'</code>). Отриманий прапорець <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
      </div>
    </div>`;

  const condInput = container.querySelector("#sqli3-cond");
  const oracleOut = container.querySelector("#sqli3-oracle-out");

  container.querySelector("#sqli3-go").addEventListener("click", async () => {
    const condition = condInput.value.trim();
    if (!condition) return;
    const { data } = await API.post("/api/lab/sqli3/query", { condition });
    if (data.error) {
      oracleOut.innerHTML = `<div class="query-line"><span class="lbl">SQL&gt;</span> ${escapeHtml(data.query)}</div><div style="color:var(--fg-dim)">${escapeHtml(data.error)}</div>`;
      return;
    }
    const isTrue = data.result === "TRUE";
    oracleOut.innerHTML = `
      <div class="query-line"><span class="lbl">SQL&gt;</span> ${escapeHtml(data.query)}</div>
      <div style="margin-top:6px;font-weight:bold;color:${isTrue ? 'var(--fg)' : '#f87171'};">
        Результат перевірки умови: ${data.result}
      </div>
    `;
  });
}
