function initUartSim(container, labId, onSolved) {
  let selectedBaud = 9600;
  let currentPrompt = "uart> ";
  let terminalHistory = "// Підключіть USB-UART перехідник, оберіть Baud Rate та увімкніть живлення роутера.\n";

  container.innerHTML = `
    <div class="uart-terminal">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
        <div>
          <label>Швидкість порту (Baud Rate):</label>
          <select id="uart-baud-select" style="background:#000;color:var(--fg);border:1px solid var(--fg);padding:6px 10px;">
            <option value="9600">9600 baud</option>
            <option value="57600">57600 baud</option>
            <option value="115200">115200 baud (Standard)</option>
          </select>
        </div>
        <button id="uart-power-btn" style="margin-top:16px;">Подати живлення (Power ON)</button>
        <button id="uart-interrupt-btn" class="danger" style="margin-top:16px;display:none;">[ INTERRUPT AUTOBOOT ]</button>
      </div>

      <div class="uart-output" id="uart-output-screen"></div>

      <div id="uart-cmd-row" style="display:none;margin-top:10px;">
        <label id="uart-prompt-lbl">u-boot&gt;</label>
        <div style="display:flex;gap:8px;">
          <input type="text" id="uart-cmd-input" placeholder="setenv bootargs init=/bin/sh; boot">
          <button id="uart-send-cmd">Надіслати</button>
        </div>
      </div>

      <div class="card" style="margin-top:16px;border-color:var(--fg-dim);">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструкція аудитора:</h2>
        <div style="font-size:12px;color:var(--fg-bright);line-height:1.6;">
          Перехопіть завантажувач U-Boot, додайте параметр <code>init=/bin/sh</code> і запустіть систему. Отримавши оболонку root (<code>#</code>), виконайте <code>cat /etc/root_hw_key.secret</code>. Прапорець аудиту буде виведено безпосередньо у термінал. Скопіюйте його та надішліть у вкладці «Опис».
        </div>
      </div>
    </div>
  `;

  const outputScreen = container.querySelector("#uart-output-screen");
  const baudSelect = container.querySelector("#uart-baud-select");
  const powerBtn = container.querySelector("#uart-power-btn");
  const interruptBtn = container.querySelector("#uart-interrupt-btn");
  const cmdRow = container.querySelector("#uart-cmd-row");
  const promptLbl = container.querySelector("#uart-prompt-lbl");
  const cmdInput = container.querySelector("#uart-cmd-input");

  outputScreen.textContent = terminalHistory;

  baudSelect.addEventListener("change", (e) => {
    selectedBaud = Number(e.target.value);
  });

  powerBtn.addEventListener("click", async () => {
    if (selectedBaud !== 115200) {
      terminalHistory += `\n[UART RX @ ${selectedBaud} bps]: \ufffd\ufffd?\x1b[2J\ufffd\ufffd\ufffd?\ufffd (Garbage Data: Невірна швидкість Baud Rate! Перевірте осцилограму або спробуйте 115200)\n`;
      outputScreen.textContent = terminalHistory;
      outputScreen.scrollTop = outputScreen.scrollHeight;
      return;
    }

    const { data: st } = await API.get(`/api/lab/${labId}/state`);
    terminalHistory += `\n[UART RX @ 115200 bps]:${st.banner}`;
    outputScreen.textContent = terminalHistory;
    outputScreen.scrollTop = outputScreen.scrollHeight;

    interruptBtn.style.display = "inline-block";

    setTimeout(() => {
      if (interruptBtn.style.display !== "none") {
        interruptBtn.style.display = "none";
        terminalHistory += "Booting default kernel image... Kernel panic: password required for console.\n";
        outputScreen.textContent = terminalHistory;
      }
    }, 4500);
  });

  interruptBtn.addEventListener("click", async () => {
    interruptBtn.style.display = "none";
    const { data: res } = await API.post(`/api/lab/${labId}/exec`, {
      baud: selectedBaud,
      cmd: "interrupt",
    });
    terminalHistory += res.output;
    outputScreen.textContent = terminalHistory;
    outputScreen.scrollTop = outputScreen.scrollHeight;

    currentPrompt = res.prompt || "u-boot> ";
    promptLbl.textContent = currentPrompt;
    cmdRow.style.display = "block";
    cmdInput.focus();
  });

  async function sendCommand() {
    const cmd = cmdInput.value.trim();
    if (!cmd) return;
    cmdInput.value = "";

    terminalHistory += `${currentPrompt}${cmd}\n`;
    outputScreen.textContent = terminalHistory;

    const { data: res } = await API.post(`/api/lab/${labId}/exec`, {
      baud: selectedBaud,
      cmd: cmd,
    });

    terminalHistory += res.output;
    outputScreen.textContent = terminalHistory;
    outputScreen.scrollTop = outputScreen.scrollHeight;

    if (res.output && res.output.includes("FLAG{")) {
      onSolved();
    }

    if (res.prompt) {
      currentPrompt = res.prompt;
      promptLbl.textContent = currentPrompt;
    }
  }

  container.querySelector("#uart-send-cmd").addEventListener("click", sendCommand);
  cmdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendCommand();
  });
}
