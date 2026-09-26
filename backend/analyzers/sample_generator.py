"""
Генерує навчальні файли .docx і .pdf у пам'яті (in-memory) для лабораторних CTF.
"Підозрілі" зразки містять РЕАЛЬНІ структурні індикатори
(порожній VBA-заглушка, зовнішнє посилання Template Injection, /JS-ключ у PDF),
але жодного шкідливого функціоналу — вони абсолютно безпечні для хоста.
Також містить утиліти інспекції структури для браузерного аналізатора.
"""
import io
import os
import re
import zipfile


def _build_docx(text: str, add_macro: bool, add_external_rel: bool,
                 creator: str, application: str, flag: str = None) -> bytes:
    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""

    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""

    document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>{text}</w:t></w:r></w:p>
</w:body>
</w:document>"""

    core_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:creator>{creator}</dc:creator>
<dc:title>Навчальний документ</dc:title>
</cp:coreProperties>"""

    app_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>{application}</Application>
</Properties>"""

    doc_rels_parts = []
    if add_macro:
        doc_rels_parts.append(
            '<Relationship Id="rIdM" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vbaProject" '
            'Target="vbaProject.bin"/>'
        )
    if add_external_rel:
        target_template = f"http://training-lab.local/templates/{flag or 'FLAG{TEMPLATE_INJECTION_DISCOVERED}'}.dotm"
        doc_rels_parts.append(
            f'<Relationship Id="rIdT" '
            f'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" '
            f'Target="{target_template}" '
            f'TargetMode="External"/>'
        )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", root_rels)
        zf.writestr("word/document.xml", document_xml)
        zf.writestr("docProps/core.xml", core_xml)
        zf.writestr("docProps/app.xml", app_xml)
        if doc_rels_parts:
            rels_xml = (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + "".join(doc_rels_parts)
                + "</Relationships>"
            )
            zf.writestr("word/_rels/document.xml.rels", rels_xml)
        if add_macro:
            # НЕ реальний VBA-проєкт: OLE-сигнатура + демонстраційні байти.
            fake_ole = b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1" + os.urandom(200)
            zf.writestr("word/vbaProject.bin", fake_ole)
    return buf.getvalue()


def _build_pdf(add_js: bool, flag: str = None) -> bytes:
    objects = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R" + (b" /OpenAction 5 0 R" if add_js else b"") + b" >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>"
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    if add_js:
        js_flag = flag or "FLAG{PDF_JS_EXPLOIT_STREAM_DISCOVERED}"
        objects.append(
            b"<< /Type /Action /S /JavaScript "
            + f"/JS (app.alert('AUDIT_FLAG: {js_flag}');) >>".encode("utf-8")
        )
    else:
        objects.append(b"<< >>")  # заглушка для збереження нумерації об'єктів
    text = b"Navchalnyi PDF dokument. Bez shkidlyvogo vmistu."
    stream = b"BT /F1 18 Tf 50 700 Td (" + text + b") Tj ET"
    objects.append(
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
    )

    out = io.BytesIO()
    out.write(b"%PDF-1.7\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode())
        out.write(obj)
        out.write(b"\nendobj\n")

    xref_offset = out.tell()
    n = len(objects) + 1
    out.write(f"xref\n0 {n}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(b"trailer\n")
    out.write(f"<< /Size {n} /Root 1 0 R >>\n".encode())
    out.write(b"startxref\n")
    out.write(f"{xref_offset}\n".encode())
    out.write(b"%%EOF")
    return out.getvalue()


def get_docx_samples(flag: str = None) -> dict:
    """In-memory зразки для CTF-лабораторії."""
    return {
        "clean": _build_docx(
            "Це звичайний навчальний документ без жодних макросів.",
            add_macro=False,
            add_external_rel=False,
            creator="Викладач",
            application="Microsoft Office Word",
        ),
        "suspicious": _build_docx(
            "Увімкніть редагування, щоб побачити зашифрований фінансовий звіт.",
            add_macro=True,
            add_external_rel=True,
            creator="unknown",
            application="unknown tool 1.0",
            flag=flag,
        ),
    }


def get_pdf_samples(flag: str = None) -> dict:
    return {
        "clean": _build_pdf(add_js=False),
        "suspicious": _build_pdf(add_js=True, flag=flag),
    }


def get_docx_files(sample_key: str, flag: str = None) -> list:
    samples = get_docx_samples(flag=flag)
    data = samples.get(sample_key)
    if not data:
        return []
    zf = zipfile.ZipFile(io.BytesIO(data))
    return zf.namelist()


def read_docx_file_content(sample_key: str, filepath: str, flag: str = None) -> str:
    samples = get_docx_samples(flag=flag)
    data = samples.get(sample_key)
    if not data:
        return "Помилка: зразок не знайдено."
    zf = zipfile.ZipFile(io.BytesIO(data))
    if filepath not in zf.namelist():
        return "Помилка: файл відсутній у структурі документа."
    if filepath == "word/vbaProject.bin":
        raw = zf.read(filepath)
        return (
            f"[BINARY OLE2 STREAM: {len(raw)} bytes]\n"
            f"Сигнатура заголовка: D0 CF 11 E0 (Compound Document File)\n"
            f"УВАГА: Виявлено вбудований скомпільований VBA-макрос AutoOpen!\n"
            f"Цей код автоматично виконується офісним пакетом при відкритті документа."
        )
    return zf.read(filepath).decode("utf-8", errors="replace")


def get_pdf_objects_info(sample_key: str, flag: str = None) -> list:
    samples = get_pdf_samples(flag=flag)
    data = samples.get(sample_key)
    if not data:
        return []
    objs = []
    matches = re.finditer(rb"(\d+)\s+0\s+obj\s*(.*?)\s*endobj", data, re.DOTALL)
    for m in matches:
        obj_id = int(m.group(1))
        content = m.group(2).decode("utf-8", errors="replace")
        summary = "Невідомий об'єкт"
        if "/Catalog" in content:
            summary = "/Catalog (Кореневий словник документа" + (" + /OpenAction автозапуск!)" if "/OpenAction" in content else ")")
        elif "/Pages" in content and "/Kids" in content:
            summary = "/Pages (Ієрархія сторінок)"
        elif "/Page" in content:
            summary = "/Page (Окрема сторінка)"
        elif "/JavaScript" in content or "/JS" in content:
            summary = "/Action /JavaScript (Вбудований виконуваний JS-код!)"
        elif "/Font" in content:
            summary = "/Font (Шрифт)"
        elif "stream" in content:
            summary = "Stream (Текстовий контент сторінки)"
        objs.append({"id": obj_id, "summary": summary})
    return objs


def read_pdf_object_content(sample_key: str, obj_id: int, flag: str = None) -> str:
    samples = get_pdf_samples(flag=flag)
    data = samples.get(sample_key)
    if not data:
        return "Помилка: зразок не знайдено."
    pattern = rf"{obj_id}\s+0\s+obj\s*(.*?)\s*endobj".encode("utf-8")
    m = re.search(pattern, data, re.DOTALL)
    if not m:
        return f"Об'єкт {obj_id} не знайдено в PDF."
    return m.group(0).decode("utf-8", errors="replace")
