"""
Шар доступу до даних платформи. Використовує вбудований sqlite3 —
без зовнішніх залежностей.
Ізоляція: реальні користувачі та прогрес CTF зберігаються у platform.db,
а вразливі навчальні таблиці для лабораторних робіт — в окремому lab.db.
Це гарантує, що SQL-ін'єкції учнів не можуть пошкодити акаунти інших людей
чи злити хеші паролів платформи.
"""
import os
import secrets
import sqlite3
import sys
import threading
from werkzeug.security import generate_password_hash

DB_PATH = os.environ.get("CTF_DB_PATH", os.path.join(os.path.dirname(__file__), "data", "platform.db"))
LAB_DB_PATH = os.environ.get("CTF_LAB_DB_PATH", os.path.join(os.path.dirname(__file__), "data", "lab.db"))

_local = threading.local()


def get_db() -> sqlite3.Connection:
    """Повертає з'єднання з базою даних платформи (користувачі, прапорці, прогрес)."""
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        _local.conn = conn
    return _local.conn


def get_lab_db() -> sqlite3.Connection:
    """Повертає з'єднання з ізольованою навчальною базою даних lab.db.
    Якщо таблиці випадково видалені або пошкоджені, вони автоматично відновлюються."""
    if not hasattr(_local, "lab_conn") or _local.lab_conn is None:
        os.makedirs(os.path.dirname(os.path.abspath(LAB_DB_PATH)), exist_ok=True)
        conn = sqlite3.connect(LAB_DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        _local.lab_conn = conn

    # Авто-відновлення lab-схеми в разі випадкового пошкодження
    _ensure_lab_schema(_local.lab_conn)
    return _local.lab_conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    is_guest INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    solved_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, task_id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_writeups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, task_id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS lab_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, task_id),
    FOREIGN KEY(user_id) REFERENCES users(id)
);
"""

LAB_SCHEMA = """
CREATE TABLE IF NOT EXISTS lab_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    secret TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_secret_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    secret_code TEXT NOT NULL,
    details TEXT NOT NULL
);
"""

SEED_LAB_USERS = [
    ("admin", "S7!qX_admin_pass", "s3cur3_0r4cl3"),
    ("guest", "guest123", "not-the-one-you-want"),
    ("operator", "Op3r@t0r_2026", "dummy-secret-value"),
]

SEED_LAB_PRODUCTS = [
    ("USB Rubber Ducky", "Hardware", "Програмований HID-пристрій для емуляції клавіатурних атак"),
    ("Wireshark Sticker Pack", "Swag", "Фірмовий набір вінілових наліпок з акулячим плавником"),
    ("CTF Hoodie", "Apparel", "Чорна толстовка з вишитим принтом FLAG{...}"),
    ("Proxmark3 RDV4", "Hardware", "RFID/NFC сканер та емулятор для тестування безконтактних карток"),
    ("LAN Turtle", "Network", "Непомітний системний адаптер для перехоплення мережевого трафіку"),
]

SEED_SECRET_NOTES = [
    ("FINANCIAL_VAULT", "SEC_VAULT_ALPHA_8491", "Конфіденційний доступ до фінансового аудиту за 2026 рік"),
    ("BACKUP_ENCRYPTION_KEY", "AES256_OFFSITE_K91A", "Майстер-ключ розшифрування сховища резервних копій"),
]


def _ensure_lab_schema(conn: sqlite3.Connection):
    """Гарантує наявність та наповненість таблиць навчальної бази lab.db."""
    try:
        conn.executescript(LAB_SCHEMA)
        cur = conn.execute("SELECT COUNT(*) AS c FROM lab_users")
        if cur.fetchone()["c"] == 0:
            conn.executemany(
                "INSERT INTO lab_users (username, password, secret) VALUES (?, ?, ?)",
                SEED_LAB_USERS,
            )

        cur_prod = conn.execute("SELECT COUNT(*) AS c FROM lab_products")
        if cur_prod.fetchone()["c"] == 0:
            conn.executemany(
                "INSERT INTO lab_products (name, category, description) VALUES (?, ?, ?)",
                SEED_LAB_PRODUCTS,
            )

        cur_notes = conn.execute("SELECT COUNT(*) AS c FROM lab_secret_notes")
        if cur_notes.fetchone()["c"] == 0:
            conn.executemany(
                "INSERT INTO lab_secret_notes (title, secret_code, details) VALUES (?, ?, ?)",
                SEED_SECRET_NOTES,
            )
        conn.commit()
    except Exception:
        pass


def ensure_admin_user():
    """Створює/оновлює обліковий запис адміністратора та виводить пароль у консоль."""
    conn = get_db()
    data_dir = os.path.dirname(os.path.abspath(DB_PATH))
    os.makedirs(data_dir, exist_ok=True)
    creds_file = os.path.join(data_dir, ".admin_password")

    admin_password = None
    if os.path.exists(creds_file):
        try:
            with open(creds_file, "r", encoding="utf-8") as f:
                admin_password = f.read().strip()
        except Exception:
            admin_password = None

    if not admin_password:
        alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*"
        admin_password = "Admin_" + "".join(secrets.choice(alphabet) for _ in range(16))
        try:
            with open(creds_file, "w", encoding="utf-8") as f:
                f.write(admin_password)
            os.chmod(creds_file, 0o600)
        except Exception:
            pass

    pw_hash = generate_password_hash(admin_password)
    cur = conn.execute("SELECT id FROM users WHERE LOWER(username) = 'admin'").fetchone()
    if cur:
        conn.execute("UPDATE users SET password_hash = ?, is_guest = 0 WHERE id = ?", (pw_hash, cur["id"]))
    else:
        conn.execute(
            "INSERT INTO users (username, password_hash, is_guest) VALUES ('admin', ?, 0)",
            (pw_hash,),
        )
    conn.commit()

    banner = f"""
================================================================================
[+] CTF PLATFORM: ADMINISTRATOR ACCOUNT CONFIGURED
    Username : admin
    Password : {admin_password}
    Login URL: http://localhost:8000
    Credentials file: {creds_file}
================================================================================
"""
    print(banner, file=sys.stdout, flush=True)


def init_db():
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    ensure_admin_user()

    # Також ініціалізуємо ізольовану базу lab.db
    lab_conn = get_lab_db()
    _ensure_lab_schema(lab_conn)
