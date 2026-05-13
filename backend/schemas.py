"""
Pydantic v2 schemas for request/response validation.
"""
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class ArticleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:              int
    article_id:      str
    title:           str
    description:     str
    url:             str
    image_url:       str
    source:          str
    author:          str
    category:        str
    country:         str
    published_at:    datetime
    summary:         str
    sentiment:       str
    sentiment_score: float
    insights:        list[str]
    keywords:        list[str]
    ai_processed:    bool
    created_at:      datetime


class ArticleList(BaseModel):
    articles:    list[ArticleResponse]
    total:       int
    page:        int
    per_page:    int
    total_pages: int


class SourceCount(BaseModel):
    source: str
    count:  int


class StatsResponse(BaseModel):
    total_articles:          int
    processed_articles:      int
    sentiment_distribution:  dict[str, int]
    category_distribution:   dict[str, int]
    average_sentiment_score: float
    top_sources:             list[SourceCount]


class PipelineStatusResponse(BaseModel):
    running:    bool
    stage:      str
    fetched:    int
    processed:  int
    total:      int
    errors:     int
    message:    str
    started_at: Optional[str]
