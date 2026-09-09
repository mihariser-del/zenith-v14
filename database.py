import os
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Float, ForeignKey, create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, relationship
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openrouter_api_key: str = ""
    openrouter_api_keys: str = ""
    secret_key: str = "change-me"
    database_url: str = ""

    model_config = {"env_file": ".env", "extra": "allow"}

    def get_openrouter_keys(self) -> list[str]:
        """Return list of OpenRouter API keys, supporting rotation.
        Priority: OPENROUTER_API_KEYS env (comma-separated) > openrouter_api_keys field > openrouter_api_key fallback.
        """
        raw = os.getenv("OPENROUTER_API_KEYS") or self.openrouter_api_keys or self.openrouter_api_key or ""
        return [k.strip() for k in raw.split(",") if k.strip()]


def _resolve_secret_key() -> str:
    """Return a strong SECRET_KEY, never a known-weak value from source.

    Priority: SECRET_KEY env (unless it is the old dev default) >
    SECRET_KEY_FILE > persisted secret_key.txt (on /data if writable) >
    freshly generated. Fresh secrets are persisted so sessions survive restarts.
    """
    provided = os.getenv("SECRET_KEY", "").strip()
    if provided and provided not in ("change-me", "zenith-dev", "secret"):
        return provided
    candidates = [p.strip() for p in (os.getenv("SECRET_KEY_FILE", ""), "/data/secret_key.txt", "secret_key.txt")]
    for path in candidates:
        if path and os.path.exists(path):
            try:
                content = open(path, "r", encoding="utf-8").read().strip()
                if content:
                    return content
            except Exception as e:
                print(f"[security] could not read {path}: {e}")
    import secrets
    new_key = secrets.token_urlsafe(48)
    for path in candidates:
        if not path:
            continue
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_key)
            os.chmod(path, 0o600)
            print(f"[security] Wrote a generated SECRET_KEY to {path} — keep this file safe.")
            return new_key
        except Exception as e:
            print(f"[security] could not persist SECRET_KEY to {path}: {e}")
    print("[WARNING] SECRET_KEY is generated per-boot (sessions won't survive restarts). Set SECRET_KEY or SECRET_KEY_FILE in production.")
    return new_key


def _fernet():
    """Fernet cipher whose key is derived from SECRET_KEY (stable across restarts)."""
    from cryptography.fernet import Fernet
    import base64, hashlib
    key = base64.urlsafe_b64encode(hashlib.sha256((settings.secret_key or "change-me").encode()).digest())
    return Fernet(key)


def random_password(length: int = 13) -> str:
    """Generate a random password of letters+digits (used for first-run owner
    and the Owner's emergency password rotation)."""
    import secrets as _secrets
    import string as _string
    chars = _string.ascii_letters + _string.digits
    return "".join(_secrets.choice(chars) for _ in range(length))


