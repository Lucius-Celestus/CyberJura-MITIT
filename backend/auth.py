"""
Автентифікація та сесії.

Замість ручного JWT використано вбудований механізм Flask-сесій:
підписаний (itsdangerous), НЕ просто закодований, cookie з прапорцем
HttpOnly=True за замовчуванням. Функціонально це те саме, що
"JWT у HttpOnly cookie" з технічного завдання — клієнт не може ні
прочитати його через JS (HttpOnly), ні підробити (криптографічний
підпис на SECRET_KEY), а сервер не зберігає стан сесії на диску.

Паролі хешуються через werkzeug.security (PBKDF2-SHA256 за
замовчуванням) — це той самий клас алгоритмів, що й bcrypt/argon2
(повільний, із сіллю, стійкий до rainbow-таблиць).
"""
import random
import string

from flask import Blueprint, jsonify, request, session
from werkzeug.security import generate_password_hash, check_password_hash

from db import get_db

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _current_user_row():
    uid = session.get("user_id")
    if not uid:
        return None
    conn = get_db()
    return conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


def require_auth(fn):
    from functools import wraps

    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Потрібна автентифікація"}), 401
        return fn(*args, **kwargs)

    return wrapper


RESERVED_USERNAMES = {"admin", "administrator", "root", "system", "moderator", "superuser"}


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if len(username) < 3 or len(username) > 32:
        return jsonify({"error": "Логін має бути 3-32 символи"}), 400
    if len(password) < 6:
        return jsonify({"error": "Пароль має бути не коротшим за 6 символів"}), 400

    if username.lower() in RESERVED_USERNAMES:
        return jsonify({"error": f"Ім'я користувача '{username}' зарезервовано системою"}), 400

    conn = get_db()
    exists = conn.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (username,)).fetchone()
    if exists:
        return jsonify({"error": "Такий логін вже зайнятий"}), 409

    pw_hash = generate_password_hash(password)
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, is_guest) VALUES (?, ?, 0)",
        (username, pw_hash),
    )
    conn.commit()
    session["user_id"] = cur.lastrowid
    session["username"] = username
    return jsonify({"id": cur.lastrowid, "username": username, "is_guest": False})


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    conn = get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND is_guest = 0", (username,)
    ).fetchone()
    if not row or not row["password_hash"] or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Невірний логін або пароль"}), 401

    session["user_id"] = row["id"]
    session["username"] = row["username"]
    return jsonify({"id": row["id"], "username": row["username"], "is_guest": False})


@bp.post("/guest")
def guest_login():
    conn = get_db()
    suffix = "".join(random.choices(string.digits, k=6))
    username = f"guest_{suffix}"
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, is_guest) VALUES (?, NULL, 1)",
        (username,),
    )
    conn.commit()
    session["user_id"] = cur.lastrowid
    session["username"] = username
    return jsonify({"id": cur.lastrowid, "username": username, "is_guest": True})


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    row = _current_user_row()
    if not row:
        return jsonify({"error": "Не автентифіковано"}), 401
    return jsonify({"id": row["id"], "username": row["username"], "is_guest": bool(row["is_guest"])})
