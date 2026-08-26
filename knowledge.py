from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import KnowledgeBase, KnowledgeItem, get_db
from auth import get_current_user_from_cookie

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class KBResponse(BaseModel):
    id: int
    name: str
    description: str
    item_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class KBItemResponse(BaseModel):
    id: int
    content: str
    source: str
    source_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateKBRequest(BaseModel):
    name: str
    description: str = ""


class AddItemRequest(BaseModel):
    content: str
    source: str = ""
    source_type: str = "text"


class SearchKBRequest(BaseModel):
    query: str
    kb_ids: list[int] = []


async def get_user_kb(kb_id: int, user_id: int, db: AsyncSession) -> KnowledgeBase:
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == user_id)
    )
    kb = result.scalar_one_or_none()
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


@router.get("")
async def list_kbs(request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    result = await db.execute(
        select(KnowledgeBase).where(KnowledgeBase.user_id == user.id).order_by(KnowledgeBase.created_at.desc())
    )
    kbs = result.scalars().all()
    out = []
    for kb in kbs:
        count_result = await db.execute(
            select(KnowledgeItem).where(KnowledgeItem.kb_id == kb.id)
        )
        count = len(count_result.scalars().all())
        out.append(KBResponse(id=kb.id, name=kb.name, description=kb.description, item_count=count, created_at=kb.created_at))
    return {"knowledge_bases": out}


@router.post("")
async def create_kb(req: CreateKBRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    kb = KnowledgeBase(user_id=user.id, name=req.name.strip(), description=req.description.strip())
    db.add(kb)
    await db.commit()
    await db.refresh(kb)
    return {"knowledge_base": KBResponse(id=kb.id, name=kb.name, description=kb.description, item_count=0, created_at=kb.created_at)}


@router.delete("/{kb_id}")
async def delete_kb(kb_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    kb = await get_user_kb(kb_id, user.id, db)
    await db.delete(kb)
    await db.commit()
    return {"message": "Deleted"}


@router.get("/{kb_id}/items")
async def list_items(kb_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    await get_user_kb(kb_id, user.id, db)
    result = await db.execute(
        select(KnowledgeItem).where(KnowledgeItem.kb_id == kb_id).order_by(KnowledgeItem.created_at.desc())
    )
    items = result.scalars().all()
    return {"items": [KBItemResponse.model_validate(i) for i in items]}


@router.post("/{kb_id}/items")
async def add_item(kb_id: int, req: AddItemRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    await get_user_kb(kb_id, user.id, db)
    item = KnowledgeItem(kb_id=kb_id, content=req.content.strip(), source=req.source, source_type=req.source_type)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"item": KBItemResponse.model_validate(item)}


@router.post("/{kb_id}/items/batch")
async def add_items_batch(kb_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    await get_user_kb(kb_id, user.id, db)
    body = await request.json()
    items_data = body.get("items", [])
    added = []
    for item_data in items_data:
        item = KnowledgeItem(
            kb_id=kb_id,
            content=item_data.get("content", "").strip(),
            source=item_data.get("source", ""),
            source_type=item_data.get("source_type", "text"),
        )
        db.add(item)
        await db.flush()
        added.append(KBItemResponse.model_validate(item))
    await db.commit()
    return {"items": added, "count": len(added)}


@router.delete("/{kb_id}/items/{item_id}")
async def delete_item(kb_id: int, item_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    await get_user_kb(kb_id, user.id, db)
    result = await db.execute(
        select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.kb_id == kb_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()
    return {"message": "Deleted"}


@router.post("/search")
async def search_knowledge(req: SearchKBRequest, request: Request, db: AsyncSession = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    query = f"%{req.query.lower()}%"

    if req.kb_ids:
        kb_filter = KnowledgeItem.kb_id.in_(req.kb_ids)
    else:
        user_kb_result = await db.execute(
            select(KnowledgeBase.id).where(KnowledgeBase.user_id == user.id)
        )
        kb_ids = [row[0] for row in user_kb_result.all()]
        if not kb_ids:
            return {"results": []}
        kb_filter = KnowledgeItem.kb_id.in_(kb_ids)

    result = await db.execute(
        select(KnowledgeItem).where(kb_filter, KnowledgeItem.content.ilike(query)).order_by(KnowledgeItem.created_at.desc()).limit(20)
    )
    items = result.scalars().all()
    return {"results": [KBItemResponse.model_validate(i) for i in items]}
