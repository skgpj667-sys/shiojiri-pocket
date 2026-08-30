import os
import json
import datetime
from typing import Optional
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from fetcher import fetcher

app = FastAPI(title="Shiojiri Pocket - しおじりインフォ", version="1.0.0")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
DATA_DIR = os.path.join(BASE_DIR, "data")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Useful Quick Links for Shiojiri Residents and Visitors
QUICK_LINKS = [
    {
        "title": "夜間・休日当番医",
        "desc": "今週末・休日の診療当番病院と薬局",
        "icon": "stethoscope",
        "url": "https://www.city.shiojiri.lg.jp/soshiki/28/2542.html",
        "category": "health",
        "badge": "緊急医療"
    },
    {
        "title": "地域振興バス「すてっぷくん」",
        "desc": "運行ルート・時刻表・リアルタイム位置",
        "icon": "bus",
        "url": "https://www.city.shiojiri.lg.jp/soshiki/33/3119.html",
        "category": "transit",
        "badge": "交通"
    },
    {
        "title": "しおじり生活応援券",
        "desc": "物価高騰対策事業・取扱店舗一覧",
        "icon": "gift",
        "url": "https://www.city.shiojiri.lg.jp/soshiki/29/60700.html",
        "category": "living",
        "badge": "生活支援"
    },
    {
        "title": "ごみ収集カレンダー・分別",
        "desc": "地区別収集日程と資源物分別ガイド",
        "icon": "trash-2",
        "url": "https://www.city.shiojiri.lg.jp/soshiki/17/3001.html",
        "category": "living",
        "badge": "くらし"
    },
    {
        "title": "塩尻市防災ハザードマップ",
        "desc": "土砂災害・洪水避難所マップ",
        "icon": "shield-alert",
        "url": "https://www.city.shiojiri.lg.jp/site/bousai/",
        "category": "disaster",
        "badge": "防災"
    },
    {
        "title": "塩尻市観光ガイド（時めぐり）",
        "desc": "奈良井宿・桔梗ヶ原ワイナリー・木曽漆器",
        "icon": "map-pin",
        "url": "https://tokimeguri.jp/",
        "category": "tourism",
        "badge": "観光"
    },
    {
        "title": "えんぱーく (塩尻市市民交流センター)",
        "desc": "塩尻市立図書館・イベント・子育て広場",
        "icon": "book-open",
        "url": "https://www.city.shiojiri.lg.jp/site/enpark/",
        "category": "culture",
        "badge": "施設"
    },
    {
        "title": "塩尻市公式 X (旧Twitter)",
        "desc": "@shiojiri_city 市政・災害・イベント広報",
        "icon": "twitter",
        "url": "https://x.com/shiojiri_city",
        "category": "sns",
        "badge": "公式X"
    },
    {
        "title": "塩尻市観光協会 公式Instagram",
        "desc": "@shiojiri_kanko 奈良井宿・ワイナリー・観光情報",
        "icon": "camera",
        "url": "https://www.instagram.com/shiojiri_kanko/",
        "category": "sns",
        "badge": "公式インスタ"
    },
    {
        "title": "塩尻市役所 公式Facebook",
        "desc": "塩尻市役所公式フェイスブックページ",
        "icon": "facebook",
        "url": "https://www.facebook.com/shiojiricity/?locale=ja_JP",
        "category": "sns",
        "badge": "公式FB"
    },
    {
        "title": "塩尻市役所 公式LINE",
        "desc": "くらし・防災・ごみ収集・友だち追加",
        "icon": "message-circle",
        "url": "https://lin.ee/we70V0i",
        "category": "sns",
        "badge": "公式LINE"
    }
]

from fastapi.responses import HTMLResponse, JSONResponse, FileResponse

@app.get("/healthz")
async def health_check():
    return JSONResponse({"status": "ok", "app": "shiojiri-pocket"})

from render_helper import render_card_html

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(TEMPLATES_DIR, "index.html")
    with open(index_file, "r", encoding="utf-8") as f:
        html = f.read()

    try:
        items = fetcher.get_all_feeds()
        all_tab_items = [it for it in items if it.get("feed_type") in ["city_official", "news"] or it.get("author_verified") == True]
        cards_html = "".join([render_card_html(it) for it in all_tab_items])
        html = html.replace(
            '<div id="feed-container" class="space-y-0"></div>',
            f'<div id="feed-container" class="space-y-0">{cards_html}</div>'
        )
    except Exception as e:
        print(f"SSR render error: {e}")

    return HTMLResponse(content=html)

@app.get("/api/tunnel-url")
async def get_tunnel_url():
    url_file = os.path.join(STATIC_DIR, "tunnel_url.txt")
    if os.path.exists(url_file):
        try:
            with open(url_file, "r", encoding="utf-8") as f:
                url = f.read().strip()
                if url.startswith("https://"):
                    return JSONResponse({"status": "success", "url": url})
        except Exception:
            pass
    return JSONResponse({"status": "fallback", "url": None})

