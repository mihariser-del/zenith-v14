from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Memory, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/memories", tags=["memories"])


class MemoryResponse(BaseModel):
    id: int
    content: str
    category: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreateMemoryRequest(BaseModel):
    content: str
    category: str = "general"


class UpdateMemoryRequest(BaseModel):
    content: str


class SearchRequest(BaseModel):
    query: str


@router.get("")
async def list_memories(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.updated_at.desc())
    )
    memories = result.scalars().all()
    return {"memories": [MemoryResponse.model_validate(m) for m in memories]}


@router.post("")
async def create_memory(req: CreateMemoryRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    memory = Memory(user_id=user.id, content=req.content.strip(), category=req.category)
    db.add(memory)
    await db.commit()
    await db.refresh(memory)
    return {"memory": MemoryResponse.model_validate(memory)}


@router.patch("/{memory_id}")
async def update_memory(memory_id: int, req: UpdateMemoryRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Memory).where(Memory.id == memory_id, Memory.user_id == user.id)
    )
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    memory.content = req.content.strip()
    memory.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"memory": MemoryResponse.model_validate(memory)}


@router.delete("/{memory_id}")
async def delete_memory(memory_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(Memory).where(Memory.id == memory_id, Memory.user_id == user.id)
    )
    memory = result.scalar_one_or_none()
    if not memory:
        raise HTTPException(status_code=404, detail="Memory not found")
    await db.delete(memory)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/search")
async def search_memories(req: SearchRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    query = f"%{req.query.lower()}%"
    result = await db.execute(
        select(Memory).where(
            Memory.user_id == user.id,
            Memory.content.ilike(query)
        ).order_by(Memory.updated_at.desc()).limit(20)
    )
    memories = result.scalars().all()
    return {"memories": [MemoryResponse.model_validate(m) for m in memories]}


@router.post("/auto-extract")
async def auto_extract(request: Request, db: AsyncSession = Depends(get_db)):
    import json, httpx
    from database import Message, Chat, settings
    from sqlalchemy.orm import selectinload

    user = await get_current_user_from_cookie(request, db)

    result = await db.execute(
        select(Chat).where(Chat.user_id == user.id).options(selectinload(Chat.messages)).order_by(Chat.updated_at.desc()).limit(3)
    )
    chats = result.scalars().all()

    recent_text = ""
    for chat in chats:
        for msg in chat.messages[-6:]:
            recent_text += f"{msg.role}: {msg.content}\n"

    if not recent_text.strip():
        return {"memories": [], "message": "No recent conversations to extract from"}

    existing = await db.execute(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.updated_at.desc()).limit(10)
    )
    existing_memories = [m.content for m in existing.scalars().all()]
    existing_text = "\n".join(f"- {m}" for m in existing_memories) if existing_memories else "None"

    extract_prompt = f"""Analyze the following conversations and extract important facts about the user that should be remembered for future conversations. Return ONLY a JSON array of strings, each being a fact. Examples:
- "User's name is John"
- "User prefers Python over JavaScript"
- "User is building a chatbot called Zenith"

Existing memories (avoid duplicates):
{existing_text}

Recent conversations:
{recent_text}

Return ONLY a JSON array of strings. No other text."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openrouter_api_key}", "Content-Type": "application/json"},
                json={"model": "openai/gpt-4o-mini", "messages": [{"role": "user", "content": extract_prompt}], "max_tokens": 500, "temperature": 0.3}
            )
            if resp.status_code != 200:
                return {"memories": [], "error": f"API error {resp.status_code}"}
            data = resp.json()
            raw = data["choices"][0]["message"]["content"].strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            facts = json.loads(raw)
    except Exception as e:
        return {"memories": [], "error": str(e)}

    new_memories = []
    for fact in facts:
        if isinstance(fact, str) and fact.strip():
            is_dup = any(fact.lower() in existing.lower() for existing in existing_memories)
            if not is_dup:
                memory = Memory(user_id=user.id, content=fact.strip(), category="auto-extracted")
                db.add(memory)
                new_memories.append(fact.strip())

    await db.commit()
    return {"memories": new_memories, "count": len(new_memories)}
