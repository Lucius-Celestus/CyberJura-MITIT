function initCmdConsole(container, labId, onSolved) {
  container.innerHTML = `
    <div class="cmd-terminal">
      <label>Цільовий вузол або IP-адреса для Ping-діагностики:</label>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <input type="text" id="cmd-host-input" value="127.0.0.1" placeholder="127.0.0.1; ls -la /etc">
        <button id="cmd-run-btn">Виконати Ping</button>
      </div>
      <div class="cmd-output" id="cmd-terminal-output">// Термінал очікує команду... Спробуйте 127.0.0.1 або впровадження команд (;, &&).</div>

      <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
        <strong>Інструкція аудитора:</strong> Використайте розділювач команд (наприклад: <code>127.0.0.1; cat /etc/security_token.conf</code>). Знайдений у виводі термінала прапорець <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
      </div>
    </div>
  `;

  const outputEl = container.querySelector("#cmd-terminal-output");
  const hostInput = container.querySelector("#cmd-host-input");

  async function executeDiagnostic() {
    const host = hostInput.value.trim();
    if (!host) return;
    outputEl.textContent = `$ ping -c 2 ${host}\n[... очікування відповіді ...]\n`;
    const { data } = await API.post(`/api/lab/${labId}/ping`, { host });
    if (data.error) {
      outputEl.textContent = `Помилка: ${data.error}`;
      return;
    }
    outputEl.textContent = `$ ${data.command}\n\n${data.output}`;
    if (data.output && data.output.includes("FLAG{")) {
      const match = data.output.match(/FLAG\{[A-F0-9_]+\}/);
      if (match) {
        const flagIn = document.getElementById("flag-input");
        if (flagIn) flagIn.value = match[0];
      }
      onSolved();
    }
  }

  container.querySelector("#cmd-run-btn").addEventListener("click", executeDiagnostic);
  hostInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") executeDiagnostic();
  });
}
