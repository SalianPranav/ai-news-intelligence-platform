"""
News Intelligence Pipeline
--------------------------
1. Fetch  – paginated NewsData.io API calls with back-off
2. Clean  – validate, normalise, deduplicate via content hash
3. Store  – insert raw articles into SQLite
4. Analyse– batch Gemini AI for summary / sentiment / insights
5. Update – write AI results back to DB
"""

import asyncio
import hashlib
import json
import logging
from datetime import datetime
from typing import Any

import aiohttp
import google.generativeai as genai
from sqlalchemy.orm import Session

from models import Article

logger = logging.getLogger(__name__)

# ── helpers ────────────────────────────────────────────────────────────────────

def _content_hash(title: str, source: str) -> str:
    return hashlib.md5(
        f"{title.strip().lower()}{source.strip().lower()}".encode()
    ).hexdigest()


def _parse_date(s: str | None) -> datetime:
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            pass

    return datetime.utcnow()


def _clean(raw: dict) -> dict | None:
    """Return cleaned article or None if invalid."""

    title = (raw.get("title") or "").strip()
    source = (raw.get("source_id") or "").strip()

    if not title or not raw.get("article_id"):
        return None

    return {
        "article_id": raw["article_id"],
        "content_hash": _content_hash(title, source),
        "title": title[:600],
        "description": (raw.get("description") or "")[:1000],
        "content": (raw.get("content") or "")[:5000],
        "url": (raw.get("link") or "")[:1000],
        "image_url": (raw.get("image_url") or "")[:1000],
        "source": source[:200],
        "author": ", ".join(raw.get("creator") or [])[:300],
        "category": ((raw.get("category") or ["general"])[0])[:100],
        "country": ", ".join(raw.get("country") or [])[:200],
        "language": (raw.get("language") or "en")[:10],
        "published_at": _parse_date(raw.get("pubDate")),
    }


# ── AI analysis ───────────────────────────────────────────────────────────────

AI_PROMPT = """You are a precise news analyst. Analyze the article below and reply with ONLY a valid JSON object — no markdown, no prose.

Article:
Title: {title}
Description: {description}
Content: {content}

JSON schema:
{{
  "summary": "<1-2 sentence neutral summary>",
  "sentiment": "<positive|negative|neutral>",
  "sentiment_score": <float -1.0 to 1.0>,
  "insights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "keywords": ["<kw1>", "<kw2>", "<kw3>", "<kw4>", "<kw5>"]
}}
"""


async def _analyse(article_data: dict) -> dict:
    prompt = AI_PROMPT.format(
        title=article_data["title"],
        description=article_data["description"][:600],
        content=article_data["content"][:1800],
    )

    try:
        model = genai.GenerativeModel("gemini-1.5-flash")

        response = model.generate_content(prompt)

        text = response.text.strip()

        # Remove markdown if Gemini adds it
        if text.startswith("```"):
            text = text.split("```")[1]

            if text.startswith("json"):
                text = text[4:]

        return json.loads(text)

    except Exception as exc:
        logger.warning(
            "AI analysis failed for '%s': %s",
            article_data["title"][:60],
            exc,
        )

        return {
            "summary": (
                article_data["description"]
                or article_data["title"]
            )[:250],
            "sentiment": "neutral",
            "sentiment_score": 0.0,
            "insights": ["See full article for details."],
            "keywords": [],
        }


# ── pipeline class ─────────────────────────────────────────────────────────────

