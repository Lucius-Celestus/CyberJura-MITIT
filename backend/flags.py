"""
Динамічні прапорці. Ніколи не зберігаються в базі даних чи фронтенді —
обчислюються на льоту за формулою:

    FLAG{ SHA256(user_id : task_id [: flag_num] : secret_salt)[:16] }

Це унеможливлює списування — прапорець одного курсанта не підійде
іншому, навіть для того самого завдання.
"""
import hashlib
import hmac
import os
import re

# У продакшн-деплої ОБОВ'ЯЗКОВО задати через змінну середовища FLAG_SALT.
SECRET_SALT = os.environ.get("FLAG_SALT", "change-me-in-production-please")


def generate_flag(user_id: int, task_id: str, flag_num: int = None) -> str:
    """Генерує персональний динамічний прапорець.
    Якщо завдання має декілька прапорців, використовується flag_num (1, 2, ...)."""
    if flag_num is not None:
        raw = f"{user_id}:{task_id}:{flag_num}:{SECRET_SALT}".encode("utf-8")
    else:
        raw = f"{user_id}:{task_id}:{SECRET_SALT}".encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()[:16].upper()
    return f"FLAG{{{digest}}}"


def get_expected_flags(user_id: int, task_id: str) -> list[str]:
    """Повертає список усіх обов'язкових прапорців для завдання."""
    from challenges import CHALLENGES_BY_ID
    chal = CHALLENGES_BY_ID.get(task_id, {})
    count = chal.get("flags_count", 1)
    if count > 1:
        return [generate_flag(user_id, task_id, i) for i in range(1, count + 1)]
    return [generate_flag(user_id, task_id)]


def check_flags(user_id: int, task_id: str, submitted_flags: list[str]) -> bool:
    """Перевіряє, чи введено КОЖЕН обов'язковий прапорець завдання.
    Всі прапорці мають бути введені та бути правильними."""
    if not submitted_flags:
        return False
    expected_flags = get_expected_flags(user_id, task_id)
    cleaned_submitted = [s.strip().upper() for s in submitted_flags if s and s.strip()]

    # Усі прапорці обов'язкові! Якщо введено менше, ніж потрібно - відхилити
    if len(cleaned_submitted) < len(expected_flags):
        return False

    # Перевірка: кожен очікуваний прапорець має бути присутній серед введених
    for exp in expected_flags:
        matched = False
        for sub in cleaned_submitted:
            if hmac.compare_digest(sub, exp.upper()):
                matched = True
                break
        if not matched:
            return False

    return True


def check_flag(user_id: int, task_id: str, submitted: str) -> bool:
    """Зворотна сумісність для одиночної перевірки або рядка з розділювачами."""
    if not submitted:
        return False
    # Розділяємо рядок, якщо користувач передав кілька прапорців через кому чи перенесення
    parts = [p.strip() for p in re.split(r"[\n,;]+", submitted) if p.strip()]
    return check_flags(user_id, task_id, parts)