def encrypt_pending_password(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_pending_password(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except Exception:
        return ""


def _can_write(path: str) -> bool:
    import os
    try:
        test = os.path.join(path, ".zenith_write_test")
        with open(test, "w") as f: f.write("ok")
        os.remove(test)
        return True
    except Exception:
        return False


def _resolve_db_url(env_url: str = "") -> str:
    import os
    # Prefer /data volume ONLY if it exists AND is writable. Otherwise
    # the app runs as non-root and the volume is root-owned -> crash loop.
    # Docs fix: set RAILWAY_RUN_UID=0 env var. Code fix: fallback gracefully.
    if os.path.isdir("/data"):
        if not env_url.startswith("postgres") and _can_write("/data"):
            return "sqlite+aiosqlite:////data/zenith.db"
        if not _can_write("/data"):
            print("WARNING: /data exists but not writable (set RAILWAY_RUN_UID=0). Falling back to ephemeral DB.")
    if env_url:
        url = env_url
        if url.startswith("postgres"):
            return url.replace("postgres://", "postgresql+asyncpg://").replace("postgresql://", "postgresql+asyncpg://")
        return url
    if os.path.isdir("/data") and _can_write("/data"):
        return "sqlite+aiosqlite:////data/zenith.db"
    return "sqlite+aiosqlite:///zenith.db"

settings = Settings()
settings.database_url = _resolve_db_url(settings.database_url or os.getenv("DATABASE_URL", ""))
settings.secret_key = _resolve_secret_key()
engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False)
    role = Column(String(20), default="user")  # user | admin | owner
    banned_by = Column(String(50), default="")  # actor role: admin | owner
    is_banned = Column(Boolean, default=False)
    ban_reason = Column(String(500), default="")
    is_deleted = Column(Boolean, default=False)
    deleted_by = Column(String(50), default="")  # admin | owner
    token_version = Column(Integer, default=0)
    pending_password = Column(Text, default="")
    pending_password_by = Column(String(50), default="")  # admin | owner
    # Billing - Pro/Ultimate
    is_pro = Column(Boolean, default=False)
    is_ultimate = Column(Boolean, default=False)
    pro_plan = Column(String(20), default="")  # pro_monthly, pro_annual, ultimate_monthly, ultimate_annual
    trial_end = Column(DateTime, nullable=True)
    stripe_customer_id = Column(String(100), default="")
    stripe_subscription_id = Column(String(100), default="")
    # Rate limit - guest pause after 60 msgs (30 min window, blocks chat + images)
    last_pause_at = Column(DateTime, nullable=True)
    # Cooldown timer for logged-in tiers: dynamic (free 1-18h, pro 10-30min / 60 on exploit)
    # and fixed 1h for the file editor/generator system. Blocks every limited action until then.
    cooldown_until = Column(DateTime, nullable=True)
    # Presence
    last_seen = Column(DateTime, nullable=True)
    # Admin permissions (JSON string): {"ban_users":true,"reset_password":true,"view_messages":true,"manage_chats":true}
    permissions = Column(Text, default="")
    # Pending notification (role change, etc)
    pending_notification = Column(Text, default="")
    # Chosen helper — staff selected by the Owner to assist during shutdowns
    is_chosen = Column(Boolean, default=False)
    # Personality Mirror: dynamically derived profile of how the user writes,
    # used to make Zenith mirror their tone/formality/energy in replies.
    personality_enabled = Column(Boolean, default=True)
    personality_profile = Column(Text, default="")  # JSON profile from the analyzer
    personality_updated_at = Column(DateTime, nullable=True)
    # Password reset token (forgot-password) with expiry
    reset_token = Column(String(64), default="")
    reset_token_expires = Column(DateTime, nullable=True)
    # Referral system — unique code for inviting others
    referral_code = Column(String(10), unique=True, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")
    memories = relationship("Memory", back_populates="user", cascade="all, delete-orphan")
    settings = relationship("UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    knowledge_bases = relationship("KnowledgeBase", back_populates="user", cascade="all, delete-orphan")
    files = relationship("UploadedFile", back_populates="user", cascade="all, delete-orphan")
    login_history = relationship("LoginHistory", back_populates="user", cascade="all, delete-orphan")
    usage_logs = relationship("UsageLog", back_populates="user", cascade="all, delete-orphan")
    requests = relationship("UserRequest", back_populates="user", cascade="all, delete-orphan")


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    action = Column(String(30), nullable=False)  # image_gen, file_upload, file_edit, message
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="usage_logs")


class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(100), default="New Chat")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="chats")
    messages = relationship("Message", back_populates="chat", cascade="all, delete-orphan", order_by="Message.id")
    files = relationship("UploadedFile", back_populates="chat")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    chat = relationship("Chat", back_populates="messages")


class Memory(Base):
    __tablename__ = "memories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(50), default="general")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="memories")


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    system_prompt = Column(Text, default="You are Zenith, created by Wanzu Ibrahim. Answer accurately and helpfully.")
    personality = Column(String(50), default="default")
    model = Column(String(100), default="openai/gpt-4o-mini")
    max_tokens = Column(Integer, default=2048)
    temperature = Column(Float, default=0.7)
    memory_enabled = Column(Boolean, default=True)
    display_name = Column(String(50), default="")

    user = relationship("User", back_populates="settings")


class KnowledgeBase(Base):
    __tablename__ = "knowledge_bases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="knowledge_bases")
    items = relationship("KnowledgeItem", back_populates="knowledge_base", cascade="all, delete-orphan", order_by="KnowledgeItem.id")


class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kb_id = Column(Integer, ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    source = Column(String(255), default="")
    source_type = Column(String(50), default="text")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    knowledge_base = relationship("KnowledgeBase", back_populates="items")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    chat_id = Column(Integer, ForeignKey("chats.id", ondelete="SET NULL"), nullable=True)
    filename = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    file_size = Column(Integer, default=0)
    mime_type = Column(String(100), default="application/octet-stream")
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="files")
    chat = relationship("Chat", back_populates="files")


class LoginHistory(Base):
    __tablename__ = "login_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ip_address = Column(String(45), default="")
    user_agent = Column(String(500), default="")
    login_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    success = Column(Boolean, default=True)

    user = relationship("User", back_populates="login_history")


