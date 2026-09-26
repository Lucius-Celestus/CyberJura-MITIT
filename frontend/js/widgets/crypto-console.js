async function initCryptoConsole(container, labId, onSolved) {
  if (labId === "crypto1") {
    return initCaesarConsole(container, labId, onSolved);
  }
  if (labId === "crypto3") {
    return initRsaConsole(container, labId, onSolved);
  }
  return initXorConsole(container, labId, onSolved);
}

// ---------------------------------------------------------------- crypto-1 (Caesar)
async function initCaesarConsole(container, labId, onSolved) {
  const { data: chal } = await API.get(`/api/lab/${labId}/challenge`);
  const ciphertext = chal.ciphertext || "";

  // Calculate letter frequencies
  const counts = {};
  let totalLetters = 0;
  for (const ch of ciphertext.toUpperCase()) {
    if (ch >= "A" && ch <= "Z") {
      counts[ch] = (counts[ch] || 0) + 1;
      totalLetters++;
    }
  }

  const standardFreq = {
    E: 12.7, T: 9.1, A: 8.2, O: 7.5, I: 7.0, N: 6.7, S: 6.3, H: 6.1, R: 6.0,
    D: 4.3, L: 4.0, C: 2.8, U: 2.8, M: 2.4, W: 2.4, F: 2.2, G: 2.0, Y: 2.0,
    P: 1.9, B: 1.5, V: 1.0, K: 0.8, J: 0.15, X: 0.15, Q: 0.10, Z: 0.07,
  };

  function decryptCaesar(text, shift) {
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 65 && code <= 90) {
        out += String.fromCharCode(((code - 65 - shift + 26) % 26) + 65);
      } else if (code >= 97 && code <= 122) {
        out += String.fromCharCode(((code - 97 - shift + 26) % 26) + 97);
      } else {
        out += text[i];
      }
    }
    return out;
  }

  container.innerHTML = `
    <div class="cmd-terminal">
      <div style="font-size:12px;color:var(--fg-dim);margin-bottom:8px;">
        Перехоплений шифротекст (Caesar Cipher):
      </div>
      <pre style="background:#000;border:1px solid var(--fg-dim);padding:10px;color:var(--fg-bright);font-size:12px;word-break:break-all;white-space:pre-wrap;">${escapeHtml(ciphertext)}</pre>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструмент: Частотний аналіз літер у шифротексті</h2>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;">
          Порівняйте найчастіші літери шифротексту з найчастішою літерою англійської мови ('E' ~12.7%, 'T' ~9.1%):
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          ${Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([letter, count]) => {
              const pct = ((count / totalLetters) * 100).toFixed(1);
              return `<span style="background:#000;border:1px solid var(--fg);padding:3px 8px;font-size:11px;color:var(--fg-bright);">
                <strong>${letter}</strong>: ${pct}% (${count})
              </span>`;
            }).join("")}
        </div>
      </div>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Інтерактивний дешифратор зсуву Цезаря</h2>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
          <label style="margin:0;font-size:13px;color:var(--fg);">Величина зсуву k (0 - 25):</label>
          <input type="range" id="caesar-slider" min="0" max="25" value="0" style="width:200px;cursor:pointer;">
          <span id="caesar-shift-val" style="font-weight:bold;color:var(--fg-bright);min-width:30px;">0</span>
        </div>

        <label>Результат розшифрування:</label>
        <pre id="caesar-decrypted-preview" style="background:#000;border:1px solid var(--fg);padding:10px;color:var(--fg-bright);font-size:12px;word-break:break-all;white-space:pre-wrap;min-height:60px;"></pre>
      </div>

      <div class="card" style="margin-top:14px;border-color:var(--fg-dim);">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструкція аудитора:</h2>
        <div style="font-size:12px;color:var(--fg-bright);line-height:1.6;">
          Підібравши коректний зсув алфавіту $k$, ви прочитаєте відкритий текст повідомлення, який містить рядок <code>TOKEN: FLAG{...}</code>. Скопіюйте отриманий прапорець та надішліть його у вкладці «Опис».
        </div>
      </div>
    </div>
  `;

  const slider = container.querySelector("#caesar-slider");
  const shiftVal = container.querySelector("#caesar-shift-val");
  const preview = container.querySelector("#caesar-decrypted-preview");

  function updatePreview() {
    const shift = parseInt(slider.value, 10);
    shiftVal.textContent = shift;
    const dec = decryptCaesar(ciphertext, shift);
    preview.textContent = dec;

    if (dec.includes("FLAG{")) {
      onSolved();
    }
  }

  slider.addEventListener("input", updatePreview);
  updatePreview();
}

