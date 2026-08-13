import {
  getStremioAddons,
  fetchLiveAddonCatalogItems,
  getCloudStreamPlugins,
  fetchLiveCloudStreamPluginItems,
  generateStremioTitlePoster
} from '../utils/apiManager.js';
import { escapeHTML, sanitizeUrl } from '../utils/security.js';

/**
 * Creates the Multi-Addon & CloudStream Video Streaming Hub Component.
 * Renders dedicated video stream sections/carousels for all active Stremio add-ons and CloudStream plugins.
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

  function renderShell() {
    const activeAddons = getStremioAddons().filter(a => a.active !== false);
    const activePlugins = getCloudStreamPlugins().filter(p => p.active !== false);
    const totalEngines = activeAddons.length + activePlugins.length;

    sectionWrapper.innerHTML = `
      <div class="stremio-video-section-container">
        <!-- Hero Hub Header -->
        <div class="stremio-stream-hub-header">
          <div class="stremio-stream-title-group">
            <div class="stremio-hub-badge">
              <span class="stremio-hub-pulse-dot"></span>
              <span>LIVE STREAMING ENGINES (${totalEngines} ACTIVE: ${activeAddons.length} STREMIO + ${activePlugins.length} CLOUDSTREAM)</span>
            </div>
            <h2 class="stremio-stream-title">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stremio-stream-icon">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Add-on & CloudStream Video Streams
            </h2>
            <p class="stremio-stream-subtitle">
              Live catalogs & streaming scrapers fetched directly from active Stremio add-ons and CloudStream extension plugins.
            </p>
          </div>
        </div>

        <!-- Direct Stream Quick Launcher -->
        <div class="stremio-direct-stream-bar">
          <div class="direct-stream-input-wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="direct-stream-icon">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <input type="text" id="stremio-direct-query-input" placeholder="Enter IMDB ID (e.g. tt10872600) or title to stream directly..." autocomplete="off">
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

        <!-- Live Addon & Plugin Carousels -->
        <div id="stremio-all-feeds-container" class="stremio-all-feeds-container">
          ${totalEngines === 0
            ? `<div class="hub-empty-state"><p style="color:var(--text-med);">No active Stremio add-ons or CloudStream plugins found. Install plugins in the Admin Console.</p></div>`
            : `<div class="stremio-loading-state" style="display:flex;align-items:center;gap:1rem;padding:2rem 0;">
                <span class="stremio-hub-pulse-dot"></span>
                <span style="color:var(--text-med);font-size:0.9rem;">Fetching live catalogs and video feeds from ${totalEngines} streaming engine${totalEngines > 1 ? 's' : ''}...</span>
               </div>`
          }
        </div>
      </div>
    `;

    attachGlobalLauncherEvents();
    if (totalEngines > 0) {
      loadLiveFeeds(activeAddons, activePlugins);
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

      showToast(`Initiating stream search for "${val}"...`, 'info');
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

  /**
   * Fetch live manifests from all installed Stremio add-ons AND CloudStream plugins.
   */
  async function loadLiveFeeds(stremioAddons, csPlugins) {
    const container = sectionWrapper.querySelector('#stremio-all-feeds-container');
    if (!container) return;

    container.innerHTML = ''; // Clear loading state

    // 1. Process Stremio Addons in parallel
    const stremioTasks = stremioAddons.map(async (addon) => {
      try {
        const feedResults = await fetchLiveAddonCatalogItems(addon);

        if (!feedResults || feedResults.length === 0) {
          appendScraperRow(container, addon, 'stremio');
        } else {
          for (const { feed, items } of feedResults) {
            appendCarouselRow(container, feed, items);
          }
        }
      } catch (err) {
        console.warn(`[stremio] Failed to load addon ${addon.name}:`, err);
        appendScraperRow(container, addon, 'stremio');
      }
    });

    // 2. Process CloudStream Plugins in parallel
    const csTasks = csPlugins.map(async (plugin) => {
      try {
        const items = await fetchLiveCloudStreamPluginItems(plugin);
        const icon = plugin.isNsfw ? '🔞' : (plugin.isAnime ? '🎌' : '☁️');

        if (items && items.length > 0) {
          const feed = {
            feedId: `cs_${plugin.id}`,
            catalogName: `${plugin.name} - Latest Video Feeds`,
            addonName: `CloudStream (${plugin.name})`,
            icon,
            isCloudStream: true
          };
          appendCarouselRow(container, feed, items);
        } else {
          appendScraperRow(container, {
            name: plugin.name,
            icon,
            description: plugin.description || 'CloudStream Media Scraper'
          }, 'cloudstream');
        }
      } catch (err) {
        console.warn(`[cloudstream] Failed to load plugin ${plugin.name}:`, err);
      }
    });

    await Promise.all([...stremioTasks, ...csTasks]);

    if (container.children.length === 0) {
      container.innerHTML = `
        <div class="hub-empty-state" style="padding:2.5rem;text-align:center;">
          <h4 style="color:var(--text-high);margin-bottom:0.5rem;">No catalog feeds available</h4>
          <p style="color:var(--text-med);font-size:0.85rem;">Installed engines are currently on standby. Use the launcher above to stream directly.</p>
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
    
    const badgePrefix = feed.isCloudStream ? '☁️' : '⚡';

    row.innerHTML = `
      <div class="stremio-feed-header">
        <div class="stremio-feed-title-wrap">
          <span class="stremio-feed-icon">${feed.icon || '🍿'}</span>
          <h3 class="stremio-feed-title">${escapeHTML(feed.catalogName)}</h3>
          <span class="stremio-feed-badge">${badgePrefix} ${escapeHTML(feed.addonName)}</span>
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

  function appendScraperRow(container, engine, type = 'stremio') {
    const row = document.createElement('div');
    row.className = 'stremio-scraper-row';
    row.style.cssText = 'padding:0.75rem 0.5rem;border-bottom:1px solid var(--border-glass);';
    const badgeLabel = type === 'cloudstream' ? 'CloudStream Scraper' : 'Stremio Scraper';

    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.75rem 1rem;background:rgba(255,255,255,0.02);border:1px solid var(--border-glass);border-radius:12px;">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          <span style="font-size:1.3rem;">${escapeHTML(engine.icon || (type === 'cloudstream' ? '☁️' : '⚡'))}</span>
          <div>
            <div style="font-weight:700;color:var(--text-high);font-size:0.92rem;display:flex;align-items:center;gap:0.4rem;">
              <span>${escapeHTML(engine.name)}</span>
              <span style="font-size:0.68rem;background:rgba(0,242,254,0.1);color:var(--accent-cyan);padding:0.1rem 0.4rem;border-radius:4px;">${badgeLabel}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-med);margin-top:0.15rem;">Live streaming scraper active. Resolves streams when a title is selected.</div>
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
      
      let typeBadge = type === 'tv' ? 'TV Series' : 'Movie';
      if (item.isNsfw) typeBadge = '🔞 18+ Video';
      else if (item.isAnime) typeBadge = '🎌 Anime';

      const engineBadge = item.isCloudStream 
        ? `☁️ ${escapeHTML(item.providerName || 'CloudStream')}` 
        : `⚡ ${escapeHTML(feed.addonName || 'Stremio')}`;

      // Build poster fallback
      const metahubMedium = imdbId.startsWith('tt') ? `https://images.metahub.space/poster/medium/${imdbId}/img` : null;
      const metahubSmall = imdbId.startsWith('tt') ? `https://images.metahub.space/poster/small/${imdbId}/img` : null;
      const svgFallback = generateStremioTitlePoster ? generateStremioTitlePoster(rawTitle, (feed && feed.icon) ? `${feed.icon} ${feed.addonName}` : '⚡ STREAM') : `https://placehold.co/342x513/0c0e15/00f2fe?text=${encodeURIComponent(rawTitle.substring(0,20))}`;

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
          <span class="card-badge stremio-badge">${engineBadge}</span>
          <span class="card-badge card-type-badge">${typeBadge}</span>
          ${item.duration ? `<span class="card-badge" style="bottom:10px; right:10px; top:auto; left:auto; background:rgba(0,0,0,0.75); backdrop-filter:blur(4px); font-size:0.68rem; padding:0.15rem 0.45rem;">⏱ ${escapeHTML(item.duration)}</span>` : ''}

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

      // Multi-stage poster fallback
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
        onWatchClick(item, type);
      });

      card.querySelector('.stremio-info-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        onInfoClick(item, type);
      });

      card.addEventListener('click', () => {
        onInfoClick(item, type);
      });

      container.appendChild(card);
    });
  }

  // Initial Render
  renderShell();

  // Listen for both Stremio Addons & CloudStream Plugins changes to re-render all feeds
  window.addEventListener('stremio-addons-changed', () => {
    renderShell();
  });

  window.addEventListener('cloudstream-repos-changed', () => {
    renderShell();
  });

  return sectionWrapper;
}
