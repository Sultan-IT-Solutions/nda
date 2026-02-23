from __future__ import annotations

from typing import Optional


def _as_title(text: str) -> str:
    return text.strip().rstrip(".")


def admin_action_key(domain: str, verb: str) -> str:
    domain = domain.strip().strip(".")
    verb = verb.strip().strip(".")
    return f"admin.{domain}.{verb}"


def admin_action_label(action: str, *, subject: Optional[str] = None) -> str:
    base = _as_title(action)
    if subject:
        subj = subject.strip()
        if subj:
            return f"{base} / {subj}"
    return base