class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    username = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    response = Column(Text, default="")
    response_by = Column(String(20), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    responded_at = Column(DateTime, nullable=True)

    user = relationship("User")


class UserRequest(Base):
    __tablename__ = "user_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    username = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    reply = Column(Text, default="")
    reply_by = Column(String(20), default="")  # admin | owner
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    responded_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="requests")


class Referral(Base):
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    referrer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    referred_username = Column(String(50), nullable=False)
    referred_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    referred_ip = Column(String(45), default="")
    referred_device = Column(String(64), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    rewarded = Column(Boolean, default=False)

    referrer = relationship("User", foreign_keys=[referrer_id])
    referred = relationship("User", foreign_keys=[referred_user_id])


class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    used = Column(Boolean, default=False)
    used_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    used_by_username = Column(String(50), default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    used_at = Column(DateTime, nullable=True)

    referrer = relationship("User", foreign_keys=[referrer_id], backref="invite_tokens")


class StaffMessage(Base):
    __tablename__ = "staff_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    username = Column(String(50), nullable=False)
    role = Column(String(20), default="admin")  # admin | owner
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    username = Column(String(50), nullable=False)
    role = Column(String(20), default="admin")  # admin | owner
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")


async def init_db():
    print(f"Using DB: {settings.database_url[:60]}...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.exec_driver_sql("CREATE TABLE IF NOT EXISTS system_settings (key VARCHAR(100) PRIMARY KEY, value TEXT)")
        except Exception as e:
            print(f"migration system_settings: {e}")
        for col, ddl in [
            ("is_banned", "BOOLEAN DEFAULT 0"),
            ("ban_reason", "VARCHAR(500) DEFAULT ''"),
            ("is_deleted", "BOOLEAN DEFAULT 0"),
            ("deleted_by", "VARCHAR(50) DEFAULT ''"),
            ("token_version", "INTEGER DEFAULT 0"),
            ("pending_password", "TEXT DEFAULT ''"),
            ("pending_password_by", "VARCHAR(50) DEFAULT ''"),
            ("role", "VARCHAR(20) DEFAULT 'user'"),
            ("banned_by", "VARCHAR(50) DEFAULT ''"),
            ("is_pro", "BOOLEAN DEFAULT 0"),
            ("is_ultimate", "BOOLEAN DEFAULT 0"),
            ("pro_plan", "VARCHAR(20) DEFAULT ''"),
            ("trial_end", "DATETIME"),
            ("stripe_customer_id", "VARCHAR(100) DEFAULT ''"),
            ("stripe_subscription_id", "VARCHAR(100) DEFAULT ''"),
            ("last_pause_at", "DATETIME"),
            ("cooldown_until", "DATETIME"),
            ("last_seen", "DATETIME"),
            ("permissions", "TEXT DEFAULT ''"),
            ("pending_notification", "TEXT DEFAULT ''"),
            ("is_chosen", "BOOLEAN DEFAULT 0"),
            ("personality_enabled", "BOOLEAN DEFAULT 1"),
            ("personality_profile", "TEXT DEFAULT ''"),
            ("personality_updated_at", "DATETIME"),
            ("reset_token", "VARCHAR(64) DEFAULT ''"),
            ("reset_token_expires", "DATETIME"),
            ("referral_code", "VARCHAR(10) DEFAULT NULL"),
        ]:
            try:
                await conn.exec_driver_sql(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
            except Exception as e:
                print(f"migration {col}: {e}")
        try:
            await conn.exec_driver_sql("ALTER TABLE feedbacks ADD COLUMN response_by VARCHAR(20) DEFAULT ''")
        except Exception as e:
            print(f"migration response_by: {e}")
        try:
            await conn.exec_driver_sql("ALTER TABLE user_settings ADD COLUMN display_name VARCHAR(50) DEFAULT ''")
        except Exception as e:
            print(f"migration display_name: {e}")
        try:
            await conn.exec_driver_sql("""CREATE TABLE IF NOT EXISTS referrals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referrer_id INTEGER NOT NULL REFERENCES users.id ON DELETE CASCADE,
                referred_username VARCHAR(50) NOT NULL,
                referred_user_id INTEGER REFERENCES users.id ON DELETE SET NULL,
                referred_ip VARCHAR(45) DEFAULT '',
                referred_device VARCHAR(64) DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                rewarded BOOLEAN DEFAULT 0
            )""")
        except Exception as e:
            print(f"migration referrals: {e}")
        try:
            await conn.exec_driver_sql("ALTER TABLE referrals ADD COLUMN referred_ip VARCHAR(45) DEFAULT ''")
        except Exception as e:
            pass  # column already exists
        try:
            await conn.exec_driver_sql("ALTER TABLE referrals ADD COLUMN referred_device VARCHAR(64) DEFAULT ''")
        except Exception as e:
            pass  # column already exists
        try:
            await conn.exec_driver_sql("""CREATE TABLE IF NOT EXISTS invite_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token VARCHAR(64) NOT NULL UNIQUE,
                referrer_id INTEGER NOT NULL REFERENCES users.id ON DELETE CASCADE,
                used BOOLEAN DEFAULT 0,
                used_by_user_id INTEGER REFERENCES users.id ON DELETE SET NULL,
                used_by_username VARCHAR(50) DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                used_at DATETIME
            )""")
        except Exception as e:
            print(f"migration invite_tokens: {e}")
    async with async_session() as session:
        from sqlalchemy import select
        import bcrypt, os
        # Bootstrap: only the OWNER account is auto-created (supreme role).
        # Intentionally NO default admin account — admins are created/promoted by the owner.
        owner_username = os.getenv("OWNER_USERNAME", "WANZU-IBRAHIM").strip()
        owner_result = await session.execute(select(User).where(User.username == owner_username))
        owner = owner_result.scalar_one_or_none()
        if not owner:
            # Owner password: OWNER_PASSWORD env, else W.A.N.Z.U. (current default for now).
            # The vault > EMERGENCY tab can rotate it to a fresh random value anytime.
            wanted = os.getenv("OWNER_PASSWORD", "").strip() or "W.A.N.Z.U."
            owner = User(username=owner_username, email=f"{owner_username}@zenith.local",
                         password_hash=bcrypt.hashpw(wanted.encode(), bcrypt.gensalt()).decode(), is_admin=True, role="owner")
            session.add(owner)
            await session.commit()
            print(f"[bootstrap] Owner '{owner_username}' created (password from OWNER_PASSWORD env or the default).")
        else:
            owner.is_admin = True
            owner.role = "owner"
            await session.commit()
        # Sync role for admins (they are is_admin but role might still be 'user' from migration)
        from sqlalchemy import update
        try:
            await session.execute(update(User).where(User.is_admin == True, User.role.in_(["user", ""])).values(role="admin"))
            await session.commit()
        except Exception as e:
            print(f"sync admin role: {e}")
        try:
            await session.execute(
                __import__("sqlalchemy").text("UPDATE user_settings SET model='openai/gpt-4o-mini' WHERE model LIKE '%free%' OR model='qwen/qwen-2.5-7b-instruct'")
            )
            await session.commit()
        except Exception as e:
            print(f"reset to openai: {e}")
        # Reset any free models back to OpenAI
        try:
            await session.execute(
                __import__("sqlalchemy").text("UPDATE user_settings SET model='openai/gpt-4o-mini' WHERE model LIKE '%free%'")
            )
            await session.commit()
        except Exception as e:
            print(f"reset to openai: {e}")
        # Clear all PRO tags from non-staff users (user requested this)
        try:
            await session.execute(
                __import__("sqlalchemy").text("UPDATE users SET is_pro=0, pro_plan='', is_ultimate=0 WHERE is_admin=0 AND role NOT IN ('owner','admin')")
            )
            await session.commit()
            print("cleared non-staff PRO tags")
        except Exception as e:
            print(f"clear PRO tags: {e}")
        # Auto-assign Ultimate to owners and admins
        try:
            await session.execute(
                __import__("sqlalchemy").text("UPDATE users SET is_pro=1, is_ultimate=1 WHERE is_admin=1 OR role IN ('owner','admin')")
            )
            await session.commit()
            print("auto-ultimate for staff")
        except Exception as e:
            print(f"auto-ultimate staff: {e}")
        # Backfill empty banned_by/deleted_by for old records
        try:
            await session.execute(
                __import__("sqlalchemy").text("UPDATE users SET banned_by='Staff' WHERE is_banned=1 AND (banned_by='' OR banned_by IS NULL)")
            )
            await session.execute(
                __import__("sqlalchemy").text("UPDATE users SET deleted_by='Staff' WHERE is_deleted=1 AND (deleted_by='' OR deleted_by IS NULL)")
            )
            await session.commit()
            print("backfilled banned_by/deleted_by")
        except Exception as e:
            print(f"backfill banned/deleted: {e}")


async def get_db():
    async with async_session() as session:
        yield session
