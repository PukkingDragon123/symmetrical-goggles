"""API tokens for online services (Sketchfab, ...), kept out of the repo and out of command lines.

Lookup order for a service, e.g. "sketchfab":
  1. environment: LOWPIX_SKETCHFAB_TOKEN (or the service's own name, e.g. SKETCHFAB_API_TOKEN)
  2. the user's token file: $LOWPIX_CONFIG/tokens.json or ~/.config/lowpix/tokens.json (mode 0600)

    python -m lowpix auth set sketchfab        # prompts (hidden input) or reads stdin
    python -m lowpix auth list                 # shows which services have a token (masked)
    python -m lowpix auth remove sketchfab

Tokens are never printed in full, logged, or written anywhere else.
"""
from __future__ import annotations

import json
import os
import stat

SERVICE_ENV = {"sketchfab": ["SKETCHFAB_API_TOKEN", "SKETCHFAB_TOKEN"]}


def config_dir() -> str:
    return os.environ.get("LOWPIX_CONFIG") or os.path.join(os.path.expanduser("~"), ".config", "lowpix")


def _file() -> str:
    return os.path.join(config_dir(), "tokens.json")


def _load() -> dict:
    try:
        with open(_file()) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def get_token(service: str):
    service = service.lower()
    for var in [f"LOWPIX_{service.upper()}_TOKEN"] + SERVICE_ENV.get(service, []):
        if os.environ.get(var):
            return os.environ[var].strip()
    return _load().get(service)


def set_token(service: str, token: str) -> str:
    token = token.strip()
    if not token:
        raise ValueError("empty token")
    os.makedirs(config_dir(), exist_ok=True)
    data = _load()
    data[service.lower()] = token
    path = _file()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(data, fh)
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    return path


def remove_token(service: str) -> bool:
    data = _load()
    if service.lower() not in data:
        return False
    del data[service.lower()]
    fd = os.open(_file(), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(data, fh)
    return True


def masked(token: str) -> str:
    return (token[:3] + "..." + token[-2:]) if token and len(token) > 8 else "***"


def status() -> dict:
    """service -> where its token comes from (env var name / file), never the token itself."""
    out = {}
    for service in sorted(set(SERVICE_ENV) | set(_load())):
        for var in [f"LOWPIX_{service.upper()}_TOKEN"] + SERVICE_ENV.get(service, []):
            if os.environ.get(var):
                out[service] = f"env {var} ({masked(os.environ[var])})"
                break
        else:
            t = _load().get(service)
            out[service] = f"file {_file()} ({masked(t)})" if t else "not set"
    return out
