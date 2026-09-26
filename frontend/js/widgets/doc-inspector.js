function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function initDocInspector(container, labId, onSolved) {
  if (labId === "forensics3") {
    return initMemoryInspector(container, labId, onSolved);
  }
  return initWin98Desktop(container, labId, onSolved);
}

// =========================================================================
// WINDOWS 98 DESKTOP WORKSTATION (forensics1, forensics2, forensics4)
// =========================================================================
async function initWin98Desktop(container, labId, onSolved) {
  // Preload data
  let docxSamples = [];
  let pdfSamples = [];
  let metadataFiles = [];

  try {
    const { data: d1 } = await API.get("/api/lab/forensics1/samples");
    docxSamples = d1.samples || [];
  } catch (e) {}

  try {
    const { data: d2 } = await API.get("/api/lab/forensics2/samples");
    pdfSamples = d2.samples || [];
  } catch (e) {}

  try {
    const { data: d4 } = await API.get("/api/lab/forensics4/files");
    metadataFiles = d4.files || [];
  } catch (e) {}

  const ICONS_SVG = {
    myComp: `<svg viewBox="0 0 32 32"><rect x="4" y="3" width="24" height="18" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="7" y="6" width="18" height="12" fill="#000080"/><path d="M12 21 L8 27 L24 27 L20 21 Z" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="6" y="27" width="20" height="2" fill="#808080"/></svg>`,
    recycle: `<svg viewBox="0 0 32 32"><path d="M8 8 L24 8 L21 28 L11 28 Z" fill="#c0c0c0" stroke="#000" stroke-width="1.5"/><rect x="6" y="5" width="20" height="3" fill="#808080" stroke="#000" stroke-width="1"/><path d="M13 12 L13 24 M16 12 L16 24 M19 12 L19 24" stroke="#008000" stroke-width="2"/></svg>`,
    wordDoc: `<svg viewBox="0 0 32 32"><path d="M6 3 L20 3 L26 9 L26 29 L6 29 Z" fill="#ffffff" stroke="#000" stroke-width="1.5"/><path d="M20 3 L20 9 L26 9 Z" fill="#c0c0c0" stroke="#000" stroke-width="1"/><rect x="4" y="9" width="12" height="12" fill="#000080"/><text x="6" y="19" fill="#ffffff" font-size="11" font-weight="bold" font-family="Arial">W</text><line x1="18" y1="13" x2="23" y2="13" stroke="#808080" stroke-width="1.5"/><line x1="18" y1="17" x2="23" y2="17" stroke="#808080" stroke-width="1.5"/><line x1="9" y1="24" x2="23" y2="24" stroke="#808080" stroke-width="1.5"/></svg>`,
    pdfDoc: `<svg viewBox="0 0 32 32"><path d="M6 3 L20 3 L26 9 L26 29 L6 29 Z" fill="#ffffff" stroke="#000" stroke-width="1.5"/><path d="M20 3 L20 9 L26 9 Z" fill="#c0c0c0" stroke="#000" stroke-width="1"/><rect x="4" y="9" width="14" height="12" fill="#cc0000"/><text x="5" y="19" fill="#ffffff" font-size="9" font-weight="bold" font-family="Arial">PDF</text><line x1="10" y1="24" x2="23" y2="24" stroke="#808080" stroke-width="1.5"/></svg>`,
    imgDoc: `<svg viewBox="0 0 32 32"><rect x="4" y="5" width="24" height="22" fill="#ffffff" stroke="#000" stroke-width="1.5"/><rect x="6" y="7" width="20" height="18" fill="#ffd700"/><circle cx="11" cy="12" r="2.5" fill="#ff4500"/><polygon points="8,23 15,14 19,19 23,13 25,23" fill="#228b22"/></svg>`,
    txtDoc: `<svg viewBox="0 0 32 32"><path d="M6 3 L20 3 L26 9 L26 29 L6 29 Z" fill="#ffffff" stroke="#000" stroke-width="1.5"/><line x1="9" y1="12" x2="23" y2="12" stroke="#000" stroke-width="1.5"/><line x1="9" y1="16" x2="23" y2="16" stroke="#000" stroke-width="1.5"/><line x1="9" y1="20" x2="23" y2="20" stroke="#000" stroke-width="1.5"/><line x1="9" y1="24" x2="18" y2="24" stroke="#000" stroke-width="1.5"/></svg>`,
    winLogo: `<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1" y="1" width="6" height="6" fill="#ff3333"/><rect x="8" y="1" width="6" height="6" fill="#33cc33"/><rect x="1" y="8" width="6" height="6" fill="#3366ff"/><rect x="8" y="8" width="6" height="6" fill="#ffcc00"/></svg>`,
  };

  const desktopIcons = [
    { id: "mycomp", name: "Мій комп'ютер", svg: ICONS_SVG.myComp, type: "system" },
    { id: "scan_invoice", name: "scan_audit_invoice.jpg", svg: ICONS_SVG.imgDoc, type: "meta" },
    { id: "annual_summary", name: "annual_summary_clean.png", svg: ICONS_SVG.imgDoc, type: "meta" },
    { id: "docx_suspicious", name: "sample_suspicious.docx", svg: ICONS_SVG.wordDoc, type: "docx", sampleId: "suspicious" },
    { id: "docx_clean", name: "sample_clean.docx", svg: ICONS_SVG.wordDoc, type: "docx", sampleId: "clean" },
    { id: "pdf_suspicious", name: "sample_suspicious.pdf", svg: ICONS_SVG.pdfDoc, type: "pdf", sampleId: "suspicious" },
    { id: "pdf_clean", name: "sample_clean.pdf", svg: ICONS_SVG.pdfDoc, type: "pdf", sampleId: "clean" },
    { id: "readme", name: "README.txt", svg: ICONS_SVG.txtDoc, type: "readme" },
    { id: "recycle", name: "Кошик", svg: ICONS_SVG.recycle, type: "recycle" },
  ];

  const windows = {};
  let activeWinId = null;
  let topZ = 20;

  // Determine initial open window based on current challenge lab
  let defaultOpen = "docx_suspicious";
  if (labId === "forensics4") defaultOpen = "scan_invoice";
  if (labId === "forensics2") defaultOpen = "pdf_suspicious";

  function getClockStr() {
    const d = new Date();
    return d.toLocaleTimeString().slice(0, 5);
  }

  function renderDesktop() {
    container.innerHTML = `
      <div class="win98-desktop" id="win98-root">
        <div class="win98-icons">
          ${desktopIcons.map((ic) => `
            <div class="win98-icon" data-id="${ic.id}">
              ${ic.svg}
              <div class="win98-icon-label">${escapeHtml(ic.name)}</div>
            </div>
          `).join("")}
        </div>

        <div id="win98-windows-slot"></div>

        <div class="win98-taskbar">
          <button class="win98-start-btn" id="win98-start-btn">
            ${ICONS_SVG.winLogo}
            <strong>Пуск</strong>
          </button>
          <div class="win98-taskbar-tasks" id="win98-taskbar-tasks"></div>
          <div class="win98-tray">
            <svg width="14" height="12" viewBox="0 0 16 16"><path d="M2 5 L6 5 L10 1 L10 15 L6 11 L2 11 Z" fill="#000"/><path d="M12 4 C14 6 14 10 12 12" stroke="#000" stroke-width="1.5" fill="none"/></svg>
            <span id="win98-clock">${getClockStr()}</span>
          </div>
        </div>
      </div>
    `;

    // Bind icons
    container.querySelectorAll(".win98-icon").forEach((el) => {
      el.addEventListener("click", () => {
        container.querySelectorAll(".win98-icon").forEach((i) => i.classList.remove("selected"));
        el.classList.add("selected");
        openWindow(el.dataset.id);
      });
    });

    setInterval(() => {
      const clockEl = container.querySelector("#win98-clock");
      if (clockEl) clockEl.textContent = getClockStr();
    }, 10000);
  }

  function updateTaskbar() {
    const tasksEl = container.querySelector("#win98-taskbar-tasks");
    if (!tasksEl) return;
    tasksEl.innerHTML = Object.entries(windows).map(([id, win]) => `
      <button class="win98-task-btn ${activeWinId === id ? "active" : ""}" data-id="${id}">
        ${escapeHtml(win.title)}
      </button>
    `).join("");

    tasksEl.querySelectorAll(".win98-task-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        if (windows[id]) {
          focusWindow(id);
        }
      });
    });
  }

  function focusWindow(winId) {
    activeWinId = winId;
    topZ++;
    const slot = container.querySelector("#win98-windows-slot");
    if (!slot) return;
    slot.querySelectorAll(".win98-window").forEach((w) => {
      w.classList.toggle("active", w.dataset.winId === winId);
      if (w.dataset.winId === winId) {
        w.style.zIndex = topZ;
        w.style.display = "flex";
      }
    });
    updateTaskbar();
  }

  function closeWindow(winId) {
    delete windows[winId];
    const el = container.querySelector(`.win98-window[data-winId="${winId}"]`);
    if (el) el.remove();
    const remaining = Object.keys(windows);
    activeWinId = remaining.length ? remaining[remaining.length - 1] : null;
    if (activeWinId) focusWindow(activeWinId); else updateTaskbar();
  }

  async function openWindow(iconId) {
    if (windows[iconId]) {
      focusWindow(iconId);
      return;
    }

    const ic = desktopIcons.find((i) => i.id === iconId);
    if (!ic) return;

    let title = ic.name;
    let bodyHtml = "";
    let width = 560;
    let height = 430;
    let top = 25;
    let left = 40;

    if (ic.type === "meta") {
      title = `Властивості: ${ic.name}`;
      const fData = metadataFiles.find((m) => m.filename === ic.name) || metadataFiles[0];
      bodyHtml = renderMetaContent(fData);
      width = 540;
      height = 420;
    } else if (ic.type === "docx") {
      title = `Microsoft Word 97 - [${ic.name}]`;
      const cur = docxSamples.find((s) => s.id === ic.sampleId) || docxSamples[0];
      bodyHtml = renderDocxContent(cur);
      width = 620;
      height = 450;
      left = 20;
    } else if (ic.type === "pdf") {
      title = `Acrobat Reader 4.0 - [${ic.name}]`;
      const cur = pdfSamples.find((s) => s.id === ic.sampleId) || pdfSamples[0];
      bodyHtml = renderPdfContent(cur);
      width = 620;
      height = 450;
      left = 30;
    } else if (ic.type === "readme") {
      title = `Блокнот - [README.txt]`;
      bodyHtml = `
        <div style="font-family:'Courier New', monospace;font-size:12px;padding:8px;line-height:1.6;">
          === ІНСТРУКЦІЯ ЕКСПЕРТА КІБЕРБЕЗПЕКИ ===<br><br>
          1. Для завдання Forensics-4: Дослідіть властивості 'scan_audit_invoice.jpg'. У вкладці EXIF знайдіть прихований токен.<br>
          2. Для завдання Forensics-1: Відкрийте 'sample_suspicious.docx'. Дослідіть файл зв'язків 'word/_rels/document.xml.rels' та знайдіть URL зовнішнього шаблону (.dotm).<br>
          3. Для завдання Forensics-2: Відкрийте 'sample_suspicious.pdf'. Дослідіть Об'єкт №5 з директивою /JavaScript та витягніть токен експлойту.<br><br>
          Усі знахідки здаються безпосередньо у відповідних діалогових вікнах!
        </div>
      `;
      width = 480;
      height = 320;
      top = 50;
      left = 60;
    } else if (ic.type === "mycomp") {
      title = "Властивості системи";
      bodyHtml = `
        <div style="padding:12px;font-size:12px;line-height:1.7;">
          <div style="font-weight:bold;margin-bottom:8px;">Microsoft Windows 98 SE</div>
          <div style="color:#555;margin-bottom:12px;">Версія 4.10.2222 A (Cyber Forensics Edition)</div>
          <hr style="border:none;border-top:1px solid #c0c0c0;margin-bottom:12px;">
          <div><strong>Робоча станція аудиту:</strong> SEC-DIAG-WS01</div>
          <div><strong>Процесор:</strong> Intel Pentium II 450 MHz MMX</div>
          <div><strong>Оперативна пам'ять:</strong> 128 MB SDRAM</div>
          <div><strong>Дискові накопичувачі:</strong> C: (FAT32, 8.4 GB), D: (CD-ROM)</div>
        </div>
      `;
      width = 400;
      height = 280;
      top = 60;
      left = 80;
    } else if (ic.type === "recycle") {
      title = "Кошик";
      bodyHtml = `<div style="padding:20px;text-align:center;color:#555;font-size:12px;">Кошик порожній. Усі вилучені файли поміщено в ізольовану теку аудиту.</div>`;
      width = 380;
      height = 220;
      top = 70;
      left = 90;
    }

    windows[iconId] = { title, iconId };

    const winEl = document.createElement("div");
    winEl.className = "win98-window";
    winEl.dataset.winId = iconId;
    winEl.style.width = width + "px";
    winEl.style.height = height + "px";
    winEl.style.top = top + "px";
    winEl.style.left = left + "px";

    winEl.innerHTML = `
      <div class="win98-titlebar">
        <div class="win98-title-left">
          <span>${escapeHtml(title)}</span>
        </div>
        <div class="win98-title-controls">
          <button class="win98-title-btn btn-min">_</button>
          <button class="win98-title-btn btn-max">&#9633;</button>
          <button class="win98-title-btn btn-close">&times;</button>
        </div>
      </div>
      <div class="win98-menubar">
        <span><u>Ф</u>айл</span>
        <span><u>П</u>равка</span>
        <span><u>В</u>игляд</span>
        <span><u>Д</u>овідка</span>
      </div>
      <div class="win98-body">
        ${bodyHtml}
      </div>
    `;

    const slot = container.querySelector("#win98-windows-slot");
    slot.appendChild(winEl);

    // Window controls
    winEl.querySelector(".btn-close").addEventListener("click", () => closeWindow(iconId));
    winEl.querySelector(".btn-min").addEventListener("click", () => {
      winEl.style.display = "none";
      updateTaskbar();
    });
    winEl.querySelector(".btn-max").addEventListener("click", () => {
      if (winEl.dataset.maxed === "1") {
        winEl.style.width = width + "px";
        winEl.style.height = height + "px";
        winEl.style.top = top + "px";
        winEl.style.left = left + "px";
        winEl.dataset.maxed = "0";
      } else {
        winEl.style.width = "calc(100% - 4px)";
        winEl.style.height = "calc(100% - 36px)";
        winEl.style.top = "2px";
        winEl.style.left = "2px";
        winEl.dataset.maxed = "1";
      }
    });

    winEl.addEventListener("mousedown", () => focusWindow(iconId));

    // Attach dynamic logic for content
    if (ic.type === "meta") {
      bindMetaLogic(winEl, ic.name);
    } else if (ic.type === "docx") {
      bindDocxLogic(winEl, ic.sampleId);
    } else if (ic.type === "pdf") {
      bindPdfLogic(winEl, ic.sampleId);
    }

    focusWindow(iconId);
  }

  // --- Content Renderers ---
  function renderMetaContent(fileData) {
    if (!fileData) return "<div>Дані недоступні</div>";
    const exif = fileData.exif || {};
    return `
      <div style="font-size:11.5px;">
        <div style="display:flex;gap:6px;border-bottom:2px groove #fff;padding-bottom:6px;margin-bottom:8px;">
          <span style="background:#c0c0c0;border:1.5px outset #fff;padding:2px 8px;font-weight:bold;">Зведення (EXIF)</span>
        </div>

        <div style="background:#f7f7f7;border:1px solid #808080;padding:8px;margin-bottom:10px;line-height:1.6;">
          <div><strong>Назва файлу:</strong> ${escapeHtml(fileData.filename)}</div>
          <div><strong>Розмір:</strong> ${escapeHtml(fileData.size)}</div>
          <div><strong>Тип файлу:</strong> ${escapeHtml(fileData.type)}</div>
          <div><strong>Сигнатура (Magic Bytes):</strong> <code>${escapeHtml(fileData.magic_bytes)}</code></div>
          <div><strong>Опис:</strong> ${escapeHtml(fileData.description)}</div>
        </div>

        <div style="background:#fff;border:2px inset #fff;padding:8px;margin-bottom:10px;line-height:1.6;max-height:150px;overflow-y:auto;">
          <div style="font-weight:bold;color:#000080;margin-bottom:4px;">Теги метаданих (EXIF Tags):</div>
          ${Object.entries(exif).map(([k, v]) => `
            <div><strong>${escapeHtml(k)}:</strong> <span style="${k.includes('Comment') ? 'color:#990000;font-weight:bold;' : ''}">${escapeHtml(v)}</span></div>
          `).join("")}
        </div>

        <div style="background:#e8e8e8;border:1.5px groove #fff;padding:8px;font-size:11.5px;">
          <strong>Інструкція аудитора:</strong> Знайдений у метаданих EXIF (поле <code>UserComment</code>) прапорець <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
        </div>
      </div>
    `;
  }

  function bindMetaLogic(winEl, filename) {
    // No secondary submit form needed; flag is in the metadata
  }

  function renderDocxContent(sample) {
    const files = sample.files || [];
    return `
      <div style="font-size:11.5px;display:flex;flex-direction:column;height:100%;">
        <div style="background:#e8e8e8;border:1px solid #808080;padding:6px;margin-bottom:8px;">
          <strong>Результати статичного аналізу:</strong>
          ${(sample.analysis?.findings || []).map((f) => `<div style="color:#990000;font-weight:bold;">&bull; ${escapeHtml(f)}</div>`).join("")}
        </div>

        <div style="display:grid;grid-template-columns:220px 1fr;gap:8px;flex:1;min-height:180px;">
          <div style="background:#fff;border:2px inset #fff;padding:6px;overflow-y:auto;">
            <div style="font-weight:bold;margin-bottom:6px;color:#000080;">Дерево архіву ZIP (OOXML):</div>
            <div class="docx-file-list">
              ${files.map((f) => `
                <div class="docx-file-entry" data-file="${escapeHtml(f)}" style="padding:2px 4px;cursor:pointer;${f === 'word/_rels/document.xml.rels' ? 'font-weight:bold;color:#990000;' : ''}">
                  &boxur; ${escapeHtml(f)}
                </div>
              `).join("")}
            </div>
          </div>

          <div style="background:#fff;border:2px inset #fff;padding:6px;display:flex;flex-direction:column;">
            <div style="font-weight:bold;font-size:11px;margin-bottom:4px;" class="docx-viewing-title">Перегляд: word/_rels/document.xml.rels</div>
            <textarea class="docx-content-area" readonly style="flex:1;width:100%;font-family:'Consolas','Courier New',monospace;font-size:11px;border:none;background:#fff;color:#000;resize:none;outline:none;white-space:pre-wrap;"></textarea>
          </div>
        </div>

        <div style="background:#e8e8e8;border:1.5px groove #fff;padding:8px;margin-top:8px;font-size:11.5px;">
          <strong>Інструкція аудитора:</strong> Дослідіть файл зв'язків <code>word/_rels/document.xml.rels</code>. Знайдений у цільовій адресі шаблону прапорець <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
        </div>
      </div>
    `;
  }

  function bindDocxLogic(winEl, sampleId) {
    const list = winEl.querySelectorAll(".docx-file-entry");
    const area = winEl.querySelector(".docx-content-area");
    const titleEl = winEl.querySelector(".docx-viewing-title");

    async function loadFile(fName) {
      if (titleEl) titleEl.textContent = "Перегляд: " + fName;
      if (area) {
        area.value = "Завантаження...";
        const { data: res } = await API.get(`/api/lab/forensics1/file?sample_id=${sampleId}&filepath=${encodeURIComponent(fName)}`);
        area.value = res.content || "(порожній вміст)";
      }
    }

    list.forEach((item) => {
      item.addEventListener("click", () => {
        list.forEach((i) => i.style.background = "");
        item.style.background = "#000080";
        item.style.color = "#ffffff";
        loadFile(item.dataset.file);
      });
    });

    loadFile("word/_rels/document.xml.rels");
  }

  function renderPdfContent(sample) {
    const objs = sample.objects || [];
    return `
      <div style="font-size:11.5px;display:flex;flex-direction:column;height:100%;">
        <div style="background:#e8e8e8;border:1px solid #808080;padding:6px;margin-bottom:8px;">
          <strong>Результати статичного аналізу PDF:</strong>
          ${(sample.analysis?.findings || []).map((f) => `<div style="color:#990000;font-weight:bold;">&bull; ${escapeHtml(f)}</div>`).join("")}
        </div>

        <div style="display:grid;grid-template-columns:220px 1fr;gap:8px;flex:1;min-height:180px;">
          <div style="background:#fff;border:2px inset #fff;padding:6px;overflow-y:auto;">
            <div style="font-weight:bold;margin-bottom:6px;color:#000080;">Об'єкти документа PDF:</div>
            <div class="pdf-obj-list">
              ${objs.map((o) => `
                <div class="pdf-obj-entry" data-id="${o.id}" style="padding:2px 4px;cursor:pointer;${o.type.includes('JavaScript') ? 'font-weight:bold;color:#990000;' : ''}">
                  &bull; Об'єкт ${o.id} (${escapeHtml(o.type)})
                </div>
              `).join("")}
            </div>
          </div>

          <div style="background:#fff;border:2px inset #fff;padding:6px;display:flex;flex-direction:column;">
            <div style="font-weight:bold;font-size:11px;margin-bottom:4px;" class="pdf-viewing-title">Перегляд: Об'єкт 5</div>
            <textarea class="pdf-content-area" readonly style="flex:1;width:100%;font-family:'Consolas','Courier New',monospace;font-size:11px;border:none;background:#fff;color:#000;resize:none;outline:none;white-space:pre-wrap;"></textarea>
          </div>
        </div>

        <div style="background:#e8e8e8;border:1.5px groove #fff;padding:8px;margin-top:8px;font-size:11.5px;">
          <strong>Інструкція аудитора:</strong> Оберіть Об'єкт 5 (потік <code>/Action /JavaScript</code>). Знайдений у виклику <code>app.alert</code> прапорець <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
        </div>
      </div>
    `;
  }

  function bindPdfLogic(winEl, sampleId) {
    const list = winEl.querySelectorAll(".pdf-obj-entry");
    const area = winEl.querySelector(".pdf-content-area");
    const titleEl = winEl.querySelector(".pdf-viewing-title");

    async function loadObj(objId) {
      if (titleEl) titleEl.textContent = "Перегляд: Об'єкт " + objId;
      if (area) {
        area.value = "Завантаження...";
        const { data: res } = await API.get(`/api/lab/forensics2/object?sample_id=${sampleId}&obj_id=${objId}`);
        area.value = res.content || "(порожній вміст)";
      }
    }

    list.forEach((item) => {
      item.addEventListener("click", () => {
        list.forEach((i) => i.style.background = "");
        item.style.background = "#000080";
        item.style.color = "#ffffff";
        loadObj(item.dataset.id);
      });
    });

    loadObj(5);
  }

  renderDesktop();
  openWindow(defaultOpen);
}

