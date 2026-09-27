import os
import re
import secrets

from flask import Flask, jsonify, request, session, send_from_directory

from db import init_db, get_db
from flags import generate_flag, check_flag, check_flags, get_expected_flags
from challenges import CHALLENGES_BY_ID, public_challenge_list
from auth import bp as auth_bp, require_auth
from labs import bp as labs_bp

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    MAX_CONTENT_LENGTH=10 * 1024 * 1024,
)

app.register_blueprint(auth_bp)
app.register_blueprint(labs_bp)

with app.app_context():
    init_db()


# ---------------------------------------------------------------- challenges
@app.get("/api/challenges")
@require_auth
def list_challenges():
    uid = session["user_id"]
    conn = get_db()

    solved_rows = conn.execute(
        "SELECT task_id FROM submissions WHERE user_id = ?", (uid,)
    ).fetchall()
    solved_ids = {r["task_id"] for r in solved_rows}

    unranked_rows = conn.execute(
        "SELECT task_id FROM user_writeups WHERE user_id = ?", (uid,)
    ).fetchall()
    unranked_ids = {r["task_id"] for r in unranked_rows}

    items = public_challenge_list()
    for item in items:
        item["solved"] = item["id"] in solved_ids
        item["writeup_unlocked"] = item["id"] in unranked_ids
        item["is_unranked"] = item["id"] in unranked_ids

    return jsonify({"challenges": items})


@app.get("/api/challenges/<task_id>")
@require_auth
def get_challenge(task_id):
    challenge = CHALLENGES_BY_ID.get(task_id)
    if not challenge:
        return jsonify({"error": "Завдання не знайдено"}), 404

    uid = session["user_id"]
    conn = get_db()
    solved = conn.execute(
        "SELECT 1 FROM submissions WHERE user_id = ? AND task_id = ?", (uid, task_id)
    ).fetchone()

    writeup_row = conn.execute(
        "SELECT 1 FROM user_writeups WHERE user_id = ? AND task_id = ?", (uid, task_id)
    ).fetchone()
    writeup_unlocked = bool(writeup_row)

    result = dict(challenge)
    result["solved"] = bool(solved)
    result["writeup_unlocked"] = writeup_unlocked
    result["is_unranked"] = writeup_unlocked

    # Приховуємо вміст writeup, якщо користувач його ще не відкривав через окрему кнопку
    if not writeup_unlocked:
        result["writeup"] = None

    return jsonify(result)


@app.post("/api/challenges/<task_id>/reveal-writeup")
@require_auth
def reveal_writeup(task_id):
    challenge = CHALLENGES_BY_ID.get(task_id)
    if not challenge:
        return jsonify({"error": "Завдання не знайдено"}), 404

    uid = session["user_id"]
    conn = get_db()
    conn.execute(
        "INSERT OR IGNORE INTO user_writeups (user_id, task_id) VALUES (?, ?)",
        (uid, task_id),
    )
    conn.commit()

    return jsonify({
        "ok": True,
        "writeup": challenge["writeup"],
        "is_unranked": True,
        "warning": "Врайтап відкрито. Це завдання позначено як нерейтингове (0 балів у загальному скорборді).",
    })


