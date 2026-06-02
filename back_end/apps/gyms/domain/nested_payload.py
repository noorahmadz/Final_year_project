from __future__ import annotations

from typing import Any, Dict, Mapping


def as_mutable_dict(data: Any) -> Dict[str, Any]:
    """
    Convert request.data (possibly a QueryDict) into a plain mutable dict.
    """
    if data is None:
        return {}
    if isinstance(data, dict):
        return dict(data)
    try:
        return dict(data)
    except Exception:
        return {"value": data}


def inject_gym_id(data: Any, gym_id: int) -> Dict[str, Any]:
    payload = as_mutable_dict(data)
    payload["gym"] = gym_id
    return payload

