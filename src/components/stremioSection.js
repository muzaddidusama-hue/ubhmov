import {
  getStremioAddons,
  fetchLiveAddonCatalogItems,
  generateStremioTitlePoster
} from '../utils/apiManager.js';
import { escapeHTML, sanitizeUrl } from '../utils/security.js';

/**
 * Creates the Stremio Multi-Addon Video Streaming Hub Component.
 * Renders dedicated video stream sections/carousels for all active & running Stremio add-ons.
 * @param {Object} callbacks - { onWatchClick, onInfoClick, showToast }
 * @returns {HTMLElement}
 */
export function createStremioServersSection(callbacks = {}) {
  const {
    onWatchClick = (id, type) => console.log('Watch:', id, type),
    onInfoClick = (id, type) => console.log('Info:', id, type),
    showToast = (msg, type) => console.log(type, msg)
  } = callbacks;

  const sectionWrapper = document.createElement('div');
  sectionWrapper.className = 'stremio-multi-addon-hub';

  function renderSkeletonRow() {
    return Array.from({ length: 6 }).map(() => `
      <div class="stremio-stream-card skeleton-card">
        <div class="card-poster-wrapper skeleton-pulse" style="aspect-ratio: 2/3; border-radius:14px;"></div>
        <div style="padding: 0.75rem 0.25rem;">
          <div class="skeleton-pulse" style="height:14px; width:75%; margin-bottom:6px; border-radius:4px;"></div>
          <div class="skeleton-pulse" style="height:11px; width:45%; border-radius:4px;"></div>
        </div>
      </div>
    `).join('');
  }

  function renderShell() {
    const activeAddons = getStremioAddons().filter(a => a.active !== false);

    sectionWrapper.innerHTML = `
      <div class="stremio-video-section-container">
        <!-- Hero Hub Header -->
        <div class="stremio-stream-hub-header">
          <div class="stremio-stream-title-group">
            <div class="stremio-hub-badge">
              <span class="stremio-hub-pulse-dot"></span>
              <span>STREMIO LIVE ADDON ENGINES (${activeAddons.length} RUNNING)</span>
            </div>
            <h2 class="stremio-stream-title">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stremio-stream-icon">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Stremio Add-on Video Streams
            </h2>
            <p class="stremio-stream-subtitle">
              Fetching live catalogs directly from each installed add-on server in real time.
            </p>
          </div>
        </div>

        <!-- Direct Stream Quick Launcher -->
        <div class="stremio-direct-stream-bar">
          <div class="direct-stream-input-wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="direct-stream-icon">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <input type="text" id="stremio-direct-query-input" placeholder="Enter IMDB ID (e.g. tt10872600) to stream directly..." autocomplete="off">
            <button id="stremio-direct-enter-btn" class="hub-enter-key-btn" type="button" title="Click or Press Enter to stream">
              <span class="kbd-badge">↵ Enter</span>
            </button>
          </div>
          <button id="stremio-direct-play-btn" class="primary-btn accent-glow-btn direct-play-btn">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play Stream
          </button>
        </div>

        <!-- Live Addon Carousels — injected by JS after manifest fetch -->
        <div id="stremio-all-feeds-container" class="stremio-all-feeds-container">
          ${activeAddons.length === 0
            ? `<div class="hub-empty-state"><p style="color:var(--text-med);">No active Stremio add-ons found. Install add-ons in the Admin Console.</p></div>`
            : `<div class="stremio-loading-state" style="display:flex;align-items:center;gap:1rem;padding:2rem 0;">
                <span class="stremio-hub-pulse-dot"></span>
                <span style="color:var(--text-med);font-size:0.9rem;">Fetching live catalogs from ${activeAddons.length} add-on server${activeAddons.length > 1 ? 's' : ''}...</span>
               </div>`
          }
        </div>
      </div>
    `;

    attachGlobalLauncherEvents();
    if (activeAddons.length > 0) {
      loadLiveAddonFeeds(activeAddons);
    }
  }

  function attachGlobalLauncherEvents() {
    const directInput = sectionWrapper.querySelector('#stremio-direct-query-input');
    const directPlayBtn = sectionWrapper.querySelector('#stremio-direct-play-btn');
    const directEnterBtn = sectionWrapper.querySelector('#stremio-direct-enter-btn');

    const handleDirectStream = () => {
      const val = directInput?.value?.trim();
      if (!val) {
        showToast('Please enter an IMDB ID (e.g. tt10872600) or title', 'error');
        return;
      }

      showToast(`Initiating Stremio stream for "${val}"...`, 'info');
      if (/^tt\d+/i.test(val)) {
        onWatchClick(val, 'movie');
      } else {
        window.location.hash = '#explore';
        const globalSearch = document.getElementById('global-search-input');
        if (globalSearch) {
          globalSearch.value = val;
          globalSearch.dispatchEvent(new Event('input'));
        }
      }
    };

    directPlayBtn?.addEventListener('click', handleDirectStream);
    directEnterBtn?.addEventListener('click', handleDirectStream);
    directInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); handleDirectStream(); }
    });
  }

  function attachCarouselArrows() {
    sectionWrapper.querySelectorAll('.stremio-row-prev').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = sectionWrapper.querySelector(`#${btn.getAttribute('data-target')}`);
        if (c) c.scrollBy({ left: -c.clientWidth * 0.75, behavior: 'smooth' });
      });
    });
    sectionWrapper.querySelectorAll('.stremio-row-next').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = sectionWrapper.querySelector(`#${btn.getAttribute('data-target')}`);
        if (c) c.scrollBy({ left: c.clientWidth * 0.75, behavior: 'smooth' });
      });
    });
  }

  /**
   * Fetch live manifests from all installed addons and build carousel rows dynamically.
   * Addons with real catalogs get populated rows; stream scrapers get a compact launcher card.
   */
  async function loadLiveAddonFeeds(addons) {
    const container = sectionWrapper.querySelector('#stremio-all-feeds-container');
    if (!container) return;

    container.innerHTML = ''; // Clear loading state
    let totalRendered = 0;

    // Process addons in parallel, append rows as they resolve
    const tasks = addons.map(async (addon) => {
      try {
        const feedResults = await fetchLiveAddonCatalogItems(addon);

        if (!feedResults || feedResults.length === 0) {
          // Stream-only scraper: show compact launcher row
          appendScraperRow(container, addon);
        } else {
          for (const { feed, items } of feedResults) {
            appendCarouselRow(container, feed, items);
            totalRendered++;
          }
        }
      } catch (err) {
        console.warn(`[stremio] Failed to load addon ${addon.name}:`, err);
        appendScraperRow(container, addon);
      }
    });

    await Promise.all(tasks);

    if (container.children.length === 0) {
      container.innerHTML = `
        <div class="hub-empty-state" style="padding:2.5rem;text-align:center;">
          <h4 style="color:var(--text-high);margin-bottom:0.5rem;">No catalog feeds available</h4>
          <p style="color:var(--text-med);font-size:0.85rem;">Your installed add-ons are stream scrapers. Use the IMDB launcher above to stream directly.</p>
        </div>
      `;
    }
  }

  function appendCarouselRow(container, feed, items) {
    const feedId = escapeHTML(feed.feedId);
    const row = document.createElement('div');
    row.className = 'stremio-feed-row-section';
    row.id = `feed-sec-${feedId}`;
    row.dataset.feedId = feedId;
    row.innerHTML = `
      <div class="stremio-feed-header">
        <div class="stremio-feed-title-wrap">
          <span class="stremio-feed-icon">${feed.icon || '🍿'}</span>
          <h3 class="stremio-feed-title">${escapeHTML(feed.catalogName)}</h3>
          <span class="stremio-feed-badge">⚡ ${escapeHTML(feed.addonName)}</span>
        </div>
        <div class="stremio-stream-arrows">
          <button class="arrow-btn stremio-row-prev" data-target="carousel-${feedId}" title="Scroll Left">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <button class="arrow-btn stremio-row-next" data-target="carousel-${feedId}" title="Scroll Right">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>
      <div class="stremio-viewport-wrapper">
        <div class="stremio-videos-carousel" id="carousel-${feedId}"></div>
      </div>
    `;

    container.appendChild(row);
    const carousel = row.querySelector(`#carousel-${feedId}`);
    if (carousel) renderFeedCards(items, carousel, feed);

    // Attach arrows for this new row
    row.querySelectorAll('.stremio-row-prev, .stremio-row-next').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = sectionWrapper.querySelector(`#${btn.getAttribute('data-target')}`);
        const dir = btn.classList.contains('stremio-row-prev') ? -1 : 1;
        if (c) c.scrollBy({ left: dir * c.clientWidth * 0.75, behavior: 'smooth' });
      });
    });
  }

  function appendScraperRow(container, addon) {
    const row = document.createElement('div');
    row.className = 'stremio-scraper-row';
    row.style.cssText = 'padding:1rem 0.5rem;border-bottom:1px solid var(--border-glass);';
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.75rem 1rem;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:12px;">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <span style="font-size:1.3rem;">${escapeHTML(addon.icon || '⚡')}</span>
          <div>
            <div style="font-weight:700;color:var(--text-high);font-size:0.92rem;">${escapeHTML(addon.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-med);">Stream scraper — finds sources when you select a title. No browse catalog.</div>
          </div>
        </div>
        <button class="primary-btn accent-glow-btn scraper-launch-btn" style="padding:0.4rem 0.9rem;font-size:0.8rem;white-space:nowrap;">▶ Stream by ID</button>
      </div>
    `;
    row.querySelector('.scraper-launch-btn')?.addEventListener('click', () => {
      const input = sectionWrapper.querySelector('#stremio-direct-query-input');
      if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
    container.appendChild(row);
  }

  function renderFeedCards(items, container, feed) {
    container.innerHTML = '';

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="stremio-empty-feed-card" style="padding: 1.25rem 1.5rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-glass); border-radius: 14px; display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 1.5rem; margin: 0.5rem 0;">
          <div style="display: flex; align-items: center; gap: 0.85rem;">
            <span style="font-size: 1.6rem;">${feed.icon || '⚡'}</span>
            <div>
              <div style="font-weight: 700; color: var(--text-high); font-size: 0.95rem;">${escapeHTML(feed.catalogName)}</div>
              <div style="font-size: 0.78rem; color: var(--text-med); margin-top: 0.2rem;">Live stream scraper engine active. Enter an IMDB ID or title to stream directly.</div>
            </div>
          </div>
          <button class="primary-btn accent-glow-btn direct-feed-stream-btn" style="padding: 0.45rem 1rem; font-size: 0.8rem; white-space: nowrap;">
            ▶ Direct Stream
          </button>
        </div>
      `;

      container.querySelector('.direct-feed-stream-btn')?.addEventListener('click', () => {
        const input = sectionWrapper.querySelector('#stremio-direct-query-input');
        if (input) {
          input.focus();
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'movie-card stremio-stream-card';

      const title = escapeHTML(item.title || item.name || 'Untitled');
      const rawTitle = item.title || item.name || 'Untitled';
      const imdbId = item.imdb_id || item.id || '';
      const rating = escapeHTML(item.vote_average ? item.vote_average.toFixed(1) : '8.0');
      const releaseYear = escapeHTML((item.release_date || '').split('-')[0] || '');
      const type = item.type === 'tv' ? 'tv' : 'movie';
      const typeBadge = type === 'tv' ? 'TV Series' : 'Movie';

      // Build 3-stage poster fallback chain
      const metahubMedium = imdbId.startsWith('tt') ? `https://images.metahub.space/poster/medium/${imdbId}/img` : null;
      const metahubSmall = imdbId.startsWith('tt') ? `https://images.metahub.space/poster/small/${imdbId}/img` : null;
      const cinemetaPoster = imdbId.startsWith('tt') ? `https://v3-cinemeta.strem.io/meta/${type === 'tv' ? 'series' : 'movie'}/${imdbId}.json` : null;
      const svgFallback = generateStremioTitlePoster ? generateStremioTitlePoster(rawTitle, (feed && feed.icon) ? `${feed.icon} ${feed.addonName}` : '⚡ STREMIO') : `https://placehold.co/342x513/0c0e15/00f2fe?text=${encodeURIComponent(rawTitle.substring(0,20))}`;

      // Start with metahub or item poster
      const initialPoster = sanitizeUrl(item.poster || item.posterUrl || metahubMedium || svgFallback, svgFallback);

      card.innerHTML = `
        <div class="card-poster-wrapper">
          <img src="${initialPoster}" 
               class="card-poster" 
               alt="${title}" 
               loading="lazy" 
               decoding="async"
               data-imdb="${imdbId}"
               data-stage="0">
          <span class="card-badge stremio-badge">⚡ Stremio</span>
          <span class="card-badge card-type-badge">${typeBadge}</span>

          <!-- Stream / Play Hover Action Overlay -->
          <div class="stremio-card-overlay">
            <button class="stremio-play-btn" title="Stream Video Now">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Play Stream</span>
            </button>
            <button class="stremio-info-btn" title="View Details">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              Details
            </button>
          </div>
        </div>
        <div class="card-info">
          <h3 class="card-title">${title}</h3>
          <div class="card-meta">
            <span class="card-rating">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              ${rating}
            </span>
            <span class="card-year">${releaseYear}</span>
          </div>
        </div>
      `;

      // JS-based multi-stage poster fallback
      const imgEl = card.querySelector('.card-poster');
      if (imgEl) {
        const posterFallbacks = [metahubMedium, metahubSmall, svgFallback].filter(Boolean);
        let stageIdx = 0;
        imgEl.addEventListener('error', function onImgError() {
          stageIdx++;
          if (stageIdx < posterFallbacks.length) {
            imgEl.src = posterFallbacks[stageIdx];
          } else {
            imgEl.removeEventListener('error', onImgError);
          }
        });
      }

      card.querySelector('.stremio-play-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        onWatchClick(item.id, type);
      });

      card.querySelector('.stremio-info-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        onInfoClick(item.id, type);
      });

      card.addEventListener('click', () => {
        onInfoClick(item.id, type);
      });

      container.appendChild(card);
    });
  }

  // Initial Render
  renderShell();

  // Listen for addon additions/toggles to re-render all running addon sections
  window.addEventListener('stremio-addons-changed', () => {
    renderShell();
  });

  return sectionWrapper;
}
