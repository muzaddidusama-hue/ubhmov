import {
  fetchStremioCatalog,
  STREMIO_CATALOG_CHANNELS,
  getStremioAddons
} from '../utils/apiManager.js';
import { escapeHTML, sanitizeUrl } from '../utils/security.js';

/**
 * Creates the Stremio Video Streaming Showcase Section component.
 * Displays playable videos and catalog titles fetched directly from Stremio add-ons.
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
  sectionWrapper.className = 'stremio-video-section-container';

  let currentChannelId = 'movie_top';
  let cachedChannelData = {};
  let isLoading = false;

  function renderSkeletonCards() {
    return Array.from({ length: 7 }).map(() => `
      <div class="stremio-video-card skeleton-card">
        <div class="card-poster-wrapper skeleton-pulse" style="aspect-ratio: 2/3; border-radius:14px;"></div>
        <div style="padding: 0.75rem 0.25rem;">
          <div class="skeleton-pulse" style="height:14px; width:70%; margin-bottom:6px; border-radius:4px;"></div>
          <div class="skeleton-pulse" style="height:11px; width:45%; border-radius:4px;"></div>
        </div>
      </div>
    `).join('');
  }

  function renderShell() {
    const activeAddons = getStremioAddons().filter(a => a.active !== false);

    sectionWrapper.innerHTML = `
      <div class="stremio-stream-hub-header">
        <div class="stremio-stream-title-group">
          <div class="stremio-hub-badge">
            <span class="stremio-hub-pulse-dot"></span>
            <span>STREMIO STREAM ENGINE (${activeAddons.length} ADD-ONS CONNECTED)</span>
          </div>
          <h2 class="stremio-stream-title">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stremio-stream-icon">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Stremio Add-on Video Streams
          </h2>
          <p class="stremio-stream-subtitle">
            Explore and stream titles directly fetched from your connected Stremio add-on manifests with multi-source video discovery.
          </p>
        </div>

        <!-- Carousel Left/Right Arrow Navigation -->
        <div class="stremio-stream-arrows">
          <button id="stremio-scroll-prev" class="arrow-btn" title="Previous">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button id="stremio-scroll-next" class="arrow-btn" title="Next">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <!-- Quick IMDB ID / Title Direct Stream Bar -->
      <div class="stremio-direct-stream-bar">
        <div class="direct-stream-input-wrap">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="direct-stream-icon">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <input type="text" id="stremio-direct-query-input" placeholder="Enter IMDB ID (e.g. tt10872600 or tt0137523) to stream video instantly..." autocomplete="off">
          <button id="stremio-direct-enter-btn" class="hub-enter-key-btn" type="button" title="Click or Press Enter to play">
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

      <!-- Channel Tabs Switcher -->
      <div class="stremio-channel-tabs">
        ${STREMIO_CATALOG_CHANNELS.map(channel => `
          <button class="stremio-channel-tab ${channel.id === currentChannelId ? 'active' : ''}" data-channel="${escapeHTML(channel.id)}">
            <span>${channel.icon}</span>
            <span>${escapeHTML(channel.name)}</span>
          </button>
        `).join('')}
      </div>

      <!-- Carousel Viewport -->
      <div class="stremio-viewport-wrapper">
        <div id="stremio-videos-carousel" class="stremio-videos-carousel">
          ${renderSkeletonCards()}
        </div>
      </div>
    `;

    // Attach listeners
    attachHeaderListeners();
  }

  function attachHeaderListeners() {
    const prevBtn = sectionWrapper.querySelector('#stremio-scroll-prev');
    const nextBtn = sectionWrapper.querySelector('#stremio-scroll-next');
    const carousel = sectionWrapper.querySelector('#stremio-videos-carousel');

    prevBtn?.addEventListener('click', () => {
      if (carousel) carousel.scrollBy({ left: -carousel.clientWidth * 0.75, behavior: 'smooth' });
    });

    nextBtn?.addEventListener('click', () => {
      if (carousel) carousel.scrollBy({ left: carousel.clientWidth * 0.75, behavior: 'smooth' });
    });

    // Channel tab clicks
    sectionWrapper.querySelectorAll('.stremio-channel-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const channelId = tabBtn.getAttribute('data-channel');
        if (channelId && channelId !== currentChannelId) {
          currentChannelId = channelId;
          sectionWrapper.querySelectorAll('.stremio-channel-tab').forEach(b => b.classList.remove('active'));
          tabBtn.classList.add('active');
          loadChannelVideos(currentChannelId);
        }
      });
    });

    // Direct Stream input launcher
    const directInput = sectionWrapper.querySelector('#stremio-direct-query-input');
    const directPlayBtn = sectionWrapper.querySelector('#stremio-direct-play-btn');
    const directEnterBtn = sectionWrapper.querySelector('#stremio-direct-enter-btn');

    const handleDirectStream = () => {
      const val = directInput?.value?.trim();
      if (!val) {
        showToast('Please enter an IMDB ID (e.g. tt10872600) or title', 'error');
        return;
      }

      showToast(`Launching Stremio stream for "${val}"...`, 'info');
      // If it looks like an IMDB ID (tt...)
      if (/^tt\d+/i.test(val)) {
        onWatchClick(val, 'movie');
      } else {
        // Switch to explore search for keyword
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
  }

  async function loadChannelVideos(channelId) {
    const carousel = sectionWrapper.querySelector('#stremio-videos-carousel');
    if (!carousel) return;

    if (cachedChannelData[channelId] && cachedChannelData[channelId].length > 0) {
      renderVideoCards(cachedChannelData[channelId], carousel);
      return;
    }

    carousel.innerHTML = renderSkeletonCards();
    isLoading = true;

    try {
      const items = await fetchStremioCatalog(channelId);
      cachedChannelData[channelId] = items;
      renderVideoCards(items, carousel);
    } catch (err) {
      carousel.innerHTML = `
        <div class="hub-empty-state">
          <p style="color:#ef4444;">Failed to load Stremio stream feed: ${escapeHTML(err.message)}</p>
          <button class="secondary-btn hub-btn-sm" id="stremio-retry-feed-btn">Retry Feed</button>
        </div>
      `;
      carousel.querySelector('#stremio-retry-feed-btn')?.addEventListener('click', () => {
        loadChannelVideos(channelId);
      });
    } finally {
      isLoading = false;
    }
  }

  function renderVideoCards(items, container) {
    container.innerHTML = '';

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="hub-empty-state">
          <svg viewBox="0 0 24 24" width="40" height="40" stroke="var(--text-muted)" stroke-width="1.5" fill="none">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <h3>No Stremio Streams in Channel</h3>
          <p>Make sure your Stremio add-on manifests are enabled and active.</p>
        </div>
      `;
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'movie-card stremio-stream-card';

      const title = escapeHTML(item.title || item.name || 'Untitled');
      const posterUrl = sanitizeUrl(item.poster || item.posterUrl, 'https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster');
      const rating = escapeHTML(item.vote_average ? item.vote_average.toFixed(1) : '8.0');
      const releaseYear = escapeHTML((item.release_date || '').split('-')[0] || '');
      const type = item.type === 'tv' ? 'tv' : 'movie';
      const typeBadge = type === 'tv' ? 'TV Series' : 'Movie';

      card.innerHTML = `
        <div class="card-poster-wrapper">
          <img src="${posterUrl}" class="card-poster" alt="${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster';">
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

      // Event Listeners:
      // Clicking "Play Stream" launches the video player overlay directly!
      card.querySelector('.stremio-play-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        onWatchClick(item.id, type);
      });

      // Clicking "Details" opens details modal
      card.querySelector('.stremio-info-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        onInfoClick(item.id, type);
      });

      // Clicking card anywhere opens details modal / stream
      card.addEventListener('click', () => {
        onInfoClick(item.id, type);
      });

      container.appendChild(card);
    });
  }

  // Initial Shell Render & Load first channel videos
  renderShell();
  loadChannelVideos(currentChannelId);

  // Auto-refresh when add-ons configuration changes
  window.addEventListener('stremio-addons-changed', () => {
    cachedChannelData = {};
    loadChannelVideos(currentChannelId);
  });

  return sectionWrapper;
}
