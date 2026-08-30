import os
import json
import datetime
from fetcher import fetcher
from main import QUICK_LINKS

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(APP_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

print("Fetching fresh feeds for GitHub Pages...")
items = fetcher.get_all_feeds(force_refresh=True)
weather = fetcher.fetch_weather()

# Compute stats
cat_counts = {
    "all": len([it for it in items if it.get("feed_type") in ["city_official", "news"] or it.get("author_verified") == True]),
    "hp": len([it for it in items if it.get("feed_type") == "city_official"]),
    "news": len([it for it in items if it.get("feed_type") == "news"]),
    "sns": len([it for it in items if it.get("feed_type") == "sns"]),
    "event": len([it for it in items if it.get("category") == "event" or "#イベント" in it.get("tags", [])]),
    "disaster": len([it for it in items if "防災" in str(it.get("tags", [])) or "当番医" in it.get("title", "")])
}

tag_counts = {}
for it in items:
    for t in it.get("tags", []):
        tag_counts[t] = tag_counts.get(t, 0) + 1

sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
popular_tags = [{"tag": t, "count": c} for t, c in sorted_tags[:12]]

stats = {
    "counts": cat_counts,
    "popular_tags": popular_tags,
    "total_items": len(items),
    "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
}

# Save JSON datasets
with open(os.path.join(DATA_DIR, "feeds.json"), "w", encoding="utf-8") as f:
    json.dump({"status": "success", "count": len(items), "items": items, "updated_at": datetime.datetime.now().isoformat()}, f, ensure_ascii=False, indent=2)

with open(os.path.join(DATA_DIR, "weather.json"), "w", encoding="utf-8") as f:
    json.dump(weather, f, ensure_ascii=False, indent=2)

with open(os.path.join(DATA_DIR, "stats.json"), "w", encoding="utf-8") as f:
    json.dump(stats, f, ensure_ascii=False, indent=2)

with open(os.path.join(DATA_DIR, "quick_links.json"), "w", encoding="utf-8") as f:
    json.dump(QUICK_LINKS, f, ensure_ascii=False, indent=2)

from render_helper import render_card_html

# Generate root index.html from template with pre-rendered cards (SSR guarantee)
template_path = os.path.join(APP_DIR, "templates", "index.html")
root_index_path = os.path.join(APP_DIR, "index.html")

with open(template_path, "r", encoding="utf-8") as f:
    html = f.read()

# Filter for initial "all" tab
all_tab_items = [it for it in items if it.get("feed_type") in ["city_official", "news"] or it.get("author_verified") == True]
pre_rendered_cards_html = "".join([render_card_html(it) for it in all_tab_items])

# Pre-populate feed-container so page is NEVER white even before JS runs!
html = html.replace(
    '<div id="feed-container" class="space-y-0"></div>',
    f'<div id="feed-container" class="space-y-0">{pre_rendered_cards_html}</div>'
)

# Replace absolute /static/ paths with relative ./static/ paths for GitHub Pages
html = html.replace('href="/static/', 'href="./static/')
html = html.replace('src="/static/', 'src="./static/')

with open(root_index_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Generated GitHub Pages static bundle successfully with SSR cards! Total items: {len(items)}")