// ---------------------------------------------------------------- crypto-2 (Repeating XOR)
async function initXorConsole(container, labId, onSolved) {
  const { data: chal } = await API.get(`/api/lab/${labId}/challenge`);
  const hex = chal.ciphertext_hex || "";
  const knownHeader = chal.known_header || "C2_COMMAND_TOKEN:";
  const keyLength = chal.key_length || 4;

  container.innerHTML = `
    <div class="cmd-terminal">
      <div style="font-size:12px;color:var(--fg-dim);margin-bottom:8px;">
        Перехоплений шістнадцятковий шифротекст (HEX):
      </div>
      <pre style="background:#000;border:1px solid var(--fg-dim);padding:10px;color:var(--fg-bright);font-size:12px;word-break:break-all;white-space:pre-wrap;">${escapeHtml(hex)}</pre>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструмент: Калькулятор побітової операції XOR (K = C ^ P)</h2>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;line-height:1.6;">
          Відомий префікс відкритого тексту: <code>${escapeHtml(knownHeader)}</code> (довжина ключа: ${keyLength} байти).<br>
          Введіть відповідні байти для обчислення значення ключа:
        </div>

        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px;">
          <div style="flex:1;min-width:140px;">
            <label>Байт шифротексту C (HEX):</label>
            <input type="text" id="xor-byte-c" placeholder="наприклад: 08">
          </div>
          <div style="flex:1;min-width:140px;">
            <label>Символ відкритого тексту P:</label>
            <input type="text" id="xor-char-p" maxlength="1" placeholder="наприклад: C">
          </div>
          <button id="xor-calc-btn">Обчислити XOR</button>
        </div>

        <div id="xor-result-box" style="background:#000;border:1px solid var(--fg-dim);padding:8px 12px;font-size:12px;color:var(--fg-bright);display:none;"></div>
      </div>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Розшифрування повідомлення:</h2>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <label>Визначений 4-байтовий ключ (ASCII):</label>
            <input type="text" id="crypto-key-input" maxlength="4" placeholder="Введіть 4-значний ключ">
          </div>
          <button id="crypto-decrypt-btn">Розшифрувати шифротекст</button>
        </div>

        <div style="margin-top:12px;display:none;" id="crypto-decrypted-wrap">
          <label>Розшифроване повідомлення:</label>
          <div class="cmd-output" id="crypto-decrypted-output" style="color:var(--fg-bright);background:#000;border:1px solid var(--fg);padding:10px;margin-top:6px;word-break:break-all;"></div>
        </div>
      </div>

      <div class="card" style="margin-top:14px;border-color:var(--fg-dim);">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструкція аудитора:</h2>
        <div style="font-size:12px;color:var(--fg-bright);line-height:1.6;">
          Визначивши 4-значний ключ операцією $K = C \oplus P$, введіть його та натисніть «Розшифрувати шифротекст». Отримане повідомлення містить безпосередній рядок <code>C2_COMMAND_TOKEN:FLAG{...}</code>. Скопіюйте прапорець та надішліть його у вкладці «Опис».
        </div>
      </div>
    </div>
  `;

  const byteCIn = container.querySelector("#xor-byte-c");
  const charPIn = container.querySelector("#xor-char-p");
  const resBox = container.querySelector("#xor-result-box");

  container.querySelector("#xor-calc-btn").addEventListener("click", () => {
    const cHex = byteCIn.value.trim();
    const pChar = charPIn.value;
    if (!cHex || !pChar) return;

    const cVal = parseInt(cHex, 16);
    const pVal = pChar.charCodeAt(0);
    if (isNaN(cVal)) {
      resBox.style.display = "block";
      resBox.textContent = "Невірний шістнадцятковий байт C.";
      return;
    }

    const kVal = cVal ^ pVal;
    const kChar = (kVal >= 32 && kVal <= 126) ? String.fromCharCode(kVal) : "\\x" + kVal.toString(16).padStart(2, "0");
    const kHex = kVal.toString(16).padStart(2, "0").toUpperCase();

    resBox.style.display = "block";
    resBox.innerHTML = `
      C = 0x${cHex.toUpperCase()} (${cVal}) &oplus; P = '${escapeHtml(pChar)}' (0x${pVal.toString(16).toUpperCase()}) =
      <strong>K = 0x${kHex} (Символ: '${escapeHtml(kChar)}')</strong>
    `;
  });

  const keyInput = container.querySelector("#crypto-key-input");
  const decWrap = container.querySelector("#crypto-decrypted-wrap");
  const decOut = container.querySelector("#crypto-decrypted-output");

  container.querySelector("#crypto-decrypt-btn").addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) return;
    const { data: res } = await API.post(`/api/lab/${labId}/decrypt`, { key });
    if (res.decrypted) {
      decWrap.style.display = "block";
      decOut.textContent = res.decrypted;
      if (res.decrypted.includes("FLAG{")) {
        onSolved();
      }
    }
  });
}

