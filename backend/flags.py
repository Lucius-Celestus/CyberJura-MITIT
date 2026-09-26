"""
Динамічні прапорці. Ніколи не зберігаються в базі даних чи фронтенді —
обчислюються на льоту за формулою:

    FLAG{ SHA256(user_id : task_id : secret_salt)[:16] }

Це унеможливлює списування — прапорець одного курсанта не підійде
іншому, навіть для того самого завдання.
"""
import hashlib
import hmac
import os

# У продакшн-деплої ОБОВ'ЯЗКОВО задати через змінну середовища FLAG_SALT.
SECRET_SALT = os.environ.get("FLAG_SALT", "change-me-in-production-please")


def generate_flag(user_id: int, task_id: str) -> str:
    raw = f"{user_id}:{task_id}:{SECRET_SALT}".encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()[:16].upper()
    return f"FLAG{{{digest}}}"


def check_flag(user_id: int, task_id: str, submitted: str) -> bool:
    if not submitted:
        return False
    expected = generate_flag(user_id, task_id)
    return hmac.compare_digest(submitted.strip(), expected)
