"""
ORM models for the News Intelligence Platform.
"""
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Float, Integer,
    String, Text, Index
)
from sqlalchemy.types import JSON
from database import Base


class Article(Base):
    __tablename__ = "articles"

    id             = Column(Integer, primary_key=True, index=True)
    article_id     = Column(String(256), unique=True, nullable=False)   # NewsData.io id
    content_hash   = Column(String(64), unique=True, nullable=False)    # dedup key

    # --- raw fields ---
    title          = Column(String(600), nullable=False)
    description    = Column(Text, default="")
    content        = Column(Text, default="")
    url            = Column(String(1000), default="")
    image_url      = Column(String(1000), default="")
    source         = Column(String(200), default="")
    author         = Column(String(300), default="")
    category       = Column(String(100), default="general")
    country        = Column(String(200), default="")
    language       = Column(String(10), default="en")
    published_at   = Column(DateTime, default=datetime.utcnow)

    # --- AI-generated fields ---
    summary        = Column(Text, default="")
    sentiment      = Column(String(20), default="neutral")   # positive | negative | neutral
    sentiment_score = Column(Float, default=0.0)             # -1.0 … +1.0
    insights       = Column(JSON, default=list)              # list[str]
    keywords       = Column(JSON, default=list)              # list[str]
    ai_processed   = Column(Boolean, default=False, index=True)

    created_at     = Column(DateTime, default=datetime.utcnow)

    # Composite indexes for common query patterns
    __table_args__ = (
        Index("ix_articles_sentiment_published", "sentiment", "published_at"),
        Index("ix_articles_category_published", "category", "published_at"),
    )
