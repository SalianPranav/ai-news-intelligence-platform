# Submission Cover Letter — Datastraw AI + Tech Intern Assessment

---

**To:** jignesh.ponamwar@datastraw.in  
**CC:** hr@datastraw.in  
**Subject:** Internship Assessment Submission — AI-Powered News Intelligence Platform

---

Hi Jignesh,

Please find my completed assessment submission below.

## GitHub Repository
🔗 **[https://github.com/YOUR_USERNAME/news-intelligence-platform](https://github.com/YOUR_USERNAME/news-intelligence-platform)**

The README contains setup instructions that take under 5 minutes.

---

## Approach & Technology Rationale

I built a fully async, end-to-end news intelligence pipeline with a real-time React dashboard.

**Backend — FastAPI + Python:**
FastAPI gave me async-native request handling and automatic OpenAPI documentation (available at `/docs`). SQLAlchemy with SQLite means zero-setup for reviewers — switching to PostgreSQL in production requires changing one environment variable.

**AI — Anthropic Claude Haiku:**
I chose Claude Haiku for the batch analysis because it offers the best speed-to-quality ratio for structured extraction tasks. Each article is analysed in a single prompt that returns JSON: a 1-2 sentence summary, sentiment label + score, 3-5 key insights, and 5 keywords. Concurrent calls are rate-limited to 5 in-flight at a time using `asyncio.Semaphore`.

**Pipeline Design:**
The pipeline runs as an async background task so the API stays responsive. Real-time progress is pushed to the browser via Server-Sent Events — no polling needed.

**Frontend — React + Vite + Tailwind + Recharts:**
A dark-themed glass-morphism dashboard with sentiment charts, category breakdowns, full-text search, multi-filter support, pagination, and an article detail modal — all updating instantly as data arrives.

---

## What I'm Most Proud Of

1. **Real-time SSE progress bar** — the pipeline progress streams live into the browser; no refresh needed
2. **Robust deduplication** — articles are fingerprinted by MD5(title + source) to prevent duplicates across pipeline runs
3. **Concurrent AI processing** — 5 parallel Claude calls reduce total analysis time by ~5×
4. **Production-ready structure** — the architecture (async pipeline, typed schemas, proper indexes) scales cleanly to PostgreSQL + multiple workers

---

## What I Would Add With More Time

- Scheduled background refresh (hourly cron)
- Named entity extraction (people, companies, places) per article
- Semantic article clustering with embeddings
- User bookmark system
- CSV / JSON export of filtered results
- Full deployment to Railway (backend) + Vercel (frontend) with a live URL

---

Thank you for the opportunity — I enjoyed the challenge and learned a lot building this. I'd love to discuss the implementation further.

Best regards,  
[YOUR NAME]  
[YOUR PHONE]  
[YOUR EMAIL]
