"""
Аналізатор .docx файлів на індикатори, типові для реальних фішинг-документів.

Не виконує жодного коду з файлу — тільки статично читає структуру
OOXML (docx — це ZIP-архів з XML всередині).
"""
import io
import re
import zipfile


def analyze_docx(data: bytes) -> dict:
    indicators = {}
    findings = []

    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return {
            "verdict": "error",
            "findings": ["Файл не є коректним .docx (не ZIP-архів)."],
            "indicators": {},
        }

    names = zf.namelist()

    # 1. Наявність VBA-макросів
    has_macro = "word/vbaProject.bin" in names
    indicators["macros_present"] = has_macro
    if has_macro:
        findings.append(
            "[!] Знайдено word/vbaProject.bin — документ містить VBA-макроси. "
            "Макроси можуть автоматично виконуватись при відкритті (AutoOpen)."
        )

    # 2. Зовнішні зв'язки (template injection, посилання на зовнішні ресурси)
    external_targets = []
    for name in names:
        if name.endswith(".rels"):
            try:
                content = zf.read(name).decode("utf-8", errors="ignore")
            except Exception:
                continue
            for match in re.finditer(
                r'Target="([^"]+)"[^>]*TargetMode="External"', content
            ):
                external_targets.append((name, match.group(1)))
            for match in re.finditer(
                r'TargetMode="External"[^>]*Target="([^"]+)"', content
            ):
                external_targets.append((name, match.group(1)))

    indicators["external_relationships"] = [t for _, t in external_targets]
    if external_targets:
        for rels_file, target in external_targets:
            findings.append(
                f"[!] Зовнішнє посилання у {rels_file}: {target} — "
                f"схоже на template injection (документ підвантажує вміст ззовні)."
            )

    # 3. Метадані
    creator = application = None
    if "docProps/core.xml" in names:
        core = zf.read("docProps/core.xml").decode("utf-8", errors="ignore")
        m = re.search(r"<dc:creator>(.*?)</dc:creator>", core)
        creator = m.group(1) if m else None
    if "docProps/app.xml" in names:
        app_xml = zf.read("docProps/app.xml").decode("utf-8", errors="ignore")
        m = re.search(r"<Application>(.*?)</Application>", app_xml)
        application = m.group(1) if m else None

    indicators["creator"] = creator
    indicators["application"] = application
    if creator:
        findings.append(f"[i] Автор у метаданих: {creator}")
    if application:
        findings.append(f"[i] Створено у: {application}")

    risky = has_macro or len(external_targets) > 0
    verdict = "suspicious" if risky else "clean"

    if not findings:
        findings.append("[OK] Явних індикаторів не знайдено.")

    return {"verdict": verdict, "findings": findings, "indicators": indicators}
