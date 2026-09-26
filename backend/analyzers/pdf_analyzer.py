"""
Аналізатор .pdf файлів на індикатори, типові для шкідливих PDF.

Метод той самий, що використовує класичний інструмент pdfid (Didier Stevens):
рахуємо входження ключових слів PDF-об'єктів у сирих байтах файлу.
Ми НЕ рендеримо і не виконуємо файл — тільки шукаємо текстові патерни.
"""
import re

RISKY_KEYS = {
    "/JavaScript": rb"/JavaScript",
    "/JS": rb"/JS\b",
    "/OpenAction": rb"/OpenAction",
    "/AA": rb"/AA\b",
    "/EmbeddedFile": rb"/EmbeddedFile",
    "/Launch": rb"/Launch",
    "/RichMedia": rb"/RichMedia",
}

INFO_KEYS = {
    "/URI": rb"/URI",
    "object_count": rb"\d+\s+\d+\s+obj",
}

EXPLANATIONS = {
    "/JavaScript": "виконуваний JavaScript-код всередині PDF",
    "/JS": "виконуваний JavaScript-код всередині PDF",
    "/OpenAction": "дія, що автоматично запускається при відкритті файлу",
    "/AA": "додаткова дія (Additional Action) — автозапуск при події",
    "/EmbeddedFile": "прихований вбудований файл усередині PDF",
    "/Launch": "спроба запустити зовнішню програму/команду",
    "/RichMedia": "вбудований мультимедійний/flash-об'єкт",
}


def analyze_pdf(data: bytes) -> dict:
    if not data.startswith(b"%PDF-"):
        return {
            "verdict": "error",
            "findings": ["Файл не має коректного PDF-заголовка (%PDF-)."],
            "indicators": {},
        }

    indicators = {}
    findings = []
    risk_score = 0

    for key, pattern in RISKY_KEYS.items():
        count = len(re.findall(pattern, data))
        indicators[key] = count
        if count > 0:
            risk_score += count
            findings.append(
                f"[!] {key} — знайдено {count} раз(и): {EXPLANATIONS[key]}."
            )

    for key, pattern in INFO_KEYS.items():
        count = len(re.findall(pattern, data))
        indicators[key] = count

    if indicators.get("/URI", 0) > 0:
        findings.append(
            f"[i] /URI — знайдено {indicators['/URI']} посилання(нь) усередині файлу."
        )

    verdict = "suspicious" if risk_score > 0 else "clean"

    if not findings:
        findings.append("[OK] Явних індикаторів не знайдено.")

    return {"verdict": verdict, "findings": findings, "indicators": indicators}
