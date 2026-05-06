from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def _read_json_file(path_value: Path) -> dict:
    try:
        raw = path_value.read_text(encoding="utf-8-sig").strip()
    except Exception:
        return {}
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _get_meipass_dir() -> Path | None:
    base = getattr(sys, "_MEIPASS", None)
    if not base:
        return None
    try:
        return Path(base).resolve()
    except Exception:
        return None


def _iter_build_info_candidates() -> list[Path]:
    current_dir = Path(__file__).resolve().parent
    candidates: list[Path] = []

    meipass_dir = _get_meipass_dir()
    if meipass_dir is not None:
        candidates.append(meipass_dir / "worker-build-info.json")

    candidates.append(current_dir / "worker-build-info.json")
    return candidates


def _load_embedded_build_info() -> dict:
    for candidate in _iter_build_info_candidates():
        info = _read_json_file(candidate)
        if info:
            return info
    return {}


def _load_package_json_info() -> dict:
    package_path = Path(__file__).resolve().parent.parent / "package.json"
    data = _read_json_file(package_path)
    version = str(data.get("version") or "").strip()
    if not version:
        version = "0.0.0"

    return {
        "mode": "source-dev",
        "workerVersion": f"{version}-dev",
        "appVersion": version,
        "expectedTag": f"v{version}",
        "gitTag": "",
        "gitCommit": "",
        "builtAt": "",
    }


def get_worker_build_info() -> dict:
    info = _load_embedded_build_info()
    if info:
        worker_version = str(info.get("workerVersion") or "").strip()
        app_version = str(info.get("appVersion") or "").strip()
        return {
            "mode": str(info.get("mode") or "packaged-exe").strip() or "packaged-exe",
            "workerVersion": worker_version or app_version or "0.0.0",
            "appVersion": app_version or worker_version or "0.0.0",
            "expectedTag": str(info.get("expectedTag") or "").strip(),
            "gitTag": str(info.get("gitTag") or "").strip(),
            "gitCommit": str(info.get("gitCommit") or "").strip(),
            "builtAt": str(info.get("builtAt") or "").strip(),
        }

    return _load_package_json_info()


def get_worker_build_info_json() -> str:
    return json.dumps(get_worker_build_info(), ensure_ascii=False)


def format_worker_build_info_text() -> str:
    info = get_worker_build_info()
    built_at = info.get("builtAt") or ""
    if built_at:
        try:
            built_at = (
                datetime.fromisoformat(built_at.replace("Z", "+00:00"))
                .astimezone(timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
            )
        except Exception:
            pass

    parts = [
        f"workerVersion={info.get('workerVersion') or 'unknown'}",
        f"mode={info.get('mode') or 'unknown'}",
        f"appVersion={info.get('appVersion') or 'unknown'}",
    ]
    if info.get("expectedTag"):
        parts.append(f"expectedTag={info['expectedTag']}")
    if info.get("gitTag"):
        parts.append(f"gitTag={info['gitTag']}")
    if info.get("gitCommit"):
        parts.append(f"gitCommit={info['gitCommit']}")
    if built_at:
        parts.append(f"builtAt={built_at}")
    return " ".join(parts)
