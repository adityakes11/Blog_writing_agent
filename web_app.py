from __future__ import annotations

import os
from datetime import date
from typing import Any, Dict

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from starlette.requests import Request

from bwa_backend import app as graph_app


app = FastAPI(title="Blog Writing Agency", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))


class GenerateRequest(BaseModel):
    topic: str = Field(..., min_length=5, max_length=2000)
    audience: str = Field(default="general technical readers")
    tone: str = Field(default="professional and insightful")
    as_of: str | None = None
    include_images: bool = False
    image_query: str | None = None


UNSPLASH_BASE = "https://images.unsplash.com"
UNSPLASH_FALLBACKS = {
    "technology": "photo-1518770660439-4636190af475",
    "research": "photo-1531482615713-2afd69097998",
    "business": "photo-1552664730-d307ca884978",
    "news": "photo-1495020689067-958852a7765e",
    "ai": "photo-1677442136019-21780ecad995",
    "default": "photo-1497366754035-f200968a6e72",
}


def _build_image_url(keyword: str, width: int = 1400, height: int = 900) -> str:
    key = keyword.lower().strip() or "default"
    photo_id = UNSPLASH_FALLBACKS.get(key, UNSPLASH_FALLBACKS["default"])
    return (
        f"{UNSPLASH_BASE}/{photo_id}?auto=format&fit=crop&w={width}&q=80&h={height}"
    )


async def _fetch_unsplash_image(query: str) -> str:
    client_id = os.getenv("UNSPLASH_ACCESS_KEY")
    if not client_id:
        return _build_image_url(query or "technology")

    url = "https://api.unsplash.com/search/photos"
    params = {"query": query, "per_page": 1, "orientation": "landscape"}
    headers = {"Authorization": f"Client-ID {client_id}"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            payload = response.json()
            results = payload.get("results") or []
            if results:
                return results[0].get("urls", {}).get("regular")
    except httpx.HTTPError:
        # The deterministic Unsplash source keeps generation usable when search
        # is unavailable or no API key is configured.
        return _build_image_url(query or "technology")
    return _build_image_url(query or "technology")


async def _inject_external_images(markdown: str, topic: str, image_query: str | None = None) -> str:
    query = (image_query or topic or "technology").strip()
    image_url = await _fetch_unsplash_image(query)

    intro = f"\n\n![{topic}]({image_url})\n\n"
    if markdown.startswith("# "):
        return markdown.replace("# ", f"{intro}# ", 1)
    return f"{intro}{markdown}"


async def generate_blog(payload: GenerateRequest) -> Dict[str, Any]:
    topic = payload.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic is required.")

    as_of_value = payload.as_of or date.today().isoformat()
    state = {
        "topic": topic,
        "mode": "",
        "needs_research": False,
        "queries": [],
        "evidence": [],
        "plan": None,
        "as_of": as_of_value,
        "recency_days": 7,
        "sections": [],
        "merged_md": "",
        "md_with_placeholders": "",
        "image_specs": [],
        "final": "",
    }

    result = graph_app.invoke(state)
    final_md = result.get("final") or ""
    if not final_md:
        raise HTTPException(status_code=500, detail="No blog content was generated.")

    if payload.include_images:
        final_md = await _inject_external_images(final_md, topic, payload.image_query)

    plan = result.get("plan")
    plan_dict = None
    if hasattr(plan, "model_dump"):
        plan_dict = plan.model_dump()
    elif isinstance(plan, dict):
        plan_dict = plan

    evidence = result.get("evidence") or []
    evidence_rows = []
    for item in evidence:
        if hasattr(item, "model_dump"):
            item = item.model_dump()
        evidence_rows.append(item)

    return {
        "title": (plan_dict or {}).get("blog_title") or topic.strip(),
        "topic": topic,
        "final_markdown": final_md,
        "plan": plan_dict,
        "evidence": evidence_rows,
        "research": {
            "mode": result.get("mode") or "closed_book",
            "queries": result.get("queries") or [],
            "sources": evidence_rows,
            "as_of": as_of_value,
        },
        "image_query": payload.image_query or topic,
        "include_images": payload.include_images,
    }


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        request,
        "index.html",
        {"request": request, "title": "Blog Writing Agency"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "blog-writing-agent"}


@app.post("/api/generate")
async def generate(request: GenerateRequest):
    try:
        data = await generate_blog(request)
        return JSONResponse(content=data)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=str(exc)) from exc