// ---------------------------------------------------------------- crypto-3 (Weak RSA)
async function initRsaConsole(container, labId, onSolved) {
  const { data: params } = await API.get(`/api/lab/${labId}/params`);
  const n = params.n || 899501;
  const e = params.e || 65537;
  const ciphertext = params.ciphertext || [];

  function gcdExtended(a, b) {
    if (a === 0) return [b, 0, 1];
    const [gcd, x1, y1] = gcdExtended(b % a, a);
    const x = y1 - Math.floor(b / a) * x1;
    const y = x1;
    return [gcd, x, y];
  }

  function modInverse(a, m) {
    const [g, x] = gcdExtended(a, m);
    if (g !== 1) return null;
    return (x % m + m) % m;
  }

  container.innerHTML = `
    <div class="cmd-terminal">
      <div style="font-size:12px;color:var(--fg-dim);margin-bottom:8px;">
        Відкриті параметри RSA та зашифровані блоки повідомлення:
      </div>
      <pre style="background:#000;border:1px solid var(--fg-dim);padding:10px;color:var(--fg-bright);font-size:12px;word-break:break-all;white-space:pre-wrap;">Модуль N = ${n}
Відкрита експонента e = ${e}
Зашифровані блоки C: [${ciphertext.slice(0, 10).join(", ")} ... total ${ciphertext.length} blocks]</pre>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Крок 1: Факторизація слабкого модуля N</h2>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;">
          Знайдіть прості співмножники p та q (N = p * q) за допомогою алгоритму факторизації:
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <button id="rsa-factor-btn">Факторизувати модуль N (${n})</button>
        </div>
        <div id="rsa-factors-out" style="margin-top:10px;display:none;background:#000;border:1px solid var(--fg);padding:8px;font-size:12px;color:var(--fg-bright);"></div>
      </div>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Крок 2: Розрахунок функції Ейлера phi(N) та закритого ключа d</h2>
        <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;">
          Формула: phi(N) = (p - 1) * (q - 1). Потім розрахуйте d = e^(-1) mod phi(N):
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <button id="rsa-calc-d-btn" disabled>Розрахувати закритий ключ d</button>
        </div>
        <div id="rsa-d-out" style="margin-top:10px;display:none;background:#000;border:1px solid var(--fg);padding:8px;font-size:12px;color:var(--fg-bright);"></div>
      </div>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">Крок 3: Розшифрування блоків шифротексту</h2>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <label>Закритий ключ d:</label>
            <input type="text" id="rsa-d-input" placeholder="Введіть розрахований ключ d">
          </div>
          <button id="rsa-decrypt-btn">Розшифрувати RSA</button>
        </div>

        <div style="margin-top:12px;display:none;" id="rsa-decrypted-wrap">
          <label>Розшифроване повідомлення:</label>
          <pre id="rsa-decrypted-text" style="background:#000;border:1px solid var(--fg);padding:10px;color:var(--fg-bright);font-size:12px;word-break:break-all;white-space:pre-wrap;"></pre>
        </div>
      </div>

      <div class="card" style="margin-top:14px;border-color:var(--fg-dim);">
        <h2 style="font-size:12px;margin-bottom:6px;">Інструкція аудитора:</h2>
        <div style="font-size:12px;color:var(--fg-bright);line-height:1.6;">
          Розрахувавши закритий ключ $d$, виконайте дешифрування блоків. Отриманий відкритий текст містить рядок <code>RSA_SECRET:FLAG{...}</code>. Скопіюйте знайдений прапорець та надішліть його у вкладці «Опис».
        </div>
      </div>
    </div>
  `;

  let foundP = null;
  let foundQ = null;
  let foundPhi = null;
  let foundD = null;

  const factorBtn = container.querySelector("#rsa-factor-btn");
  const factorsOut = container.querySelector("#rsa-factors-out");
  const calcDBtn = container.querySelector("#rsa-calc-d-btn");
  const dOut = container.querySelector("#rsa-d-out");
  const dInput = container.querySelector("#rsa-d-input");
  const decWrap = container.querySelector("#rsa-decrypted-wrap");
  const decText = container.querySelector("#rsa-decrypted-text");

  factorBtn.addEventListener("click", () => {
    let p = 2;
    while (p * p <= n) {
      if (n % p === 0) {
        foundP = p;
        foundQ = Math.floor(n / p);
        break;
      }
      p++;
    }

    factorsOut.style.display = "block";
    factorsOut.innerHTML = `
      [+] Факторизацію успішно виконано!<br>
      <strong>p = ${foundP}</strong><br>
      <strong>q = ${foundQ}</strong> (перевірка: ${foundP} * ${foundQ} = ${foundP * foundQ})
    `;
    calcDBtn.disabled = false;
  });

  calcDBtn.addEventListener("click", () => {
    foundPhi = (foundP - 1) * (foundQ - 1);
    foundD = modInverse(e, foundPhi);

    dOut.style.display = "block";
    dOut.innerHTML = `
      phi(N) = (${foundP} - 1) * (${foundQ} - 1) = ${foundPhi}<br>
      <strong>d &equiv; ${e}<sup>-1</sup> (mod ${foundPhi}) = ${foundD}</strong>
    `;
    dInput.value = foundD;
  });

  container.querySelector("#rsa-decrypt-btn").addEventListener("click", async () => {
    const dVal = parseInt(dInput.value.trim(), 10);
    if (!dVal) return;

    const { data: res } = await API.post(`/api/lab/${labId}/decrypt`, { d: dVal });
    if (res.decrypted) {
      decWrap.style.display = "block";
      decText.textContent = res.decrypted;
      if (res.decrypted.includes("FLAG{")) {
        onSolved();
      }
    }
  });
}