class NewsPipeline:
    def __init__(
        self,
        newsdata_api_key: str,
        gemini_api_key: str,
        state: dict,
        concurrency: int = 5,
    ):
        self.newsdata_key = newsdata_api_key
        self.gemini_key = gemini_api_key
        self.state = state
        self.concurrency = concurrency

        genai.configure(api_key=self.gemini_key)

    # ── fetch ──────────────────────────────────────────────────────────────────

    async def _fetch_page(
        self,
        session: aiohttp.ClientSession,
        next_page: str | None,
    ) -> tuple[list[dict], str | None]:

        params: dict[str, Any] = {
            "apikey": self.newsdata_key,
            "language": "en",
            "size": 10,
        }

        if next_page:
            params["page"] = next_page

        for attempt in range(3):
            try:
                async with session.get(
                    "https://newsdata.io/api/1/news",
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=15),
                ) as resp:

                    if resp.status == 429:
                        await asyncio.sleep(2 ** attempt)
                        continue

                    if resp.status != 200:
                        logger.error(
                            "NewsData returned %s",
                            resp.status,
                        )
                        return [], None

                    data = await resp.json()

                    if data.get("status") != "success":
                        return [], None

                    return (
                        data.get("results", []),
                        data.get("nextPage"),
                    )

            except asyncio.TimeoutError:
                logger.warning(
                    "Timeout on attempt %d",
                    attempt + 1,
                )

                await asyncio.sleep(1)

        return [], None

    async def fetch_articles(self, count: int) -> list[dict]:
        self.state.update(
            stage="fetching",
            message="Fetching articles from NewsData.io…",
        )

        articles: list[dict] = []
        next_page: str | None = None

        async with aiohttp.ClientSession() as session:
            while len(articles) < count:

                batch, next_page = await self._fetch_page(
                    session,
                    next_page,
                )

                articles.extend(batch)

                self.state["fetched"] = len(articles)

                self.state["message"] = (
                    f"Fetched {len(articles)} articles…"
                )

                if not next_page:
                    break

                await asyncio.sleep(0.8)

        return articles[:count]

    # ── clean + store ──────────────────────────────────────────────────────────

    def clean_and_store(
        self,
        raw_articles: list[dict],
        db: Session,
    ) -> list[Article]:

        self.state.update(
            stage="storing",
            message="Cleaning and storing articles…",
        )

        stored: list[Article] = []

        existing_hashes: set[str] = {
            row[0]
            for row in db.query(Article.content_hash).all()
        }

        existing_ids: set[str] = {
            row[0]
            for row in db.query(Article.article_id).all()
        }

        for raw in raw_articles:

            cleaned = _clean(raw)

            if not cleaned:
                continue

            if cleaned["content_hash"] in existing_hashes:
                continue

            if cleaned["article_id"] in existing_ids:
                continue

            article = Article(**cleaned)

            db.add(article)

            existing_hashes.add(cleaned["content_hash"])
            existing_ids.add(cleaned["article_id"])

            stored.append(article)

        try:
            db.commit()

        except Exception:
            db.rollback()
            raise

        self.state["message"] = (
            f"Stored {len(stored)} new articles."
        )

        return stored

    # ── AI processing ──────────────────────────────────────────────────────────

    async def process_with_ai(
        self,
        articles: list[Article],
        db: Session,
    ) -> None:

        self.state.update(
            stage="analysing",
            message="Running AI analysis…",
        )

        sem = asyncio.Semaphore(self.concurrency)

        async def process_one(art: Article) -> None:

            async with sem:

                result = await _analyse(
                    {
                        "title": art.title,
                        "description": art.description,
                        "content": art.content,
                    }
                )

                art.summary = result.get("summary", "")
                art.sentiment = result.get(
                    "sentiment",
                    "neutral",
                )

                art.sentiment_score = float(
                    result.get("sentiment_score", 0.0)
                )

                art.insights = result.get("insights", [])

                art.keywords = result.get("keywords", [])

                art.ai_processed = True

                self.state["processed"] += 1

                pct = int(
                    self.state["processed"]
                    / max(self.state["total"], 1)
                    * 100
                )

                self.state["message"] = (
                    f"AI analysis: "
                    f"{self.state['processed']}/"
                    f"{self.state['total']} "
                    f"articles ({pct}%)"
                )

        tasks = [process_one(a) for a in articles]

        results = await asyncio.gather(
            *tasks,
            return_exceptions=True,
        )

        for r in results:
            if isinstance(r, Exception):
                self.state["errors"] += 1
                logger.error("Task error: %s", r)

        try:
            db.commit()

        except Exception:
            db.rollback()
            raise

    # ── orchestrator ───────────────────────────────────────────────────────────

    async def run(self, count: int, db: Session) -> None:

        try:
            self.state["total"] = count

            raw = await self.fetch_articles(count)

            new_articles = self.clean_and_store(raw, db)

            if new_articles:
                await self.process_with_ai(new_articles, db)

            unprocessed = (
                db.query(Article)
                .filter(Article.ai_processed == False)
                .limit(50)
                .all()
            )

            if unprocessed:
                self.state["total"] += len(unprocessed)

                await self.process_with_ai(
                    unprocessed,
                    db,
                )

            self.state.update(
                running=False,
                stage="done",
                message=(
                    f"Pipeline complete. "
                    f"{self.state['processed']} articles analysed, "
                    f"{self.state['errors']} errors."
                ),
            )

        except Exception as exc:

            logger.exception("Pipeline error")

            self.state.update(
                running=False,
                stage="error",
                message=f"Pipeline error: {exc}",
            )

            raise