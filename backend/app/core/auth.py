"""Password hashing, JWT, and FastAPI auth dependencies."""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models import models as m

ALGORITHM = "HS256"

optional_bearer = HTTPBearer(auto_error=False)


def _password_bytes(plain: str) -> bytes:
    """Bcrypt only uses the first 72 bytes of UTF-8 (RFC-style)."""
    return plain.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("ascii")


def verify_password_or_legacy(plain_password: str, hashed_password: str | None) -> bool:
    """Verify bcrypt hash, or legacy SHA-256 hex from older POST /users registrations."""
    if not hashed_password:
        return False
    h = hashed_password.strip()
    if h.startswith("$2"):
        try:
            return bcrypt.checkpw(_password_bytes(plain_password), h.encode("ascii"))
        except (ValueError, TypeError):
            return False
    # Legacy: 64-char hex from hashlib.sha256(...).hexdigest()
    if len(h) == 64:
        try:
            digest = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
            return hmac.compare_digest(digest.lower(), h.lower())
        except Exception:
            return False
    return False


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"user_id": user_id, "exp": exp}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def get_effective_user_id(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(optional_bearer)],
    user_id: Optional[uuid.UUID] = Query(default=None),
) -> uuid.UUID:
    """Bearer token takes precedence over query `user_id` when present."""
    if credentials is not None:
        try:
            payload = decode_token(credentials.credentials)
        except jwt.PyJWTError as exc:
            raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
        raw = payload.get("user_id")
        if not raw:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        try:
            return uuid.UUID(str(raw))
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Invalid token payload") from exc
    if user_id is not None:
        return user_id
    raise HTTPException(
        status_code=422,
        detail="Missing user_id: provide ?user_id= or Authorization: Bearer <token>",
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(HTTPBearer())],
    db: Session = Depends(get_db),
) -> m.User:
    try:
        payload = decode_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
    raw = payload.get("user_id")
    if not raw:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    try:
        uid = uuid.UUID(str(raw))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token payload") from exc
    user = db.query(m.User).filter(m.User.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
