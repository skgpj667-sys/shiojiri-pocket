/**
 * Shiojiri Pocket - Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Lucide Icons initialization
  if (window.lucide) {
    lucide.createIcons();
  }

  // App State
  const state = {
    activeTab: 'all',
    selectedPlatform: 'all', // 'all', 'x', 'instagram', 'line', 'emergency'
    searchQuery: '',
    selectedTag: null,
    items: [],
    weather: null,
    stats: null,
    quickLinks: [],
    bookmarks: new Set(JSON.parse(localStorage.getItem('shiojiri_bookmarks') || '[]')),
    userLikes: new Set(JSON.parse(localStorage.getItem('shiojiri_likes') || '[]')),
    theme: localStorage.getItem('shiojiri_theme') || 'light',
    fontSize: localStorage.getItem('shiojiri_fontsize') || 'md',
    isPhoneFrame: localStorage.getItem('shiojiri_frame') !== 'false',
    isRefreshing: false,
    selectedItem: null,
    popularTags: []
  };

  // DOM Elements
  const feedContainer = document.getElementById('feed-container');
  const emptyState = document.getElementById('empty-state');
  const loadingSkeleton = document.getElementById('loading-skeleton');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const snsPlatformFilter = document.getElementById('sns-platform-filter');
  const tagContainer = document.getElementById('tag-chips-container');
  const refreshBtn = document.getElementById('refresh-btn');
  const refreshIcon = document.getElementById('refresh-icon');
  const refreshToast = document.getElementById('refresh-toast');
  const frameToggleBtn = document.getElementById('frame-toggle-btn');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const quickLinksBtn = document.getElementById('quick-links-btn');
  const quickLinksModal = document.getElementById('quick-links-modal');
  const itemDetailModal = document.getElementById('item-detail-modal');
  const weatherWidget = document.getElementById('weather-widget');
  const weatherDetailModal = document.getElementById('weather-detail-modal');
  const tickerText = document.getElementById('ticker-text');
  const countBadges = document.querySelectorAll('.tab-count-badge');
  const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
  const fontSizeBtns = document.querySelectorAll('.font-size-btn');

  // Initialize theme and font size
  applyTheme(state.theme);
  applyFontSize(state.fontSize);
  applyFrameMode(state.isPhoneFrame);

  // Initial Load
  init();

  async function init() {
    try {
      setupEventListeners();
    } catch (e) {
      console.warn('Listener setup notice:', e);
    }

    // Unregister any stale service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      }).catch(() => {});
    }

    // 1. Standalone Google Bundle Hydration
    if (window.__SHIOJIRI_INITIAL_DATA__) {
      const pre = window.__SHIOJIRI_INITIAL_DATA__;
      if (pre.feeds) {
        allFeedsCache = pre.feeds;
        applyFilterAndRender();
      }
      if (pre.weather) renderWeatherWidget(pre.weather);
      if (pre.stats) renderStats(pre.stats);
      if (pre.quickLinks) {
        state.quickLinks = pre.quickLinks;
        renderQuickLinksModal(state.quickLinks);
      }
      showLoading(false);
      return;
    }

    // 2. Fetch data directly with 0 latency
    await loadFeeds(false);
    fetchStats();
    fetchWeather();
    fetchQuickLinks();
  }

  function setupEventListeners() {
    // Tab switching (Top tabs & Bottom nav)
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchTab(tab);
      });
    });

    bottomNavItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.dataset.tab;
        if (tab === 'quick') {
          openQuickLinksModal();
        } else {
          switchTab(tab);
        }
      });
    });

    // Search input
    let debounceTimer;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        state.searchQuery = val;
        if (searchClearBtn) searchClearBtn.classList.toggle('hidden', val.length === 0);
        
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadFeeds();
        }, 250);
      });
    }

    if (searchClearBtn && searchInput) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        searchClearBtn.classList.add('hidden');
        loadFeeds();
        searchInput.focus();
      });
    }

    // Refresh Button
    if (refreshBtn) {
      refreshBtn.addEventListener('click', handleManualRefresh);
    }

    // Frame Toggle (PC View)
    if (frameToggleBtn) {
      frameToggleBtn.addEventListener('click', () => {
        state.isPhoneFrame = !state.isPhoneFrame;
        localStorage.setItem('shiojiri_frame', state.isPhoneFrame);
        applyFrameMode(state.isPhoneFrame);
      });
    }

    // Theme Toggle
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('shiojiri_theme', state.theme);
        applyTheme(state.theme);
      });
    }

    // Font size buttons
    fontSizeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const size = btn.dataset.size;
        state.fontSize = size;
        localStorage.setItem('shiojiri_fontsize', size);
        applyFontSize(size);
      });
    });

    // Weather widget click -> Detail
    if (weatherWidget) {
      weatherWidget.addEventListener('click', openWeatherModal);
    }

    // Quick links button
    if (quickLinksBtn) {
      quickLinksBtn.addEventListener('click', openQuickLinksModal);
    }

    // Phone QR buttons (Desktop header and App header)
    const phoneQrBtn = document.getElementById('phone-qr-btn');
    const phoneQrBtnDesktop = document.getElementById('phone-qr-btn-desktop');
    if (phoneQrBtn) phoneQrBtn.addEventListener('click', openPhoneQrModal);
    if (phoneQrBtnDesktop) phoneQrBtnDesktop.addEventListener('click', openPhoneQrModal);

    // Modal Close buttons
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        closeAllModals();
      });
    });

    // Close modal on backdrop click
    const phoneQrModal = document.getElementById('phone-qr-modal');
    [quickLinksModal, itemDetailModal, weatherDetailModal, phoneQrModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            closeAllModals();
          }
        });
      }
    });

    // Keyboard navigation (Escape to close modal)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
      }
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    state.selectedTag = null; // reset tag filter on tab change

    // Update Top Tabs UI
    tabButtons.forEach(btn => {
      const isSelected = btn.dataset.tab === tab;
      btn.classList.toggle('active-tab', isSelected);
      btn.classList.toggle('bg-purple-700', isSelected);
      btn.classList.toggle('text-white', isSelected);
      btn.classList.toggle('text-slate-600', !isSelected);
      btn.classList.toggle('dark:text-slate-300', !isSelected);
    });

    // Update Bottom Nav UI
    bottomNavItems.forEach(item => {
      const isSelected = item.dataset.tab === tab;
      item.classList.toggle('text-purple-600', isSelected);
      item.classList.toggle('dark:text-purple-400', isSelected);
      item.classList.toggle('font-bold', isSelected);
      item.classList.toggle('text-slate-500', !isSelected);
      item.classList.toggle('dark:text-slate-400', !isSelected);
    });

    // Instant Zero-Latency Render from in-memory cache (0ms)
    applyFilterAndRender();
  }

  window.shiojiriSwitchTab = switchTab;

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      themeToggleBtn.innerHTML = '<i data-lucide="sun" class="w-5 h-5 text-amber-400"></i>';
    } else {
      document.documentElement.classList.remove('dark');
      themeToggleBtn.innerHTML = '<i data-lucide="moon" class="w-5 h-5 text-slate-700"></i>';
    }
    if (window.lucide) lucide.createIcons();
  }

  function applyFontSize(size) {
    document.body.classList.remove('font-size-md', 'font-size-lg', 'font-size-xl');
    document.body.classList.add(`font-size-${size}`);
    fontSizeBtns.forEach(btn => {
      btn.classList.toggle('ring-2', btn.dataset.size === size);
      btn.classList.toggle('ring-purple-500', btn.dataset.size === size);
    });
  }

  function applyFrameMode(isFrame) {
    const root = document.getElementById('app-wrapper');
    if (!root) return;
    if (isFrame) {
      root.classList.remove('fullscreen-mode');
      if (frameToggleBtn) frameToggleBtn.innerHTML = '<i data-lucide="maximize-2" class="w-4 h-4 mr-1"></i>全画面';
    } else {
      root.classList.add('fullscreen-mode');
      if (frameToggleBtn) frameToggleBtn.innerHTML = '<i data-lucide="smartphone" class="w-4 h-4 mr-1"></i>スマホ枠';
    }
    if (window.lucide) lucide.createIcons();
  }

  // --- API Calls & In-Memory Cache Engine ---

  async function fetchWeather() {
    try {
      let res = await fetch(`./data/weather.json?_t=${Date.now()}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('/api/weather').catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        state.weather = data;
        renderWeatherWidget(data);
      }
    } catch (e) {}
  }

  async function fetchStats() {
    try {
      let res = await fetch(`./data/stats.json?_t=${Date.now()}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('/api/stats').catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        state.stats = data;
        renderStats(data);
      }
    } catch (e) {}
  }

  async function fetchQuickLinks() {
    try {
      let res = await fetch(`./data/quick_links.json?_t=${Date.now()}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch('/api/quick-links').catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        state.quickLinks = data;
        renderQuickLinksModal(data);
      }
    } catch (e) {}
  }

  let allFeedsCache = null;

  async function loadFeeds(forceRefresh = false) {
    // 1. Instant Cache Hit (0ms)
    if (allFeedsCache && !forceRefresh) {
      showLoading(false);
      applyFilterAndRender();
      return;
    }

    try {
      // Try all potential endpoints sequentially with 0 latency
      let res = await fetch(`./data/feeds.json?_t=${Date.now()}`).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch(`/data/feeds.json?_t=${Date.now()}`).catch(() => null);
      }
      if (!res || !res.ok) {
        res = await fetch(`/api/feeds?category=raw&force_refresh=${forceRefresh ? 'true' : 'false'}`).catch(() => null);
      }
      if (!res || !res.ok) {
        res = await fetch(`/api/feeds`).catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        allFeedsCache = data.items || [];
      }
    } catch (e) {
      console.error('Failed to load feeds:', e);
    } finally {
      showLoading(false);
      applyFilterAndRender();
    }
  }

  // --- Instant In-Memory Filter & Render (0ms) ---
  async function applyFilterAndRender() {
    if (!allFeedsCache || allFeedsCache.length === 0) {
      try {
        let res = await fetch(`./data/feeds.json?_t=${Date.now()}`).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`/data/feeds.json?_t=${Date.now()}`).catch(() => null);
        }
        if (!res || !res.ok) {
          res = await fetch(`/api/feeds?category=raw`).catch(() => null);
        }
        if (res && res.ok) {
          const data = await res.json();
          allFeedsCache = data.items || [];
        }
      } catch (e) {}
    }

    if (!allFeedsCache || allFeedsCache.length === 0) return;

    let filtered = [...allFeedsCache];

    // Filter by Active Tab
    if (state.activeTab === 'all') {
      filtered = filtered.filter(it => it.feed_type === 'city_official' || it.feed_type === 'news' || it.author_verified === true);
    } else if (state.activeTab === 'hp') {
      filtered = filtered.filter(it => it.feed_type === 'city_official');
    } else if (state.activeTab === 'news') {
      filtered = filtered.filter(it => it.feed_type === 'news');
    } else if (state.activeTab === 'sns') {
      filtered = filtered.filter(it => it.feed_type === 'sns');
    }

    // Filter by SNS Sub-Platform
    if (state.activeTab === 'sns' && state.selectedPlatform && state.selectedPlatform !== 'all') {
      filtered = filtered.filter(it => it.platform === state.selectedPlatform);
    }

    // Filter by Tag
    if (state.selectedTag) {
      const tagClean = state.selectedTag.toLowerCase();
      filtered = filtered.filter(it => (it.tags || []).some(t => t.toLowerCase().includes(tagClean)));
    }

    // Filter by Search Query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(it => 
        (it.title && it.title.toLowerCase().includes(q)) || 
        (it.summary && it.summary.toLowerCase().includes(q)) ||
        (it.author && it.author.toLowerCase().includes(q)) ||
        (it.source && it.source.toLowerCase().includes(q))
      );
    }

    state.items = filtered;
    renderFeedList(filtered);
  }

  async function handleManualRefresh() {
    if (state.isRefreshing) return;
    state.isRefreshing = true;
    refreshIcon.classList.add('spin-refresh');

    showToast('最新情報を取得中...');

    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();
      await Promise.all([
        fetchWeather(),
        fetchStats(),
        loadFeeds(true)
      ]);
      showToast('最新の塩尻市情報を更新しました！ ✨');
    } catch (e) {
      console.error(e);
      showToast('更新中にエラーが発生しました');
    } finally {
      setTimeout(() => {
        state.isRefreshing = false;
        refreshIcon.classList.remove('spin-refresh');
      }, 600);
    }
  }

  function showToast(msg) {
    if (!refreshToast) return;
    refreshToast.textContent = msg;
    refreshToast.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
    refreshToast.classList.add('opacity-100', 'translate-y-0');
    setTimeout(() => {
      refreshToast.classList.remove('opacity-100', 'translate-y-0');
      refreshToast.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    }, 2500);
  }

  function showLoading(isLoading) {
    if (isLoading) {
      if (loadingSkeleton) loadingSkeleton.classList.remove('hidden');
      if (emptyState) emptyState.classList.add('hidden');
    } else {
      if (loadingSkeleton) loadingSkeleton.classList.add('hidden');
    }
  }

  // --- Rendering ---

  function renderWeatherWidget(w) {
    if (!w) return;
    
    const iconSpan = document.getElementById('weather-inline-icon');
    const textSpan = document.getElementById('weather-inline-text');
    const popSpan = document.getElementById('weather-inline-pop');

    const emojiIcons = {
      sun: '☀️',
      sun_cloud: '⛅',
      cloud: '☁️',
      cloud_rain: '🌧️',
      cloud_snow: '❄️',
      cloud_lightning: '⚡',
      cloud_fog: '🌫️'
    };

    if (iconSpan) iconSpan.textContent = emojiIcons[w.weather_icon] || '☀️';
    if (textSpan) textSpan.textContent = `${w.temp}°C`;
    if (popSpan) popSpan.textContent = `☔${w.pop_today || 0}%`;
  }

  function renderStats(stats) {
    if (!stats) return;

    // Render counts on tabs
    const counts = stats.counts || {};
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const tab = btn.dataset.tab;
      const countEl = btn.querySelector('.tab-count');
      if (countEl && counts[tab] !== undefined) {
        countEl.textContent = counts[tab];
      }
    });

    // Render Popular Tags
    if (tagContainer && stats.popularTags) {
      let tagHtml = `
        <button class="tag-chip shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${state.selectedTag === null ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}" data-tag="all">
          すべて
        </button>
      `;

      stats.popularTags.forEach(item => {
        const isSelected = state.selectedTag === item.tag;
        tagHtml += `
          <button class="tag-chip shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${isSelected ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}" data-tag="${item.tag}">
            ${item.tag} <span class="text-[10px] opacity-70">(${item.count})</span>
          </button>
        `;
      });

      tagContainer.innerHTML = tagHtml;

      // Add tag click listeners
      tagContainer.querySelectorAll('.tag-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const tag = btn.dataset.tag;
          state.selectedTag = tag === 'all' ? null : tag;
          
          tagContainer.querySelectorAll('.tag-chip').forEach(b => {
            const active = (state.selectedTag === null && b.dataset.tag === 'all') || (state.selectedTag === b.dataset.tag);
            b.className = `tag-chip shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${active ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'}`;
          });

          loadFeeds();
        });
      });
    }
  }

  function renderFeedList(items) {
    if (!items || items.length === 0) {
      feedContainer.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    let html = '';

    // If SNS tab, prepend official quick link pills (Full Width 4-Columns, No Scroll)
    if (state.activeTab === 'sns') {
      html += `
        <div class="px-3 py-1.5 bg-purple-50/70 dark:bg-purple-950/40 border-b border-purple-100 dark:border-purple-900">
          <div class="grid grid-cols-4 gap-1.5 w-full">
            <a href="https://x.com/shiojiri_city" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center space-x-0.5 py-1 px-1 rounded-lg bg-black text-white text-[11px] font-bold hover:opacity-90 shadow-xs transition-all text-center">
              <span>𝕏</span>
              <span class="text-[10px]">公式</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-70"></i>
            </a>
            <a href="https://www.instagram.com/shiojiri_kanko/" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center space-x-0.5 py-1 px-0.5 rounded-lg bg-gradient-to-r from-pink-600 to-amber-500 text-white text-[11px] font-bold hover:opacity-90 shadow-xs transition-all text-center">
              <span>📸</span>
              <span class="text-[10px]">インスタ</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-70"></i>
            </a>
            <a href="https://www.facebook.com/shiojiricity/?locale=ja_JP" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center space-x-0.5 py-1 px-0.5 rounded-lg bg-[#1877f2] text-white text-[11px] font-bold hover:opacity-90 shadow-xs transition-all text-center">
              <span>📘</span>
              <span class="text-[10px]">Facebook</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-70"></i>
            </a>
            <a href="https://lin.ee/we70V0i" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center space-x-0.5 py-1 px-1 rounded-lg bg-[#06c755] text-white text-[11px] font-bold hover:opacity-90 shadow-xs transition-all text-center">
              <span>💬</span>
              <span class="text-[10px]">LINE</span>
              <i data-lucide="external-link" class="w-2.5 h-2.5 opacity-70"></i>
            </a>
          </div>
        </div>
      `;
    }

    html += items.map(item => createCardHTML(item)).join('');
    feedContainer.innerHTML = html;

    if (window.lucide) lucide.createIcons();

    attachCardListeners();
  }

  function createCardHTML(item) {
    const isBookmarked = state.bookmarks.has(item.id);

    // Source Badge Configuration
    let sourceBadge = '';
    let authorDisplay = item.author || '';

    if (item.feed_type === 'city_official') {
      sourceBadge = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
        🏛️ 市公式HP
      </span>`;
      authorDisplay = item.source || '塩尻市役所';
    } else if (item.feed_type === 'news') {
      sourceBadge = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
        📰 ${item.source || '地域ニュース'}
      </span>`;
      authorDisplay = item.source || 'ニュース';
    } else if (item.feed_type === 'sns') {
      if (item.platform === 'x') {
        sourceBadge = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black bg-black text-white dark:bg-slate-800 shrink-0">
          𝕏
        </span>`;
        authorDisplay = `${item.author}`;
      } else if (item.platform === 'instagram') {
        sourceBadge = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white shrink-0">
          📸 インスタ
        </span>`;
        authorDisplay = `${item.author}`;
      } else if (item.platform === 'facebook') {
        sourceBadge = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black bg-[#1877f2] text-white shrink-0">
          📘 Facebook
        </span>`;
        authorDisplay = `${item.author}`;
      } else {
        sourceBadge = `<span class="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-black bg-purple-700 text-white shrink-0">
          💬 SNS
        </span>`;
        authorDisplay = `${item.author}`;
      }
    }

    return `
      <article class="feed-card feed-item-compact flex items-center justify-between px-3 py-2 bg-white dark:bg-slate-900 hover:bg-purple-50/50 dark:hover:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800/80 transition-colors cursor-pointer group" data-id="${item.id}">
        <!-- Left: Badge, Headline, Source, Date in 2 tight rows -->
        <div class="flex-1 min-w-0 pr-2 card-title-click" data-id="${item.id}">
          <!-- Row 1: Source Badge + Time -->
          <div class="flex items-center space-x-1.5 mb-0.5">
            ${sourceBadge}
            <span class="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">${authorDisplay}</span>
            <span class="text-[10px] text-slate-400 ml-auto shrink-0 flex items-center">
              <i data-lucide="clock" class="w-2.5 h-2.5 mr-0.5 text-slate-400"></i>${item.relative_time}
            </span>
          </div>

          <!-- Row 2: Headline (Title only) -->
          <h3 class="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
            ${item.title}
          </h3>
        </div>

        <!-- Right: Star & External Link -->
        <div class="flex items-center space-x-1 shrink-0">
          <button class="p-1.5 rounded-lg text-slate-300 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all bookmark-btn ${isBookmarked ? 'text-amber-500 font-bold' : ''}" data-id="${item.id}" title="お気に入り保存" onclick="event.stopPropagation()">
            <i data-lucide="star" class="w-3.5 h-3.5 ${isBookmarked ? 'fill-current text-amber-500' : ''}"></i>
          </button>
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950 transition-all" title="元記事を開く" onclick="event.stopPropagation()">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
          </a>
        </div>
      </article>
    `;
  }

  function attachCardListeners() {
    // Like button
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const countSpan = btn.querySelector('.like-count');
        const icon = btn.querySelector('i');
        let count = parseInt(countSpan.textContent, 10);

        if (state.userLikes.has(id)) {
          state.userLikes.delete(id);
          countSpan.textContent = Math.max(0, count - 1);
          btn.classList.remove('text-rose-500', 'font-bold');
          icon.classList.remove('fill-current', 'text-rose-500');
        } else {
          state.userLikes.add(id);
          countSpan.textContent = count + 1;
          btn.classList.add('text-rose-500', 'font-bold');
          icon.classList.add('fill-current', 'text-rose-500');
          showToast('リアクションを送信しました！ ❤️');
        }
        localStorage.setItem('shiojiri_likes', JSON.stringify(Array.from(state.userLikes)));
      });
    });

    // Bookmark button
    document.querySelectorAll('.bookmark-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const icon = btn.querySelector('i');

        if (state.bookmarks.has(id)) {
          state.bookmarks.delete(id);
          btn.classList.remove('text-amber-500', 'font-bold');
          icon.classList.remove('fill-current', 'text-amber-500');
          showToast('お気に入りから削除しました');
          if (state.activeTab === 'bookmarks') {
            loadFeeds();
          }
        } else {
          state.bookmarks.add(id);
          btn.classList.add('text-amber-500', 'font-bold');
          icon.classList.add('fill-current', 'text-amber-500');
          showToast('お気に入りに保存しました！ ⭐️');
        }
        localStorage.setItem('shiojiri_bookmarks', JSON.stringify(Array.from(state.bookmarks)));
      });
    });

    // Detail modal open
    document.querySelectorAll('.card-title-click, .card-detail-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        const item = state.items.find(it => it.id === id);
        if (item) {
          openDetailModal(item);
        }
      });
    });

    // Share button
    document.querySelectorAll('.share-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = state.items.find(it => it.id === id);
        if (!item) return;

        if (navigator.share) {
          try {
            await navigator.share({
              title: item.title,
              text: `【塩尻市情報】${item.title}`,
              url: item.url
            });
          } catch (err) {
            console.log('Share dismissed');
          }
        } else {
          navigator.clipboard.writeText(item.url);
          showToast('記事リンクをクリップボードにコピーしました 📋');
        }
      });
    });

    // Tag filter click inside card
    document.querySelectorAll('.tag-filter-click').forEach(tagEl => {
      tagEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = tagEl.dataset.tag;
        state.selectedTag = tag;
        loadFeeds();
      });
    });
  }

  // --- Modals ---

  function openDetailModal(item) {
    state.selectedItem = item;
    const isBookmarked = state.bookmarks.has(item.id);

    let modalPlatformBadge = item.source || '情報ソース';
    if (item.platform === 'x') {
      modalPlatformBadge = `<span class="font-mono font-bold mr-1">𝕏</span> X (Twitter)`;
    } else if (item.platform === 'instagram') {
      modalPlatformBadge = `📸 Instagram`;
    } else if (item.platform === 'line') {
      modalPlatformBadge = `💬 LINE公式`;
    }

    const modalBody = document.getElementById('item-detail-content');
    modalBody.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span class="px-2.5 py-1 rounded-md font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            ${modalPlatformBadge}
          </span>
          <span>${item.published_at} (${item.relative_time})</span>
        </div>

        <h2 class="text-xl font-bold text-slate-900 dark:text-white leading-snug">
          ${item.title}
        </h2>

        ${item.image_url ? `
          <div class="rounded-xl overflow-hidden aspect-video max-h-64 bg-slate-100 dark:bg-slate-800">
            <img src="${item.image_url}" alt="${item.title}" class="w-full h-full object-cover">
          </div>
        ` : ''}

        <div class="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line border border-slate-100 dark:border-slate-800">
          ${item.summary}
        </div>

        <div class="flex flex-wrap gap-1.5 pt-2">
          ${(item.tags || []).map(t => `<span class="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded">${t}</span>`).join('')}
        </div>

        <div class="pt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
          <button id="modal-bookmark-btn" class="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-sm font-semibold border ${isBookmarked ? 'bg-amber-50 text-amber-600 border-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'}">
            <i data-lucide="bookmark" class="w-4 h-4 ${isBookmarked ? 'fill-current' : ''}"></i>
            <span>${isBookmarked ? '保存済み' : 'お気に入り保存'}</span>
          </button>

          <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="flex items-center space-x-1.5 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-rose-600 text-white rounded-xl text-sm font-bold shadow-sm hover:from-purple-700 hover:to-rose-700 transition-all">
            <span>公式サイト・元投稿を開く</span>
            <i data-lucide="external-link" class="w-4 h-4"></i>
          </a>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();

    document.getElementById('modal-bookmark-btn').addEventListener('click', () => {
      const id = item.id;
      if (state.bookmarks.has(id)) {
        state.bookmarks.delete(id);
      } else {
        state.bookmarks.add(id);
      }
      localStorage.setItem('shiojiri_bookmarks', JSON.stringify(Array.from(state.bookmarks)));
      openDetailModal(item);
      renderFeedList(state.items);
    });

    itemDetailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function renderQuickLinksModal(links) {
    const listEl = document.getElementById('quick-links-list');
    if (!listEl) return;

    listEl.innerHTML = links.map(link => `
      <a href="${link.url}" target="_blank" rel="noopener noreferrer" class="flex items-start space-x-3.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-slate-200/80 dark:border-slate-700/80 transition-all group">
        <div class="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 group-hover:scale-110 transition-transform">
          <i data-lucide="${link.icon || 'link'}" class="w-5 h-5"></i>
        </div>
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <h4 class="text-sm font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400">
              ${link.title}
            </h4>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
              ${link.badge}
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ${link.desc}
          </p>
        </div>
        <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 self-center group-hover:translate-x-0.5 transition-transform"></i>
      </a>
    `).join('');

    if (window.lucide) lucide.createIcons();
  }

  function openQuickLinksModal() {
    quickLinksModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function openWeatherModal() {
    const w = state.weather;
    if (!w) return;

    const modalContent = document.getElementById('weather-modal-content');
    modalContent.innerHTML = `
      <div class="space-y-4 text-center">
        <div class="p-5 rounded-2xl bg-gradient-to-br from-purple-900 to-indigo-900 text-white shadow-lg">
          <span class="text-xs font-bold tracking-wider text-purple-200 uppercase">長野県塩尻市 ピンポイント気象</span>
          <div class="flex items-center justify-center space-x-3 my-3">
            <i data-lucide="${w.weather_icon === 'sun' ? 'sun' : 'cloud-sun'}" class="w-12 h-12 text-amber-300 animate-pulse"></i>
            <div class="text-4xl font-extrabold">${w.temp}°C</div>
          </div>
          <div class="text-sm font-semibold text-purple-100">${w.weather_name}</div>
          <div class="mt-4 grid grid-cols-3 gap-2 text-xs border-t border-white/20 pt-3">
            <div>
              <div class="text-purple-300 text-[10px]">最高 / 最低</div>
              <div class="font-bold">${w.max_temp}° / ${w.min_temp}°</div>
            </div>
            <div>
              <div class="text-purple-300 text-[10px]">降水確率</div>
              <div class="font-bold">${w.pop_today}%</div>
            </div>
            <div>
              <div class="text-purple-300 text-[10px]">湿度</div>
              <div class="font-bold">${w.humidity}%</div>
            </div>
          </div>
        </div>

        <div class="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl text-left border border-purple-200/50 dark:border-purple-800/40">
          <h5 class="text-xs font-bold text-purple-900 dark:text-purple-200 mb-1 flex items-center">
            <i data-lucide="info" class="w-3.5 h-3.5 mr-1"></i>塩尻市の気候・おでかけワンポイント
          </h5>
          <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            塩尻市は標高約700m前後の盆地に位置し、昼夜の寒暖差がぶどうやワイン用ブドウの栽培に適しています。朝夕は冷え込む場合がありますので羽織るものをご準備ください。
          </p>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
    weatherDetailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  async function openPhoneQrModal() {
    const phoneQrModal = document.getElementById('phone-qr-modal');
    const qrCanvas = document.getElementById('qr-canvas');
    const urlDisplay = document.getElementById('phone-url-display');
    if (!phoneQrModal) return;

    // Detect actual connection URL (Priority: Cloudflare HTTPS Tunnel > Local IP)
    let accessUrl = `http://192.168.0.189:${window.location.port || '8000'}`;
    try {
      const res = await fetch('/api/tunnel-url');
      const data = await res.json();
      if (data && data.url) {
        accessUrl = data.url;
      }
    } catch (e) {
      console.log('Tunnel lookup:', e);
    }

    if (urlDisplay) {
      urlDisplay.textContent = accessUrl;
    }

    // Generate QR Code with QRious
    if (window.QRious && qrCanvas) {
      new QRious({
        element: qrCanvas,
        value: accessUrl,
        size: 180,
        background: '#ffffff',
        foreground: '#581c87',
        level: 'M'
      });
    }

    if (window.lucide) lucide.createIcons();
    phoneQrModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeAllModals() {
    const phoneQrModal = document.getElementById('phone-qr-modal');
    [quickLinksModal, itemDetailModal, weatherDetailModal, phoneQrModal].forEach(m => {
      if (m) m.classList.add('hidden');
    });
    document.body.style.overflow = '';
  }
});
