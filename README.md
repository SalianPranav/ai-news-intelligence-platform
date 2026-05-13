  # 📰 News Intelligence Platform
  
  > > **AI-powered news dashboard** — real-time fetching, Gemini-powered analysis, and a polished interactive UI.
  
  ![Tech Stack](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi)
![Tech Stack](https://img.shields.io/badge/AI-Google%20Gemini-4285F4?logo=google)
  ![Tech Stack](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?logo=react)
  ![Tech Stack](https://img.shields.io/badge/Database-SQLite%20%2F%20PostgreSQL-003B57?logo=sqlite)
  
  ---
  
  ## ✨ Features
  
  | Feature | Details |
  |---|---|
  | 🔄 **Data Pipeline** | Paginated NewsData.io API fetch with retries, back-off, and deduplication |
  | 🤖 **AI Analysis** | Google Gemini: 1-2 sentence summaries, sentiment analysis, key insights, and keyword extraction |
  | 📊 **Charts** | Sentiment pie chart + category bar chart (Recharts) |
  | 🔍 **Search & Filter** | Full-text search, sentiment filter, category filter, sort options |
  | 📄 **Pagination** | 20 articles/page, configurable |
  | 🌙 **Dark UI** | Responsive, glass-morphism design — desktop + mobile |
  | 🗄️ **Database** | SQLite (zero-setup) or PostgreSQL (swap one env var) |
  
  ---
  
  ## 🏗 Architecture
  
  ```
  ┌─────────────────────────────────────────────────┐
  │                   Browser (React)               │
  │  Dashboard ── Charts ── Article Grid ── Modal   │
  └────────────────────┬────────────────────────────┘
                       │ REST + SSE
  ┌────────────────────▼────────────────────────────┐
  │              FastAPI Backend                    │
  │  /api/pipeline   /api/articles   /api/stats     │
  └──────┬───────────────────┬───────────────────────┘
         │                   │
  ┌──────▼──────┐    ┌───────▼────────┐
  │ NewsData.io │    │ SQLite / PG DB │
  │    API      │    │ (SQLAlchemy)   │
  └─────────────┘    └────────────────┘
         │
  ┌──────▼──────┐
  │ Google      │
  │ Gemini API  │
  └─────────────┘
  ```
  
  **Pipeline flow:**
  1. `fetch` – paginated NewsData.io calls with exponential back-off
  2. `clean` – validate, normalise fields, MD5 deduplication
  3. `store` – bulk insert new articles (skip duplicates)
  4. `analyse` – concurrent Gemini AI analysis calls
  5. `update` – write AI-generated insights back to the database
  
  ---
  
  ## ⚡ Quick Start (under 5 minutes)
  
  ### Prerequisites
  - Python 3.11+
  - Node.js 18+
  - A free [NewsData.io](https://newsdata.io/register) API key
  - A Google Gemini API key
  
  ### 1 — Clone & configure
  
  ```bash
  git clone https://github.com/YOUR_USERNAME/news-intelligence-platform.git
  cd news-intelligence-platform
  cp .env.example .env
  # Edit .env with your API keys (takes 30 seconds)
  ```
  
  ### 2 — Backend
  
  ```bash
  cd backend
  python -m venv venv
  source venv/bin/activate        # Windows: venv\Scripts\activate
  pip install -r requirements.txt
  uvicorn main:app --reload
  # → API running at http://localhost:8000
  # → Swagger docs at http://localhost:8000/docs
  ```
  
  ### 3 — Frontend (new terminal)
  
  ```bash
  cd frontend
  npm install
  npm run dev
  # → UI running at http://localhost:5173
  ```
  
  ### 4 — Run the pipeline
  
  Open **http://localhost:5173**, click **Run Pipeline**, and watch articles get fetched and analysed in real time.
  
  ---
  
  ## 🗂 Project Structure
  
  ```
  news-intelligence-platform/
  ├── backend/
  │   ├── main.py          # FastAPI app, all endpoints
  │   ├── pipeline.py      # Async fetch → clean → store → AI analyse
  │   ├── models.py        # SQLAlchemy ORM models
  │   ├── schemas.py       # Pydantic v2 schemas
  │   ├── database.py      # DB engine + session
  │   └── requirements.txt
  ├── frontend/
  │   ├── src/
  │   │   ├── App.jsx      # Full dashboard (pipeline, stats, charts, articles)
  │   │   ├── api.js       # Axios API client
  │   │   ├── main.jsx     # React entry point
  │   │   └── index.css    # Tailwind + custom design tokens
  │   ├── vite.config.js
  │   └── package.json
  ├── .env.example         # Required environment variables
  └── README.md
  ```
  
  ---
  
  ## 🔌 API Reference
  
  | Method | Endpoint | Description |
  |---|---|---|
  | `POST` | `/api/pipeline/run?count=100` | Start fetch + AI pipeline |
  | `GET`  | `/api/pipeline/status`        | Poll pipeline state |
  | `GET`  | `/api/articles`               | Paginated article list (search, filter, sort) |
  | `GET`  | `/api/articles/{id}`          | Single article detail |
  | `GET`  | `/api/stats`                  | Aggregate dashboard stats |
  | `GET`  | `/api/categories`             | Available categories |
  
  Full interactive docs: `http://localhost:8000/docs`
  
  ---
  
  ## 🛠 Technology Decisions
  
  | Choice | Rationale |
  |---|---|
  | **FastAPI** | Async-native, automatic OpenAPI docs, excellent Python typing support |
  | **SQLAlchemy + SQLite** | Zero-setup default; production swap to Postgres is one env-var change |
  | **Google Gemini** | Used for AI-generated summaries, sentiment analysis, keyword extraction, and insights |
  | **aiohttp + asyncio.Semaphore** | Concurrent pipeline without hammering external APIs — 5 parallel AI calls |
  | **React + Vite + Tailwind** | Fast DX, zero-config HMR, utility-first CSS without runtime overhead |
  | **Recharts** | React-native charts, no canvas issues, easy theming |
  
  ---
  
  ## 🚀 Production Deployment
  
  ```bash
  # Backend — swap SQLite for Postgres in .env, then:
  uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
  
  # Frontend — build static assets, serve via nginx / Vercel / Netlify:
  cd frontend && npm run build  # outputs to dist/
  ```
  
  Deploy backend to **Railway / Render / Fly.io** (free tiers available).  
  Deploy frontend to **Vercel** or **Netlify** (drag-and-drop `dist/` folder).
  
  ---
  
  ## 💡 Future Enhancements
  
  - **Named entity recognition** — extract people, companies, locations per article
  - **Topic clustering** — group similar articles using AI embeddings
  - **Email digest** — daily summary of top stories by category
  - **User bookmarks** — save articles with persistent storage
  - **Scheduled pipeline** — cron job to auto-refresh articles every hour
  - **Export** — download filtered articles as CSV/JSON
  - **Multi-language** — support non-English news sources via translation
  
  ---
  
  ## 📝 License
  
  MIT — free to use, modify, and distribute.
