from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Chat, Message, Memory, KnowledgeBase, KnowledgeItem, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/search", tags=["search"])


class UniversalSearchRequest(BaseModel):
    query: str


class SearchResult(BaseModel):
    type: str
    id: int
    title: str
    snippet: str
    created_at: str = ""


@router.post("")
async def universal_search(req: UniversalSearchRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    query = f"%{req.query.lower()}%"
    results = []

    chat_result = await db.execute(
        select(Chat).where(Chat.user_id == user.id, Chat.title.ilike(query)).order_by(Chat.updated_at.desc()).limit(5)
    )
    for chat in chat_result.scalars().all():
        results.append(SearchResult(type="chat", id=chat.id, title=chat.title, snippet=f"Chat from {chat.updated_at.strftime('%b %d')}", created_at=str(chat.updated_at)))

    msg_result = await db.execute(
        select(Message).join(Chat).where(Chat.user_id == user.id, Message.content.ilike(query)).order_by(Message.created_at.desc()).limit(10)
    )
    for msg in msg_result.scalars().all():
        snippet = msg.content[:150].replace("\n", " ")
        results.append(SearchResult(type="message", id=msg.id, title=f"{msg.role.title()}: {snippet[:60]}...", snippet=snippet, created_at=str(msg.created_at)))

    mem_result = await db.execute(
        select(Memory).where(Memory.user_id == user.id, Memory.content.ilike(query)).order_by(Memory.updated_at.desc()).limit(5)
    )
    for mem in mem_result.scalars().all():
        results.append(SearchResult(type="memory", id=mem.id, title=mem.content[:60], snippet=mem.content[:150], created_at=str(mem.updated_at)))

    kb_ids_result = await db.execute(
        select(KnowledgeBase.id).where(KnowledgeBase.user_id == user.id)
    )
    kb_ids = [row[0] for row in kb_ids_result.all()]
    if kb_ids:
        kb_result = await db.execute(
            select(KnowledgeItem).where(KnowledgeItem.kb_id.in_(kb_ids), KnowledgeItem.content.ilike(query)).order_by(KnowledgeItem.created_at.desc()).limit(10)
        )
        for item in kb_result.scalars().all():
            results.append(SearchResult(type="knowledge", id=item.id, title=f"KB: {item.content[:50]}...", snippet=item.content[:150], created_at=str(item.created_at)))

    return {"results": results, "total": len(results)}
