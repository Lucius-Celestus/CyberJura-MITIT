function decodeUtf16LEBase64(b64) {
  try {
    const binary = atob(b64);
    let out = "";
    for (let i = 0; i < binary.length; i += 2) {
      const code = binary.charCodeAt(i) | (binary.charCodeAt(i + 1) << 8);
      out += String.fromCharCode(code);
    }
    return out;
  } catch (e) {
    return "Помилка декодування Base64: " + e.message;
  }
}

function decodeUtf8Base64(b64) {
  try {
    const binary = atob(b64);
    let out = "";
    for (let i = 0; i < binary.length; i++) {
      const c = binary.charCodeAt(i);
      out += c === 0 ? "·" : binary.charAt(i);
    }
    return out;
  } catch (e) {
    return "Помилка декодування Base64: " + e.message;
  }
}

async function initDuckySim(container, labId, onSolved) {
  const { data } = await API.get(`/api/lab/${labId}/script`);
  let selectedMode = "utf16le";

  container.innerHTML = `
    <div class="ducky-wrap">
      <div style="font-size:12px;color:var(--fg-dim);margin-bottom:8px;">
        Скрипт DuckyScript (послідовність вводу команд):
      </div>
      <div class="ducky-script" style="background:#000;border:1px solid var(--fg-dim);padding:12px;font-family:monospace;white-space:pre-wrap;color:var(--fg-bright);">${escapeHtml(data.script)}</div>

      <div class="card" style="margin-top:16px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструмент: Декодер рядків Base64 (PowerShell -enc)</h2>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;">
          Скопіюйте закодований рядок корисного навантаження зі скрипту вище, оберіть кодування та виконайте декодування:
        </div>

        <div style="margin-bottom:10px;">
          <input type="text" id="ducky-b64-input" placeholder="Вставте рядок Base64 (значення після аргументу -enc)">
        </div>

        <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
          <label style="font-size:12px;color:var(--fg-dim);margin:0;">Кодування:</label>
          <button id="mode-utf16" class="primary" style="padding:4px 10px;font-size:11.5px;">UTF-16LE (PowerShell -enc)</button>
          <button id="mode-utf8" class="ghost" style="padding:4px 10px;font-size:11.5px;">UTF-8 (Стандартний текст)</button>
          <button id="ducky-decode-btn">Декодувати команду</button>
        </div>

        <div id="ducky-decoded-wrap" style="display:none;margin-top:10px;">
          <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:4px;">Результат декодування:</div>
          <pre id="ducky-decoded-out" style="background:#000;border:1px solid var(--fg-dim);padding:10px;font-size:12px;color:var(--fg-bright);white-space:pre-wrap;word-break:break-all;"></pre>
          <div id="ducky-encoding-hint" style="font-size:11.5px;color:#fca5a5;margin-top:6px;display:none;"></div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;border-color:var(--fg-dim);">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструкція аудитора:</h2>
        <div style="font-size:12px;color:var(--fg-bright);line-height:1.6;">
          Декодувавши рядок Base64 у кодуванні <strong>UTF-16LE</strong>, ви знайдете команду з параметром <code>-AuditFlag 'FLAG{...}'</code>. Скопіюйте знайдений прапорець та надішліть його у вкладці «Опис».
        </div>
      </div>
    </div>
  `;

  const b64Input = container.querySelector("#ducky-b64-input");
  const decodedWrap = container.querySelector("#ducky-decoded-wrap");
  const decodedOut = container.querySelector("#ducky-decoded-out");
  const hintEl = container.querySelector("#ducky-encoding-hint");
  const btnUtf16 = container.querySelector("#mode-utf16");
  const btnUtf8 = container.querySelector("#mode-utf8");

  btnUtf16.addEventListener("click", () => {
    selectedMode = "utf16le";
    btnUtf16.className = "primary";
    btnUtf8.className = "ghost";
  });

  btnUtf8.addEventListener("click", () => {
    selectedMode = "utf8";
    btnUtf8.className = "primary";
    btnUtf16.className = "ghost";
  });

  container.querySelector("#ducky-decode-btn").addEventListener("click", () => {
    const rawB64 = b64Input.value.trim();
    if (!rawB64) {
      alert("Вставте рядок Base64 для декодування.");
      return;
    }
    decodedWrap.style.display = "block";

    if (selectedMode === "utf16le") {
      const decoded = decodeUtf16LEBase64(rawB64);
      decodedOut.textContent = decoded;
      hintEl.style.display = "none";
      if (decoded.includes("FLAG{")) {
        onSolved();
      }
    } else {
      const decoded = decodeUtf8Base64(rawB64);
      decodedOut.textContent = decoded;
      hintEl.style.display = "block";
      hintEl.innerHTML = `Повідомлення: У виводі присутні розділові байти (нуль-термінатори). Параметр PowerShell <code>-enc</code> вимагає кодування UTF-16LE.`;
    }
  });
}
