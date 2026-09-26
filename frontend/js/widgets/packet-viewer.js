function hexToAscii(hexStr) {
  const clean = hexStr.replace(/[^0-9a-fA-F]/g, "");
  let str = "";
  for (let i = 0; i < clean.length; i += 2) {
    const code = parseInt(clean.substr(i, 2), 16);
    if (!isNaN(code)) {
      str += String.fromCharCode(code);
    }
  }
  return str;
}

async function initPacketViewer(container, labId, onSolved) {
  const { data } = await API.get(`/api/lab/${labId}/packets`);
  const packets = data.packets || [];
  const isTls = labId === "traffic2";
  const isDnsTunnel = labId === "traffic3";
  const isIcmpTunnel = labId === "traffic4";
  const picked = new Set();

  function renderTable(filter) {
    const filtered = packets.filter(
      (p) => !filter || JSON.stringify(p).toLowerCase().includes(filter.toLowerCase())
    );

    const rows = filtered.map((p) => {
      const isPicked = picked.has(p.no);
      const cbCol = isTls
        ? `<td style="text-align:center;width:40px;">
             <input type="checkbox" class="pkt-checkbox" data-no="${p.no}" ${isPicked ? "checked" : ""} style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent);">
           </td>`
        : "";

      return `
        <tr class="pkt-row ${isPicked ? "picked" : ""}" data-no="${p.no}">
          ${cbCol}
          <td>${p.no}</td>
          <td>${p.time}</td>
          <td>${p.src}</td>
          <td>${p.dst}</td>
          <td>${p.proto}</td>
          <td>${p.length}</td>
          <td>${escapeHtml(p.info)}</td>
        </tr>`;
    }).join("");

    const thCb = isTls ? `<th style="width:40px;text-align:center;">Вибір</th>` : "";

    return `
      <table class="pv-table">
        <thead>
          <tr>
            ${thCb}
            <th>No.</th>
            <th>Time</th>
            <th>Source</th>
            <th>Destination</th>
            <th>Protocol</th>
            <th>Length</th>
            <th>Info</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderDetail(pkt) {
    if (!pkt) return "";
    const tree = `
      <div>Frame ${pkt.no}: ${pkt.length} bytes</div>
      <div>Ethernet II</div>
      <div>&nbsp;&nbsp;Internet Protocol, Src: ${pkt.src}, Dst: ${pkt.dst}</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;Transport Layer (${pkt.proto})</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${pkt.proto}: ${escapeHtml(pkt.info)}</div>
    `;
    const hexBlock = pkt.hex
      ? `<div class="pv-hexdump">
           <pre>${(pkt.hex.match(/.{1,2}/g) || []).join(" ")}</pre>
           <pre>${escapeHtml(pkt.ascii || "")}</pre>
         </div>`
      : `<div style="color:var(--fg-dim);margin-top:8px;">(корисне навантаження зашифроване або відсутнє у службовому пакеті)</div>`;
    return `<div class="pv-detail">${tree}${hexBlock}</div>`;
  }

  function draw(filter, selectedNo) {
    let inputFormHtml = "";
    if (isTls) {
      inputFormHtml = `
        <div style="margin-top:14px;">
          <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:8px;">
            Позначте квадратиками [ ] пакети фази TLS-рукостискання (Client Hello / Server Hello / Change Cipher Spec) та підтвердіть вибір:
          </div>
          <button id="pv-confirm">Підтвердити валідацію рукостискання</button>
        </div>
        <div id="pv-answer-out"></div>
        <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
          <strong>Інструкція аудитора:</strong> Після успішної валідації рукостискання скопіюйте розшифрований прапорець <code>FLAG{...}</code> та введіть його у форму 'Submit Flag' на вкладці 'Бриф'.
        </div>`;
    } else if (isDnsTunnel) {
      inputFormHtml = `
        <div class="card" style="margin-top:16px;">
          <h2 style="font-size:12px;margin-bottom:6px;">Інструмент: Декодер шістнадцяткових значень (HEX -> ASCII)</h2>
          <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;">
            Використовуйте конвертер для декодування виявлених шістнадцяткових фрагментів із DNS-запитів:
          </div>
          <div style="display:flex;gap:8px;">
            <input type="text" id="hex-tool-input" placeholder="Введіть HEX-рядок (наприклад: 464c4147)">
            <button id="hex-tool-btn">Конвертувати в ASCII</button>
          </div>
          <div id="hex-tool-result" style="margin-top:8px;font-size:12px;color:var(--fg-bright);display:none;"></div>
        </div>
        <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
          <strong>Інструкція аудитора:</strong> Зберіть шістнадцяткові значення з піддоменів <code>chunk1-...</code> та декодуйте їх за допомогою конвертера вище. Отриманий прапорець <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
        </div>`;
    } else if (isIcmpTunnel) {
      inputFormHtml = `
        <div class="card" style="margin-top:16px;">
          <h2 style="font-size:12px;margin-bottom:6px;">Інструмент: Аналізатор корисного навантаження ICMP-пакетів</h2>
          <div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:10px;">
            Відфільтруйте пакети з протоколом ICMP (зокрема до адреси 198.51.100.99) та дослідіть поле ASCII у Hexdump:
          </div>
        </div>
        <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
          <strong>Інструкція аудитора:</strong> Зберіть фрагменти з поля ASCII пакетів 5–9 (COVERT CHUNK 1-5). Отриманий рядок <code>FLAG{...}</code> скопіюйте та введіть у форму 'Submit Flag' на вкладці 'Бриф'.
        </div>`;
    } else {
      inputFormHtml = `
        <div class="card" style="margin-top:14px;font-size:12px;color:var(--fg-dim);">
          <strong>Інструкція аудитора:</strong> Дослідіть корисне навантаження HTTP POST запиту (пакет №8). Скопіюйте прапорець <code>FLAG{...}</code> із параметра <code>pass</code> та введіть його у форму 'Submit Flag' на вкладці 'Бриф'.
        </div>`;
    }

    container.innerHTML = `
      <div class="pv-wrap">
        <div class="pv-toolbar">
          <input type="text" id="pv-filter" placeholder="Фільтр протоколів або адрес (наприклад: POST, DNS, TLS, ICMP, 198.51)" value="${filter || ""}">
        </div>
        ${renderTable(filter)}
        <div id="pv-detail-slot"></div>
      </div>
      ${inputFormHtml}
      <div id="pv-answer-out"></div>
    `;

    container.querySelectorAll(".pkt-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.classList.contains("pkt-checkbox")) {
          // Handled in checkbox listener
          return;
        }
        const no = Number(row.dataset.no);
        if (isTls) {
          if (picked.has(no)) picked.delete(no); else picked.add(no);
          draw(container.querySelector("#pv-filter").value, no);
        } else {
          draw(container.querySelector("#pv-filter")?.value, no);
        }
      });
    });

    container.querySelectorAll(".pkt-checkbox").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const no = Number(cb.dataset.no);
        if (cb.checked) picked.add(no); else picked.delete(no);
        draw(container.querySelector("#pv-filter").value, no);
      });
    });

    if (selectedNo) {
      const row = container.querySelector(`.pkt-row[data-no="${selectedNo}"]`);
      if (row) row.classList.add("selected");
      const pkt = packets.find((p) => p.no === selectedNo);
      container.querySelector("#pv-detail-slot").innerHTML = renderDetail(pkt);
    }

    const filterInput = container.querySelector("#pv-filter");
    filterInput.addEventListener("input", () => draw(filterInput.value, selectedNo));

    if (isTls) {
      const confirmBtn = container.querySelector("#pv-confirm");
      if (confirmBtn) {
        confirmBtn.addEventListener("click", async () => {
          const { data: res } = await API.post(`/api/lab/${labId}/answer`, { packet_numbers: [...picked] });
          showAnswerOut(res.task_solved, res.message);
          if (res.task_solved && res.flag) {
            const flagIn = document.getElementById("flag-input");
            if (flagIn) flagIn.value = res.flag;
          }
          if (res.task_solved) onSolved();
        });
      }
    } else if (isDnsTunnel) {
      const hexInput = container.querySelector("#hex-tool-input");
      const hexRes = container.querySelector("#hex-tool-result");
      const hexBtn = container.querySelector("#hex-tool-btn");

      if (hexBtn && hexInput) {
        hexBtn.addEventListener("click", () => {
          const val = hexInput.value.trim();
          if (!val) return;
          const ascii = hexToAscii(val);
          hexRes.style.display = "block";
          hexRes.innerHTML = `HEX: <code>${escapeHtml(val)}</code> &rarr; ASCII: <strong style="color:var(--fg);">${escapeHtml(ascii)}</strong>`;
        });
      }
    }
  }

  function showAnswerOut(ok, msg) {
    const out = container.querySelector("#pv-answer-out");
    if (!out) return;
    out.innerHTML = ok
      ? `<div style="color:var(--fg);margin-top:8px;">${escapeHtml(msg || "[OK] Рукостискання валідовано!")}</div>`
      : `<div style="color:var(--fg-dim);margin-top:8px;">${escapeHtml(msg || "[X] Невірний набір пакетів рукостискання.")}</div>`;
  }

  draw("", null);
}
