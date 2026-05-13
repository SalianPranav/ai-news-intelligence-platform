"""
News Intelligence Platform – FastAPI Backend
============================================
Run: uvicorn main:app --reload
Docs: http://localhost:8000/docs
"""
import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

load_dotenv()
print("NEWSDATA:", os.getenv("NEWSDATA_API_KEY"))
print("GEMINI:", os.getenv("GEMINI_API_KEY"))
from database import Base, engine, get_db
from models import Article
from pipeline import NewsPipeline
from schemas import ArticleList, ArticleResponse, PipelineStatusResponse, StatsResponse
from fastapi import FastAPI
logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger(__name__)

# Create all tables on startup
Base.metadata.create_all(bind=engine)

# ── global pipeline state (in-memory; fine for single-worker) ─────────────────
pipeline_state: dict = {
    "running":    False,
    "stage":      "idle",
    "fetched":    0,
    "processed":  0,
    "total":      0,
    "errors":     0,
    "message":    "Ready – press 'Run Pipeline' to fetch and analyse news.",
    "started_at": None,
}

# ── app ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="News Intelligence Platform",
    description="AI-powered news analysis – real-time summaries, sentiment & insights",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── pipeline endpoints ────────────────────────────────────────────────────────

@app.post("/api/pipeline/run", tags=["Pipeline"])
async def trigger_pipeline(
    background_tasks: BackgroundTasks,
    count: int = Query(default=100, ge=10, le=500, description="Number of articles to fetch"),
):
    """Start the news-fetch + AI-analysis pipeline in the background."""
    if pipeline_state["running"]:
        raise HTTPException(status_code=409, detail="Pipeline is already running.")

    newsdata_key  = os.getenv("NEWSDATA_API_KEY")
    gemini_key = os.getenv("GEMINI_API_KEY")

    if not newsdata_key:
        raise HTTPException(status_code=500, detail="NEWSDATA_API_KEY not set in environment.")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set in environment.")

    pipeline_state.update(
        running=True,
        stage="starting",
        fetched=0,
        processed=0,
        total=count,
        errors=0,
        message=f"Initialising pipeline for {count} articles…",
        started_at=datetime.utcnow().isoformat(),
    )

    background_tasks.add_task(_run_pipeline, count, newsdata_key, gemini_key)
    return {"message": "Pipeline started", "target_count": count}


async def _run_pipeline(count: int, newsdata_key: str, gemini_key: str) -> None:
    from database import SessionLocal
    db = SessionLocal()
    try:
        pipe = NewsPipeline(
            newsdata_api_key=newsdata_key,
            gemini_api_key=gemini_key,
            state=pipeline_state,
        )
        await pipe.run(count=count, db=db)
    except Exception as exc:
        logger.exception("Background pipeline failed")
        pipeline_state.update(running=False, stage="error", message=str(exc))
    finally:
        db.close()


@app.get("/api/pipeline/status", response_model=PipelineStatusResponse, tags=["Pipeline"])
def pipeline_status():
    """Poll pipeline state."""
    return pipeline_state


@app.get("/api/pipeline/stream", tags=["Pipeline"])
async def pipeline_stream():
    """Server-Sent Events stream for real-time pipeline progress."""
    async def _gen():
        prev = ""
        for _ in range(600):          # max 5 min stream
            payload = json.dumps(pipeline_state)
            if payload != prev:
                yield f"data: {payload}\n\n"
                prev = payload
            if not pipeline_state["running"]:
                yield f"data: {payload}\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── article endpoints ─────────────────────────────────────────────────────────

@app.get("/api/articles", response_model=ArticleList, tags=["Articles"])
def list_articles(
    page:     int           = Query(default=1, ge=1),
    per_page: int           = Query(default=20, ge=1, le=100),
    search:   Optional[str] = Query(default=None, description="Full-text search on title/summary"),
    sentiment: Optional[str] = Query(default=None, regex="^(positive|negative|neutral)$"),
    category:  Optional[str] = None,
    sort_by:   str          = Query(default="published_at", regex="^(published_at|created_at|sentiment_score)$"),
    db: Session = Depends(get_db),
):
    """Paginated, searchable, filterable article list."""
    q = db.query(Article).filter(Article.ai_processed == True)

    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(Article.title.ilike(term), Article.summary.ilike(term), Article.source.ilike(term))
        )
    if sentiment:
        q = q.filter(Article.sentiment == sentiment)
    if category:
        q = q.filter(Article.category == category)

    total = q.count()
    col   = getattr(Article, sort_by, Article.published_at)
    rows  = q.order_by(desc(col)).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "articles":    rows,
        "total":       total,
        "page":        page,
        "per_page":    per_page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    }


@app.get("/api/articles/{article_id}", response_model=ArticleResponse, tags=["Articles"])
def get_article(article_id: int, db: Session = Depends(get_db)):
    art = db.query(Article).filter(Article.id == article_id).first()
    if not art:
        raise HTTPException(404, "Article not found")
    return art


# ── stats endpoint ────────────────────────────────────────────────────────────

@app.get("/api/stats", response_model=StatsResponse, tags=["Stats"])
def stats(db: Session = Depends(get_db)):
    """Aggregate statistics for the dashboard."""
    total     = db.query(Article).count()
    processed = db.query(Article).filter(Article.ai_processed == True).count()

    sentiment_rows = (
        db.query(Article.sentiment, func.count(Article.id))
        .filter(Article.ai_processed == True)
        .group_by(Article.sentiment)
        .all()
    )
    category_rows = (
        db.query(Article.category, func.count(Article.id))
        .filter(Article.ai_processed == True)
        .group_by(Article.category)
        .order_by(desc(func.count(Article.id)))
        .limit(8)
        .all()
    )
    avg_score = (
        db.query(func.avg(Article.sentiment_score))
        .filter(Article.ai_processed == True)
        .scalar()
        or 0.0
    )
    top_sources = (
        db.query(Article.source, func.count(Article.id))
        .filter(Article.ai_processed == True)
        .group_by(Article.source)
        .order_by(desc(func.count(Article.id)))
        .limit(5)
        .all()
    )

    return {
        "total_articles":          total,
        "processed_articles":      processed,
        "sentiment_distribution":  {s: c for s, c in sentiment_rows},
        "category_distribution":   {c: cnt for c, cnt in category_rows},
        "average_sentiment_score": round(float(avg_score), 3),
        "top_sources":             [{"source": s, "count": c} for s, c in top_sources],
    }


@app.get("/api/categories", tags=["Stats"])
def categories(db: Session = Depends(get_db)):
    rows = db.query(Article.category).filter(Article.ai_processed == True).distinct().all()
    return sorted(r[0] for r in rows if r[0])


@app.get("/", tags=["Health"])
def root():
    return {"message": "News Intelligence Platform API", "version": "1.0.0", "docs": "/docs"}