@app.get("/api/weather")
async def get_weather():
    weather_data = fetcher.fetch_weather()
    return JSONResponse(weather_data)

@app.get("/api/feeds")
async def get_feeds(
    category: str = "all",
    platform: Optional[str] = None,
    query: Optional[str] = None,
    tag: Optional[str] = None,
    force_refresh: bool = False
):
    items = fetcher.get_all_feeds(force_refresh=force_refresh)

    # Return raw items directly for ultra-fast client-side caching engine
    if category == "raw":
        return JSONResponse({
            "status": "success",
            "count": len(items),
            "total_unfiltered": len(items),
            "last_updated": fetcher.last_fetched.strftime("%Y-%m-%d %H:%M:%S") if fetcher.last_fetched else None,
            "items": items
        })

    # Filter by category
    if category == "all":
        # On main timeline, only show Official HP, News, and Verified Official SNS posts (no raw community X spam)
        items = [it for it in items if it.get("feed_type") in ["city_official", "news"] or it.get("author_verified") == True]
    elif category and category != "all":
        if category == "disaster":
            items = [it for it in items if "防災" in str(it.get("tags", [])) or "当番医" in it.get("title", "") or "警報" in it.get("title", "") or it.get("category") == "disaster"]
        elif category == "hp":
            items = [it for it in items if it.get("category") in ["hp", "event"] and it.get("feed_type") == "city_official"]
        elif category == "event":
            items = [it for it in items if it.get("category") == "event" or "#イベント" in it.get("tags", [])]
        elif category == "sns":
            items = [it for it in items if it.get("feed_type") == "sns"]
        elif category == "news":
            items = [it for it in items if it.get("feed_type") == "news"]

    # Filter by platform (for SNS)
    if platform and platform != "all":
        items = [it for it in items if it.get("platform") == platform]

    # Filter by tag
    if tag and isinstance(tag, str):
        tag_clean = tag if tag.startswith("#") else f"#{tag}"
        items = [it for it in items if any(tag_clean.lower() in t.lower() for t in it.get("tags", []))]

    # Filter by search keyword
    if query:
        q_lower = query.lower()
        items = [
            it for it in items
            if q_lower in it.get("title", "").lower()
            or q_lower in it.get("summary", "").lower()
            or q_lower in it.get("author", "").lower()
            or any(q_lower in t.lower() for t in it.get("tags", []))
        ]

    # Ensure final list is strictly sorted by datetime_iso descending (newest first)
    items.sort(key=lambda item: item.get("datetime_iso", ""), reverse=True)

    return JSONResponse({
        "status": "success",
        "count": len(items),
        "total_unfiltered": len(fetcher.cached_items),
        "last_updated": fetcher.last_fetched.strftime("%Y-%m-%d %H:%M:%S") if fetcher.last_fetched else None,
        "items": items
    })

@app.get("/api/stats")
async def get_stats():
    items = fetcher.get_all_feeds()
    
    cat_counts = {
        "all": len([it for it in items if it.get("feed_type") in ["city_official", "news"] or it.get("author_verified") == True]),
        "hp": len([it for it in items if it.get("feed_type") == "city_official"]),
        "news": len([it for it in items if it.get("feed_type") == "news"]),
        "sns": len([it for it in items if it.get("feed_type") == "sns"]),
        "event": len([it for it in items if it.get("category") == "event" or "#イベント" in it.get("tags", [])]),
        "disaster": len([it for it in items if "防災" in str(it.get("tags", [])) or "当番医" in it.get("title", "")])
    }

    # Extract top tags
    tag_counts = {}
    for it in items:
        for t in it.get("tags", []):
            tag_counts[t] = tag_counts.get(t, 0) + 1

    sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)

    return JSONResponse({
        "counts": cat_counts,
        "popular_tags": [{"tag": t[0], "count": t[1]} for t in sorted_tags[:12]],
        "last_updated": fetcher.last_fetched.strftime("%Y-%m-%d %H:%M:%S") if fetcher.last_fetched else None
    })

@app.get("/api/quick-links")
async def get_quick_links():
    return JSONResponse(QUICK_LINKS)

@app.post("/api/refresh")
async def refresh_feeds():
    items = fetcher.get_all_feeds(force_refresh=True)
    weather = fetcher.fetch_weather()
    return JSONResponse({
        "status": "success",
        "message": f"Successfully updated feeds ({len(items)} items)",
        "count": len(items),
        "weather": weather
    })

if __name__ == "__main__":
    import uvicorn
    print("Starting Shiojiri Info Hub on http://localhost:8000 ...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
