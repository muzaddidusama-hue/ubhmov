import {
  getActiveAddonCatalogFeeds,
  fetchStremioFeedItems,
  getStremioAddons
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
    const activeFeeds = getActiveAddonCatalogFeeds();

    sectionWrapper.innerHTML = `
      <div class="stremio-video-section-container">
        <!-- Hero Hub Header -->
        <div class="stremio-stream-hub-header">
          <div class="stremio-stream-title-group">
            <div class="stremio-hub-badge">
              <span class="stremio-hub-pulse-dot"></span>
              <span>STREMIO MULTI-ADDON ENGINES (${activeAddons.length} RUNNING · ${activeFeeds.length} FEEDS)</span>
            </div>
            <h2 class="stremio-stream-title">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stremio-stream-icon">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Stremio Add-on Video Streams
            </h2>
            <p class="stremio-stream-subtitle">
              Live movie and series feeds fetched across all running Stremio add-on engines with instant 1-click video playback.
            </p>
          </div>
        </div>

        <!-- Direct Stream Quick Launcher -->
        <div class="stremio-direct-stream-bar">
          <div class="direct-stream-input-wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="direct-stream-icon">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <input type="text" id="stremio-direct-query-input" placeholder="Enter IMDB ID (e.g. tt10872600 or tt0137523) to stream directly..." autocomplete="off">
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

        <!-- Quick Feed Anchor Jump Pills -->
        ${activeFeeds.length > 1 ? `
          <div class="stremio-feed-jump-pills">
            <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Active Feeds:</span>
            ${activeFeeds.map(f => `
              <a href="#feed-sec-${escapeHTML(f.feedId)}" class="stremio-jump-pill">
                <span>${f.icon || '⚡'}</span>
                <span>${escapeHTML(f.catalogName)}</span>
              </a>
            `).join('')}
          </div>
        ` : ''}

        <!-- Dedicated Multi-Addon Video Carousels Container -->
        <div id="stremio-all-feeds-container" class="stremio-all-feeds-container">
          ${activeFeeds.length === 0 ? `
            <div class="hub-empty-state">
              <p style="color:var(--text-med);">No active Stremio video feeds found. Enable or install add-ons in the Admin Console.</p>
            </div>
          ` : activeFeeds.map(f => `
            <div class="stremio-feed-row-section" id="feed-sec-${escapeHTML(f.feedId)}" data-feed-id="${escapeHTML(f.feedId)}">
              <div class="stremio-feed-header">
                <div class="stremio-feed-title-wrap">
                  <span class="stremio-feed-icon">${f.icon || '🍿'}</span>
                  <h3 class="stremio-feed-title">${escapeHTML(f.catalogName)}</h3>
                  <span class="stremio-feed-badge">⚡ ${escapeHTML(f.addonName)}</span>
                </div>
                <div class="stremio-stream-arrows">
                  <button class="arrow-btn stremio-row-prev" data-target="carousel-${escapeHTML(f.feedId)}" title="Scroll Left">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="15 18 9 12 15 6"></polyline></svg>
                  </button>
                  <button class="arrow-btn stremio-row-next" data-target="carousel-${escapeHTML(f.feedId)}" title="Scroll Right">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </div>
              </div>

              <div class="stremio-viewport-wrapper">
                <div class="stremio-videos-carousel" id="carousel-${escapeHTML(f.feedId)}">
                  ${renderSkeletonRow()}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    attachGlobalLauncherEvents();
    loadAllFeedCarousels(activeFeeds);
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
      if (e.key === 'Enter') {
        e.preventDefault();
        handleDirectStream();
      }
    });

    // Arrow scroll listeners
    sectionWrapper.querySelectorAll('.stremio-row-prev').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const c = sectionWrapper.querySelector(`#${targetId}`);
        if (c) c.scrollBy({ left: -c.clientWidth * 0.75, behavior: 'smooth' });
      });
    });

    sectionWrapper.querySelectorAll('.stremio-row-next').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const c = sectionWrapper.querySelector(`#${targetId}`);
        if (c) c.scrollBy({ left: c.clientWidth * 0.75, behavior: 'smooth' });
      });
    });

    // Smooth scroll for anchor jump pills
    sectionWrapper.querySelectorAll('.stremio-jump-pill').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetSec = sectionWrapper.querySelector(link.getAttribute('href'));
        if (targetSec) {
          targetSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
  }

  async function loadAllFeedCarousels(feeds) {
    feeds.forEach(async (feed) => {
      const carousel = sectionWrapper.querySelector(`#carousel-${feed.feedId}`);
      if (!carousel) return;

      try {
        const items = await fetchStremioFeedItems(feed);
        renderFeedCards(items, carousel, feed);
      } catch (err) {
        renderFeedCards([], carousel, feed);
      }
    });
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
      const imdbId = item.imdb_id || item.id || '';
      const fallbackMetahub = imdbId.startsWith('tt') ? `https://images.metahub.space/poster/medium/${imdbId}/img` : 'https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster';
      const posterUrl = sanitizeUrl(item.poster || item.posterUrl || fallbackMetahub, fallbackMetahub);
      const rating = escapeHTML(item.vote_average ? item.vote_average.toFixed(1) : '8.0');
      const releaseYear = escapeHTML((item.release_date || '').split('-')[0] || '');
      const type = item.type === 'tv' ? 'tv' : 'movie';
      const typeBadge = type === 'tv' ? 'TV Series' : 'Movie';

      card.innerHTML = `
        <div class="card-poster-wrapper">
          <img src="${posterUrl}" 
               class="card-poster" 
               alt="${title}" 
               loading="lazy" 
               decoding="async" 
               onerror="if (this.dataset.triedMetahub !== '1' && '${imdbId}') { this.dataset.triedMetahub = '1'; this.src='https://images.metahub.space/poster/medium/${imdbId}/img'; } else { this.onerror=null; this.src='https://images.metahub.space/poster/small/${imdbId || 'tt0000000'}/img'; }">
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