# ---------------------------------------------------------------- submit flag
@app.post("/api/submit-flag")
@require_auth
def submit_flag():
    data = request.get_json(silent=True) or {}
    task_id = data.get("task_id", "")

    if task_id not in CHALLENGES_BY_ID:
        return jsonify({"error": "Невідоме завдання"}), 404

    uid = session["user_id"]
    expected_flags = get_expected_flags(uid, task_id)

    raw_flags = data.get("flags")
    if raw_flags is not None:
        if isinstance(raw_flags, list):
            submitted_flags = [str(f).strip() for f in raw_flags if str(f).strip()]
        else:
            submitted_flags = [s.strip() for s in re.split(r"[\n,;]+", str(raw_flags)) if s.strip()]
    else:
        single = (data.get("flag") or "").strip()
        submitted_flags = [s.strip() for s in re.split(r"[\n,;]+", single) if s.strip()]

    # If the task requires multiple flags, each is mandatory
    if len(expected_flags) > 1 and len(submitted_flags) < len(expected_flags):
        return jsonify({
            "correct": False,
            "message": f"Обов'язково ввести кожен з {len(expected_flags)} прапорців! (Введено {len(submitted_flags)} з {len(expected_flags)})"
        }), 200

    if not check_flags(uid, task_id, submitted_flags):
        return jsonify({
            "correct": False,
            "message": "Невірний прапорець (або введено не всі обов'язкові прапорці)."
        }), 200

    conn = get_db()
    conn.execute(
        "INSERT OR IGNORE INTO submissions (user_id, task_id) VALUES (?, ?)",
        (uid, task_id),
    )
    conn.commit()

    writeup_row = conn.execute(
        "SELECT 1 FROM user_writeups WHERE user_id = ? AND task_id = ?", (uid, task_id)
    ).fetchone()
    is_unranked = bool(writeup_row)

    points = 0 if is_unranked else CHALLENGES_BY_ID[task_id]["points"]
    return jsonify({"correct": True, "points": points, "is_unranked": is_unranked})


@app.get("/api/challenges/<task_id>/flag")
@require_auth
def get_challenge_flag(task_id):
    """Повертає прапорець виключно у випадку, якщо користувач дійсно
    виконав практичну частину лабораторної (наявний запис у lab_completions
    або вже успішно зараховане завдання)."""
    if task_id not in CHALLENGES_BY_ID:
        return jsonify({"error": "Невідоме завдання"}), 404

    uid = session["user_id"]
    conn = get_db()

    completed = conn.execute(
        """
        SELECT 1 FROM lab_completions WHERE user_id = ? AND task_id = ?
        UNION
        SELECT 1 FROM submissions WHERE user_id = ? AND task_id = ?
        """,
        (uid, task_id, uid, task_id),
    ).fetchone()

    if not completed:
        return jsonify({
            "error": "Прапорець заблоковано: практичне завдання ще не виконано в лабораторії!"
        }), 403

    flags = get_expected_flags(uid, task_id)
    return jsonify({
        "flag": flags[0],
        "flags": flags,
        "flags_count": len(flags)
    })


# ---------------------------------------------------------------- leaderboard
@app.get("/api/leaderboard")
def leaderboard():
    conn = get_db()

    users = conn.execute("SELECT id, username, is_guest FROM users").fetchall()
    unlocked_rows = conn.execute("SELECT user_id, task_id FROM user_writeups").fetchall()
    forfeited_set = {(r["user_id"], r["task_id"]) for r in unlocked_rows}

    points_by_task = {cid: c["points"] for cid, c in CHALLENGES_BY_ID.items()}

    result = []
    for u in users:
        uid = u["id"]
        sub_rows = conn.execute(
            "SELECT task_id, solved_at FROM submissions WHERE user_id = ? ORDER BY solved_at ASC",
            (uid,),
        ).fetchall()
        if not sub_rows:
            continue

        ranked_solved = 0
        unranked_solved = 0
        total_points = 0
        last_ranked_solve = None

        for s in sub_rows:
            tid = s["task_id"]
            if (uid, tid) in forfeited_set:
                unranked_solved += 1
            else:
                ranked_solved += 1
                total_points += points_by_task.get(tid, 0)
                last_ranked_solve = s["solved_at"]

        result.append({
            "username": u["username"],
            "is_guest": bool(u["is_guest"]),
            "points": total_points,
            "ranked_solved": ranked_solved,
            "unranked_solved": unranked_solved,
            "solved_count": ranked_solved + unranked_solved,
            "last_solve": last_ranked_solve or (sub_rows[-1]["solved_at"] if sub_rows else None),
        })

    result.sort(key=lambda r: (-r["points"], r["last_solve"] or ""))
    return jsonify({"leaderboard": result, "total_tasks": len(CHALLENGES_BY_ID)})


# ---------------------------------------------------------------- frontend static
@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path):
    full = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