// =========================================================================
// MEMORY FORENSICS REPORT INSPECTOR (forensics3)
// =========================================================================
async function initMemoryInspector(container, labId, onSolved) {
  const { data: report } = await API.get(`/api/lab/${labId}/report`);
  const pslist = report.pslist || [];
  const malfind = report.malfind || [];
  const netscan = report.netscan || [];

  container.innerHTML = `
    <div class="cmd-terminal">
      <div style="font-size:12px;color:var(--fg-dim);margin-bottom:8px;">
        Звіт аналізу дампу оперативної пам'яті (Volatility Framework):
      </div>

      <div class="card" style="margin-top:12px;">
        <h2 style="font-size:12px;margin-bottom:6px;">1. Дерево процесів (pslist):</h2>
        <table class="pv-table">
          <thead>
            <tr><th>PID</th><th>PPID</th><th>Ім'я процесу</th><th>Потоки</th><th>Час запуску</th></tr>
          </thead>
          <tbody>
            ${pslist.map((p) => `
              <tr>
                <td>${p.pid}</td><td>${p.ppid}</td>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${p.threads}</td><td>${p.created}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">2. Підозрілі ділянки виділеної пам'яті (malfind):</h2>
        <table class="pv-table">
          <thead>
            <tr><th>PID</th><th>Процес</th><th>VAD Tag</th><th>Права захисту</th><th>Початкова адреса</th><th>Дамп коду</th></tr>
          </thead>
          <tbody>
            ${malfind.map((m) => `
              <tr style="${m.protection.includes('EXECUTE_READWRITE') ? 'background:rgba(255,50,50,0.15);' : ''}">
                <td><strong>${m.pid}</strong></td>
                <td>${escapeHtml(m.process)}</td>
                <td>${m.vad_tag}</td>
                <td style="color:#f87171;font-weight:bold;">${m.protection}</td>
                <td><code>${m.start_address}</code></td>
                <td><code>${escapeHtml(m.hexdump)}</code></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:14px;">
        <h2 style="font-size:12px;margin-bottom:6px;">3. Мережеві з'єднання процесів (netscan):</h2>
        <table class="pv-table">
          <thead>
            <tr><th>PID</th><th>Власник</th><th>Локальна адреса</th><th>Зовнішня адреса (Foreign)</th><th>Стан</th></tr>
          </thead>
          <tbody>
            ${netscan.map((n) => `
              <tr style="${n.foreign.includes('185.220') ? 'background:rgba(255,50,50,0.15);' : ''}">
                <td><strong>${n.pid}</strong></td>
                <td>${escapeHtml(n.owner)}</td>
                <td>${n.local}</td>
                <td><strong style="color:var(--fg-bright);">${n.foreign}</strong></td>
                <td>${n.state}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
        <strong>Інструкція аудитора:</strong> Дослідіть дерево процесів та ін'єктовану область пам'яті у звіті <code>malfind</code> для процесу з захистом <code>PAGE_EXECUTE_READWRITE</code>. Знайдений у дампа прапорець <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
      </div>
    </div>
  `;
}
