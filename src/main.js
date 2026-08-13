import { CONFIG } from '../config.js';
import { tmdb, getApiKey, isApiConfigured, clearTmdbCache } from './tmdb.js';
import { createHeroSliderComponent } from './components/hero.js';
import { createCarouselComponent, createSkeletonCarouselComponent, createMovieCard } from './components/carousel.js';
import { createStremioServersSection } from './components/stremioSection.js';
import { populateDetailsModal } from './components/details.js';
import { openPlayerOverlay } from './components/player.js';
import { firebaseOperations, firebaseActive, firebaseInitPromise } from './firebase.js';
import { escapeHTML, sanitizeUrl } from './utils/security.js';
import {
  getStreamServers,
  saveStreamServer,
  deleteStreamServer,
  toggleStreamServer,
  resetStreamServersToDefault,
  getStremioAddons,
  installStremioAddon,
  removeStremioAddon,
  toggleStremioAddon,
  POPULAR_STREMIO_ADDONS_PRESETS,
  runAddonHealthAndCapabilityCheck
} from './utils/apiManager.js';

// ==========================================================================
// Application State
// ==========================================================================
const state = {
  activeView: 'home',
  bookmarks: JSON.parse(localStorage.getItem('watchlist')) || [],
  history: JSON.parse(localStorage.getItem('history')) || [],
  genres: [],
  selectedGenreId: '',
  selectedLanguage: '',
  explorePage: 1,
  hasMoreExplore: true,
  searchQuery: '',
  searchTimeout: null,
  isFetchingExplore: false,
  currentUser: null,
  isAuthInitialized: false
};

let membersUnsubscribe = null;

// Stream template helpers
function getMovieStreamTemplate() {
  return localStorage.getItem('stream_movie_template') || CONFIG.STREAM_MOVIE_URL;
}
function getTvStreamTemplate() {
  return localStorage.getItem('stream_tv_template') || CONFIG.STREAM_TV_URL;
}

// ==========================================================================
// Toast Notification Utility
// ==========================================================================
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Icon select
  let icon = '';
  if (type === 'success') {
    icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'error') {
    icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  // Trigger browser paint to enable transitions
  setTimeout(() => toast.classList.add('show'), 50);

  // Auto remove toast
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3500);
}

// ==========================================================================
// Routing and Navigation
// ==========================================================================
function initRouter() {
  const handleRouting = () => {
    const hash = window.location.hash || '#home';
    let viewName = hash.substring(1).split('?')[0]; // strip query parameters
    
    // Auth State Route Guard Checks
    if (state.isAuthInitialized) {
      if (!state.currentUser) {
        // If not logged in, block view loading
        return;
      }
      if (state.currentUser && state.currentUser.approved !== true) {
        // If logged in but not approved, block view loading
        return;
      }
      if (viewName === 'admin' && state.currentUser.role !== 'admin') {
        // Demote access to home page if standard member tries to open admin view
        window.location.hash = '#home';
        return;
      }
    } else {
      // Defer routing logic until Firebase auth state finishes initializing
      return;
    }
    
    // Check if view container exists
    const nextView = document.getElementById(`view-${viewName}`);
    if (!nextView) {
      window.location.hash = '#home';
      return;
    }
    
    // Deactivate previous active view
    const currentViewEl = document.getElementById(`view-${state.activeView}`);
    if (currentViewEl) currentViewEl.classList.remove('active');
    
    // Activate next view
    nextView.classList.add('active');
    state.activeView = viewName;
    
    // Update active nav class
    updateNavigationStates(viewName);
    
    // Trigger view-specific loads
    loadViewData(viewName);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  window.addEventListener('hashchange', handleRouting);
  // Initial run
  handleRouting();
}

function updateNavigationStates(activeView) {
  // Update desktop side nav
  document.querySelectorAll('#sidebar .menu-item').forEach(item => {
    if (item.dataset.view === activeView) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update mobile bottom nav
  document.querySelectorAll('#mobile-nav .mobile-nav-item').forEach(item => {
    if (item.dataset.view === activeView) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// ==========================================================================
// API Configuration Validation Checks
// ==========================================================================
function verifyApiConfiguration() {
  const statusIndicator = document.getElementById('api-status');
  const warningBanner = document.getElementById('api-warning-banner');
  
  if (isApiConfigured()) {
    statusIndicator.className = 'setup-indicator status-green';
    statusIndicator.querySelector('.status-text').textContent = 'TMDB Connected';
    if (warningBanner) warningBanner.classList.add('hidden');
    return true;
  } else {
    statusIndicator.className = 'setup-indicator status-red';
    statusIndicator.querySelector('.status-text').textContent = 'TMDB Missing';
    if (warningBanner) warningBanner.classList.remove('hidden');
    return false;
  }
}

// ==========================================================================
// View Data Load Controllers
// ==========================================================================
function loadViewData(viewName) {
  // Unsubscribe from Admin dashboard live updates when navigating away
  if (viewName !== 'admin' && membersUnsubscribe) {
    membersUnsubscribe();
    membersUnsubscribe = null;
  }
  // Verify API configuration
  const apiOk = verifyApiConfiguration();
  if (!apiOk && viewName !== 'settings') {
    showToast('TMDB API Key missing. Redirecting to settings...', 'error');
    setTimeout(() => { window.location.hash = '#settings'; }, 1000);
    return;
  }

  switch (viewName) {
    case 'home':
      loadHomeFeeds();
      break;
    case 'explore':
      loadExploreCatalog(true);
      break;
    case 'movies':
      loadGenreOrPopularList('movies-grid', 'movie');
      break;
    case 'series':
      loadGenreOrPopularList('series-grid', 'tv');
      break;
    case 'library':
      renderLibraryView();
      break;
    case 'history':
      renderHistoryView();
      break;
    case 'settings':
      loadSettingsFormValues();
      break;
    case 'admin':
      loadAdminDashboard();
      break;
  }
}

// ==========================================================================
// Home Feed Loading
// ==========================================================================
async function loadHomeFeeds() {
  // Render local continue watching progress instantly
  renderContinueWatching();

  const heroContainer = document.getElementById('hero-spotlight-container');
  const trendingContainer = document.getElementById('row-trending-movies');
  const popularTVContainer = document.getElementById('row-popular-series');
  const topMoviesContainer = document.getElementById('row-top-movies');
  const nowPlayingContainer = document.getElementById('row-now-playing');

  // Insert Skeletons
  heroContainer.innerHTML = `<div class="hero-spotlight skeleton-pulse" style="height:520px; border-radius:24px;"></div>`;
  trendingContainer.innerHTML = '';
  popularTVContainer.innerHTML = '';
  topMoviesContainer.innerHTML = '';
  nowPlayingContainer.innerHTML = '';

  trendingContainer.appendChild(createSkeletonCarouselComponent('Trending Movies'));
  popularTVContainer.appendChild(createSkeletonCarouselComponent('Popular TV Series'));
  topMoviesContainer.appendChild(createSkeletonCarouselComponent('Top Rated Classics'));
  nowPlayingContainer.appendChild(createSkeletonCarouselComponent('Now in Theatres'));

  try {
    // Fetch all feeds in parallel to eliminate head-of-line blocking and load UI instantly
    const [trendingData, popularTV, topMovies, nowPlaying] = await Promise.all([
      tmdb.getTrendingMovies().catch(err => { console.error(err); return { results: [] }; }),
      tmdb.getPopularSeries().catch(err => { console.error(err); return { results: [] }; }),
      tmdb.getTopRatedMovies().catch(err => { console.error(err); return { results: [] }; }),
      tmdb.getNowPlaying().catch(err => { console.error(err); return { results: [] }; })
    ]);

    const trendingList = trendingData.results || [];
    
    // Load Hero Banner Spotlight using the top trending items (as a slider)
    if (trendingList.length > 0) {
      heroContainer.innerHTML = '';
      heroContainer.appendChild(createHeroSliderComponent(trendingList, handleWatchClick, handleInfoClick));
    } else {
      heroContainer.innerHTML = '';
    }

    // Build Rows
    trendingContainer.innerHTML = '';
    trendingContainer.appendChild(
      createCarouselComponent('Trending Movies', trendingList, 'movie', handleInfoClick)
    );

    // 2. Popular TV Series
    popularTVContainer.innerHTML = '';
    popularTVContainer.appendChild(
      createCarouselComponent('Popular TV Series', popularTV.results || [], 'tv', handleInfoClick)
    );

    // 3. Top Rated Movies
    topMoviesContainer.innerHTML = '';
    topMoviesContainer.appendChild(
      createCarouselComponent('Top Rated Classics', topMovies.results || [], 'movie', handleInfoClick)
    );

    // 4. Now Playing
    nowPlayingContainer.innerHTML = '';
    nowPlayingContainer.appendChild(
      createCarouselComponent('Now in Theatres', nowPlaying.results || [], 'movie', handleInfoClick)
    );

    // 5. Stremio Add-ons Video Streams & Play Showcase Section
    const stremioSectionContainer = document.getElementById('section-stremio-servers');
    if (stremioSectionContainer) {
      stremioSectionContainer.innerHTML = '';
      stremioSectionContainer.appendChild(
        createStremioServersSection({
          onWatchClick: (id, type) => handleWatchClick(id, type),
          onInfoClick: (id, type) => handleInfoClick(id, type),
          showToast: (msg, type) => showToast(msg, type)
        })
      );
    }

  } catch (err) {
    showToast('Failed to load feed from TMDB API: ' + err.message, 'error');
  }
}

// ==========================================================================
// Explore & Catalog Grid loading (including genres and infinite scroll)
// ==========================================================================
async function loadExploreCatalog(reset = true) {
  if (state.isFetchingExplore) return;
  state.isFetchingExplore = true;

  const grid = document.getElementById('explore-results-grid');
  const loadMoreBtn = document.getElementById('load-more-btn');
  
  if (reset) {
    state.explorePage = 1;
    state.hasMoreExplore = true;
    grid.innerHTML = `
      <div class="grid-loading-placeholder">
        <span class="loader-spinner"></span>
        <p>Searching directory...</p>
      </div>
    `;
    loadMoreBtn.classList.add('hidden');
  }

  try {
    // Lazy load genres list once
    if (state.genres.length === 0) {
      state.genres = await tmdb.getGenres();
      renderGenreChips();
    }

    let response;
    // Determine fetch route based on state
    if (state.searchQuery) {
      response = await tmdb.searchMulti(state.searchQuery, state.explorePage);
    } else {
      response = await tmdb.discoverMovies(state.explorePage, state.selectedGenreId, state.selectedLanguage);
    }

    const items = response.results || [];
    
    // Filter items to include only movie and TV media types
    const filteredItems = items.filter(item => 
      item.media_type === 'movie' || item.media_type === 'tv' || (!item.media_type && (item.title || item.name))
    );

    if (reset) grid.innerHTML = '';

    if (filteredItems.length === 0 && reset) {
      const sanitizedQuery = escapeHTML(state.searchQuery);
      grid.innerHTML = `
        <div class="empty-state-container">
          <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="muted-svg"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <h3>No matches found</h3>
          <p>We couldn't find any title matching "${sanitizedQuery}". Try different keywords or browse genres.</p>
        </div>
      `;
    } else {
      filteredItems.forEach(item => {
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        const card = createMovieCard(item, type, handleInfoClick);
        grid.appendChild(card);
      });

      // Infinite scroll check
      state.hasMoreExplore = response.page < response.total_pages;
      if (state.hasMoreExplore) {
        loadMoreBtn.classList.remove('hidden');
      } else {
        loadMoreBtn.classList.add('hidden');
      }
    }
  } catch (err) {
    const errorMsg = escapeHTML(err.message);
    if (reset) {
      grid.innerHTML = `
        <div class="empty-state-container" style="border-color: rgba(239, 68, 68, 0.2)">
          <h3 style="color:#fca5a5;">Failed to load results</h3>
          <p>${errorMsg}</p>
        </div>
      `;
    }
    showToast('Search query failed: ' + err.message, 'error');
  } finally {
    state.isFetchingExplore = false;
  }
}

function renderGenreChips() {
  const container = document.getElementById('genres-list');
  if (!container) return;

  // Clear and insert an "All Genres" chip and then "18+" chip
  container.innerHTML = `
    <button class="genre-chip ${state.selectedGenreId === '' ? 'active' : ''}" data-id="">All Genres</button>
    <button class="genre-chip ${state.selectedGenreId === '18plus' ? 'active' : ''}" data-id="18plus">18+ (Adult)</button>
  `;

  state.genres.forEach(genre => {
    const chip = document.createElement('button');
    chip.className = `genre-chip ${state.selectedGenreId === String(genre.id) ? 'active' : ''}`;
    chip.dataset.id = genre.id;
    chip.textContent = genre.name;
    container.appendChild(chip);
  });

  // Attach event handlers
  container.querySelectorAll('.genre-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      container.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      
      state.selectedGenreId = btn.dataset.id;
      // Reset search bar when using genres to avoid logical conflicts
      if (state.selectedGenreId) {
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) {
          searchInput.value = '';
          state.searchQuery = '';
          document.getElementById('search-clear-btn').classList.add('hidden');
        }
      }
      
      loadExploreCatalog(true);
    });
  });
}

// ==========================================================================
// Movies and Series Grid loading
// ==========================================================================
async function loadGenreOrPopularList(gridId, type) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.innerHTML = `
    <div class="grid-loading-placeholder">
      <span class="loader-spinner"></span>
      <p>Loading directory...</p>
    </div>
  `;

  try {
    let response;
    if (type === 'movie') {
      response = await tmdb.discoverMovies(1);
    } else {
      response = await tmdb.discoverSeries(1);
    }

    grid.innerHTML = '';
    const list = response.results || [];
    
    list.forEach(item => {
      const card = createMovieCard(item, type, handleInfoClick);
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<div class="empty-state-container"><h3 style="color:#ef4444;">API Connection Lost</h3><p>${err.message}</p></div>`;
  }
}

// ==========================================================================
// Bookmarks/Library System
// ==========================================================================
function toggleBookmark(item, type) {
  const idx = state.bookmarks.findIndex(b => b.id === item.id && b.mediaType === type);
  const title = item.title || item.name || '';
  let activeState = false;
  
  if (idx > -1) {
    state.bookmarks.splice(idx, 1);
    localStorage.setItem('watchlist', JSON.stringify(state.bookmarks));
    showToast(`Removed "${title}" from watchlist.`, 'info');
    activeState = false;
  } else {
    // Add bookmark details
    state.bookmarks.push({
      id: item.id,
      mediaType: type,
      title: title,
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      release_date: item.release_date || item.first_air_date || '',
      addedAt: Date.now()
    });
    localStorage.setItem('watchlist', JSON.stringify(state.bookmarks));
    showToast(`Added "${title}" to watchlist.`, 'success');
    activeState = true;
  }
  
  // Sync with Firestore DB
  if (state.currentUser) {
    firebaseOperations.syncUserData(state.currentUser.uid, { watchlist: state.bookmarks, history: state.history }).catch(console.error);
  }
  
  // If library view is currently active, render immediately to reflect removal
  if (state.activeView === 'library') {
    renderLibraryView();
  }
  
  return activeState;
}

function renderLibraryView() {
  const grid = document.getElementById('library-grid');
  if (!grid) return;

  if (state.bookmarks.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-container">
        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="muted-svg"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
        <h3>Your watchlist is empty</h3>
        <p>Save movies and TV series to watch later. Click "Add to watchlist" on any title details modal.</p>
        <button class="primary-btn accent-glow-btn" onclick="window.location.hash='#home'">Go Browse</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = '';
  // Show bookmarks (sorted latest added first)
  const sorted = [...state.bookmarks].sort((a,b) => b.addedAt - a.addedAt);
  sorted.forEach(bm => {
    // Convert bookmark object compatibility back to TMDB card format
    const itemAdapter = {
      id: bm.id,
      title: bm.mediaType === 'movie' ? bm.title : null,
      name: bm.mediaType === 'tv' ? bm.title : null,
      poster_path: bm.poster_path,
      vote_average: bm.vote_average,
      release_date: bm.mediaType === 'movie' ? bm.release_date : null,
      first_air_date: bm.mediaType === 'tv' ? bm.release_date : null
    };

    const card = createMovieCard(itemAdapter, bm.mediaType, handleInfoClick);
    grid.appendChild(card);
  });
}

// ==========================================================================
// Continue Watching System
// ==========================================================================
function renderContinueWatching() {
  const container = document.getElementById('row-continue-watching');
  if (!container) return;

  const continueItems = state.history.filter(h => h.progressSeconds > 10);
  
  if (continueItems.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.innerHTML = '';
  container.classList.remove('hidden');

  const adaptedItems = continueItems.map(c => ({
    id: c.id,
    title: c.type === 'movie' ? c.title : null,
    name: c.type === 'tv' ? c.title : null,
    poster_path: c.poster_path,
    vote_average: c.vote_average,
    release_date: c.type === 'movie' ? c.release_date : null,
    first_air_date: c.type === 'tv' ? c.release_date : null,
    media_type: c.type
  }));

  const carousel = createCarouselComponent(
    'Continue Watching', 
    adaptedItems, 
    null, 
    (id, type) => {
      handleInfoClick(id, type);
    },
    (id, type) => {
      removeContinueWatchingProgress(id, type);
    }
  );

  container.appendChild(carousel);
}

function removeContinueWatchingProgress(id, type) {
  const entryId = `${type}-${id}`;
  const idx = state.history.findIndex(h => `${h.type}-${h.id}` === entryId);
  if (idx > -1) {
    state.history[idx].progressSeconds = 0;
    localStorage.setItem('history', JSON.stringify(state.history));
    
    // Sync with Firestore DB
    if (state.currentUser) {
      firebaseOperations.syncUserData(state.currentUser.uid, { watchlist: state.bookmarks, history: state.history }).catch(console.error);
    }
    
    showToast('Removed from Continue Watching.', 'info');
    renderContinueWatching();
  }
}

let syncTimeout = null;

function saveWatchProgress(item, type, season = null, episode = null, durationSeconds = 0) {
  const entryId = `${type}-${item.id}`;
  const title = item.title || item.name || '';
  
  // Find if we already have a record
  const existingIndex = state.history.findIndex(h => `${h.type}-${h.id}` === entryId);
  let progressSeconds = 0;
  
  if (existingIndex > -1) {
    const existing = state.history[existingIndex];
    
    if (type === 'tv') {
      // If we are playing the same episode, accumulate progress. Otherwise start fresh for the new episode.
      if (existing.season === season && existing.episode === episode) {
        progressSeconds = (existing.progressSeconds || 0) + durationSeconds;
      } else {
        progressSeconds = durationSeconds;
      }
    } else {
      // Movie: accumulate progress
      progressSeconds = (existing.progressSeconds || 0) + durationSeconds;
    }
    
    // Remove to re-insert at top of history
    state.history.splice(existingIndex, 1);
  } else {
    progressSeconds = durationSeconds;
  }
  
  const historyEntry = {
    id: item.id,
    type: type,
    title: title,
    poster_path: item.poster_path,
    vote_average: item.vote_average,
    release_date: item.release_date || item.first_air_date || '',
    season: season,
    episode: episode,
    progressSeconds: progressSeconds,
    timestamp: Date.now()
  };

  state.history.unshift(historyEntry);
  state.history = state.history.slice(0, 30); // Limit logs cap to latest 30 entries
  localStorage.setItem('history', JSON.stringify(state.history));
  
  // Debounce sync with Firestore DB (1.5s delay to batch rapid updates)
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    if (state.currentUser) {
      firebaseOperations.syncUserData(state.currentUser.uid, { watchlist: state.bookmarks, history: state.history }).catch(console.error);
    }
  }, 1500);
  
  // Re-render if looking at history or home feed
  if (state.activeView === 'history') {
    renderHistoryView();
  }
  if (state.activeView === 'home') {
    renderContinueWatching();
  }
}

function renderHistoryView() {
  const grid = document.getElementById('history-grid');
  if (!grid) return;

  if (state.history.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-container">
        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="muted-svg"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <h3>No streaming history</h3>
        <p>Start watching your favorite media to populate history records.</p>
        <button class="primary-btn accent-glow-btn" onclick="window.location.hash='#home'">Go Browse</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = '';
  state.history.forEach(hist => {
    // Adapt details back to TMDB card format
    const itemAdapter = {
      id: hist.id,
      title: hist.type === 'movie' ? hist.title : null,
      name: hist.type === 'tv' ? hist.title : null,
      poster_path: hist.poster_path,
      vote_average: hist.vote_average,
      release_date: hist.type === 'movie' ? hist.release_date : null,
      first_air_date: hist.type === 'tv' ? hist.release_date : null
    };

    const card = createMovieCard(itemAdapter, hist.type, (id, mType) => {
      // Direct clicks on history cards can prompt to resume watch
      handleInfoClick(id, mType);
    });
    
    // Inject episode badge tag on card
    if (hist.type === 'tv' && hist.season && hist.episode) {
      const infoSpan = document.createElement('div');
      infoSpan.style.fontSize = '0.7rem';
      infoSpan.style.color = 'var(--accent-cyan)';
      infoSpan.style.fontWeight = 'bold';
      infoSpan.style.marginTop = '0.2rem';
      infoSpan.textContent = `Resume S${hist.season}:E${hist.episode}`;
      card.querySelector('.card-info').appendChild(infoSpan);
    }
    
    // Inject watch progress minutes duration
    const progressMins = hist.progressSeconds ? Math.floor(hist.progressSeconds / 60) : 0;
    if (progressMins > 0) {
      const timeSpan = document.createElement('div');
      timeSpan.style.fontSize = '0.65rem';
      timeSpan.style.color = 'var(--text-med)';
      timeSpan.style.marginTop = '0.1rem';
      timeSpan.textContent = `Watched: ${progressMins}m`;
      card.querySelector('.card-info').appendChild(timeSpan);
    }
    
    grid.appendChild(card);
  });
}

function clearWatchHistory() {
  if (confirm('Are you sure you want to clear your recently watched streams?')) {
    state.history = [];
    localStorage.removeItem('history');
    renderHistoryView();
    showToast('Watch history cleared successfully.', 'info');
  }
}

// ==========================================================================
// Settings UI Configurations
// ==========================================================================
function loadSettingsFormValues() {
  const keyInput = document.getElementById('settings-api-key');
  const movieInput = document.getElementById('settings-stream-movie');
  const tvInput = document.getElementById('settings-stream-tv');

  if (keyInput) {
    keyInput.value = getApiKey();
  }
  if (movieInput) {
    movieInput.value = getMovieStreamTemplate();
  }
  if (tvInput) {
    tvInput.value = getTvStreamTemplate();
  }

  // Update diagnostics logs view
  const logsBox = document.getElementById('diagnostic-logs-box');
  const activeModeSpan = document.getElementById('diagnostic-active-mode');
  if (activeModeSpan) {
    activeModeSpan.textContent = firebaseActive ? 'Active Firebase Auth' : 'Sandbox Simulated Mock Auth';
    activeModeSpan.style.color = firebaseActive ? 'var(--accent-cyan)' : '#fbbf24';
  }
  if (logsBox) {
    const logs = JSON.parse(localStorage.getItem('auth_logs') || '[]');
    if (logs.length === 0) {
      logsBox.textContent = "No log records. Perform login or check authorization states to record logs.";
    } else {
      logsBox.textContent = logs.map(l => {
        if (l.event === 'auth-error') {
          return `[${l.time}] ❌ ERROR: ${l.message}`;
        }
        if (l.event === 'onAuthStateChanged') {
          return `[${l.time}] 👤 Auth State: ${l.user ? `${l.user.email} (${l.user.role}, approved: ${l.user.approved})` : 'Logged Out'}`;
        }
        return `[${l.time}] ${l.event}: ${JSON.stringify(l.data || '')}`;
      }).join('\n');
    }
  }
}

function saveSettingsFromUI() {
  const keyInput = document.getElementById('settings-api-key');
  const movieInput = document.getElementById('settings-stream-movie');
  const tvInput = document.getElementById('settings-stream-tv');

  if (keyInput) {
    const rawKey = keyInput.value.trim();
    
    // Safety guard: reject URLs or domain inputs as TMDB API Key
    if (rawKey.startsWith('http://') || rawKey.startsWith('https://') || rawKey.includes('.app') || rawKey.includes('.org') || rawKey.includes('.com')) {
      showToast('Error: TMDB API Key cannot be a URL or domain. Paste a valid TMDB key.', 'error');
      return;
    }

    localStorage.setItem('tmdb_api_key', rawKey);
    
    // If logged-in user is Admin, automatically push this key as the shared global config inside Firestore!
    if (state.currentUser && state.currentUser.role === 'admin') {
      firebaseOperations.saveGlobalConfig({ tmdbApiKey: rawKey }).catch(err => {
        console.warn("Failed to persist TMDB API Key globally in database:", err);
      });
    }
  }
  if (movieInput) {
    localStorage.setItem('stream_movie_template', movieInput.value.trim());
  }
  if (tvInput) {
    localStorage.setItem('stream_tv_template', tvInput.value.trim());
  }

  showToast('Configuration applied and saved locally!', 'success');
  clearTmdbCache();
  verifyApiConfiguration();
}

function resetSettingsToDefault() {
  if (confirm('Reset custom keys and player streams back to defaults?')) {
    localStorage.removeItem('tmdb_api_key');
    localStorage.removeItem('stream_movie_template');
    localStorage.removeItem('stream_tv_template');
    
    clearTmdbCache();
    loadSettingsFormValues();
    verifyApiConfiguration();
    showToast('Settings reset to system default.', 'info');
  }
}

// ==========================================================================
// Actions Handlers
// ==========================================================================
async function handleInfoClick(id, type) {
  const modal = document.getElementById('details-modal');
  const content = document.getElementById('modal-content-dynamic');
  
  if (!modal || !content) return;
  
  // Show modal with loading spinner immediately
  content.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:400px; gap:1rem;">
      <span class="loader-spinner"></span>
      <p style="color:var(--text-med); font-size:0.95rem;">Fetching details...</p>
    </div>
  `;
  modal.classList.remove('hidden');

  try {
    const itemDetails = await tmdb.getDetails(id, type);
    const isBookmarked = state.bookmarks.some(b => b.id === id && b.mediaType === type);

    populateDetailsModal(
      itemDetails,
      type,
      isBookmarked,
      handleWatchClick,
      toggleBookmark,
      handleTrailerClick
    );
  } catch (err) {
    content.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height:400px; padding:2rem; text-align:center;">
        <h3 style="color:#ef4444; margin-bottom:0.5rem;">Connection Timeout</h3>
        <p style="color:var(--text-med); margin-bottom:1.5rem;">${err.message}</p>
        <button class="secondary-btn" id="modal-retry-btn">Retry Fetch</button>
      </div>
    `;
    
    document.getElementById('modal-retry-btn')?.addEventListener('click', () => {
      handleInfoClick(id, type);
    });
    
    showToast('Failed to fetch details: ' + err.message, 'error');
  }
}

async function handleWatchClick(id, type) {
  // Close details modal if open
  document.getElementById('details-modal').classList.add('hidden');
  
  showToast('Initiating stream player...', 'info');

  try {
    const itemDetails = await tmdb.getDetails(id, type);
    
    // Look up watch history logs to see if we have a resume point
    let resumeSeason = 1;
    let resumeEpisode = 1;
    let resumeProgressSeconds = 0;
    
    if (type === 'tv') {
      const historyRecord = state.history.find(h => h.id === id && h.type === 'tv');
      if (historyRecord && historyRecord.season && historyRecord.episode) {
        resumeSeason = historyRecord.season;
        resumeEpisode = historyRecord.episode;
        resumeProgressSeconds = historyRecord.progressSeconds || 0;
        showToast(`Resuming watch from S${resumeSeason}:E${resumeEpisode}`, 'success');
      }
    } else {
      const historyRecord = state.history.find(h => h.id === id && h.type === 'movie');
      if (historyRecord && historyRecord.progressSeconds > 10) {
        resumeProgressSeconds = historyRecord.progressSeconds;
        const mins = Math.floor(resumeProgressSeconds / 60);
        showToast(`Resuming movie at ${mins}m`, 'success');
      }
    }

    openPlayerOverlay(
      itemDetails, 
      type, 
      getMovieStreamTemplate(), 
      getTvStreamTemplate(), 
      {
        season: resumeSeason,
        episode: resumeEpisode,
        progressSeconds: resumeProgressSeconds,
        onProgressSave: saveWatchProgress
      }
    );

  } catch (err) {
    showToast('Failed to start stream server: ' + err.message, 'error');
  }
}

function handleTrailerClick(youtubeKey) {
  // We can open YouTube trailer in a clean overlay or dynamic inline video
  const trailerOverlay = document.createElement('div');
  trailerOverlay.style.position = 'fixed';
  trailerOverlay.style.top = '0';
  trailerOverlay.style.left = '0';
  trailerOverlay.style.width = '100vw';
  trailerOverlay.style.height = '100vh';
  trailerOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
  trailerOverlay.style.zIndex = '400';
  trailerOverlay.style.display = 'flex';
  trailerOverlay.style.alignItems = 'center';
  trailerOverlay.style.justifyContent = 'center';

  trailerOverlay.innerHTML = `
    <div style="position:relative; width:80%; max-width:800px; aspect-ratio:16/9; background:#000; border-radius:12px; overflow:hidden;">
      <button id="trailer-close-overlay" style="position:absolute; top:12px; right:12px; background:rgba(0,0,0,0.6); color:#fff; border:none; width:36px; height:36px; border-radius:50%; font-size:1.2rem; cursor:pointer; display:flex; align-items:center; justify-content:center; z-index:10;">&times;</button>
      <iframe src="https://www.youtube.com/embed/${youtubeKey}?autoplay=1" style="width:100%; height:100%; border:none;" allow="autoplay; encrypted-media; gyroscope" allowfullscreen></iframe>
    </div>
  `;

  document.body.appendChild(trailerOverlay);
  
  const close = () => {
    trailerOverlay.remove();
  };
  
  trailerOverlay.querySelector('#trailer-close-overlay').addEventListener('click', close);
  trailerOverlay.addEventListener('click', close);
}

// ==========================================================================
// Initialization & Global Event Wiring
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize routes
  initRouter();

  // Search input handler
  const searchInput = document.getElementById('global-search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const enterBtn = document.getElementById('search-enter-btn');

  const executeSearchImmediate = () => {
    clearTimeout(state.searchTimeout);
    const query = searchInput ? searchInput.value.trim() : '';
    state.searchQuery = query;
    if (state.activeView !== 'explore') {
      window.location.hash = '#explore';
    } else {
      loadExploreCatalog(true);
    }
  };
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      state.searchQuery = query;

      if (query.length > 0) {
        clearBtn?.classList.remove('hidden');
      } else {
        clearBtn?.classList.add('hidden');
      }

      // Debounce searching requests
      clearTimeout(state.searchTimeout);
      state.searchTimeout = setTimeout(() => {
        // Switch to explore tab if user is currently elsewhere
        if (state.activeView !== 'explore') {
          window.location.hash = '#explore';
        } else {
          loadExploreCatalog(true);
        }
      }, 500);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        executeSearchImmediate();
      }
    });
  }

  if (enterBtn) {
    enterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeSearchImmediate();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      clearBtn.classList.add('hidden');
      if (state.activeView === 'explore') {
        loadExploreCatalog(true);
      }
    });
  }

  // Load More explore items (Pagination)
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      if (state.hasMoreExplore) {
        state.explorePage++;
        loadExploreCatalog(false);
      }
    });
  }

  // Industry filter chips event handling
  const industryList = document.getElementById('industries-list');
  if (industryList) {
    industryList.querySelectorAll('.industry-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        industryList.querySelectorAll('.industry-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        
        state.selectedLanguage = btn.dataset.lang;
        
        // Reset search bar when using industry filters to avoid logical conflicts
        if (state.selectedLanguage) {
          const searchInput = document.getElementById('global-search-input');
          if (searchInput) {
            searchInput.value = '';
            state.searchQuery = '';
            const scBtn = document.getElementById('search-clear-btn');
            if (scBtn) scBtn.classList.add('hidden');
          }
        }
        
        loadExploreCatalog(true);
      });
    });
  }

  // Details Modal close trigger
  const modalClose = document.getElementById('modal-close-btn');
  const modal = document.getElementById('details-modal');
  if (modalClose && modal) {
    modalClose.onclick = () => modal.classList.add('hidden');
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    };
  }

  // Settings Buttons Events
  document.getElementById('save-settings-btn')?.addEventListener('click', saveSettingsFromUI);
  document.getElementById('reset-settings-btn')?.addEventListener('click', resetSettingsToDefault);
  document.getElementById('clear-history-btn')?.addEventListener('click', clearWatchHistory);
  document.getElementById('clear-diagnostic-btn')?.addEventListener('click', () => {
    localStorage.removeItem('auth_logs');
    const logsBox = document.getElementById('diagnostic-logs-box');
    if (logsBox) logsBox.textContent = "Logs cleared. Perform authentication events to log data.";
    showToast('Diagnostic logs cleared.', 'info');
  });

  // Settings Password Toggle
  const toggleBtn = document.getElementById('toggle-key-visibility');
  const keyInput = document.getElementById('settings-api-key');
  if (toggleBtn && keyInput) {
    toggleBtn.addEventListener('click', () => {
      if (keyInput.type === 'password') {
        keyInput.type = 'text';
        toggleBtn.innerHTML = `<svg id="eye-closed" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
      } else {
        keyInput.type = 'password';
        toggleBtn.innerHTML = `<svg id="eye-open" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      }
    });
  }

  // Initialize Authentication State and Forms Listener after Firebase is fully loaded to avoid race condition mock flags
  firebaseInitPromise.then(() => {
    initializeAuthListener();
  });
});

// ==========================================================================
// User Authentication & Admin Dashboard Integration
// ==========================================================================
function loadAdminDashboard() {
  initAdminSubTabs();
  loadAdminMembersTab();
  renderAdminServersTable();
  renderAdminStremioList();
  initAdminModalsAndActions();
}

function initAdminSubTabs() {
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const targetPane = document.getElementById(`admin-pane-${tab.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');
    };
  });
}

function loadAdminMembersTab() {
  const tbody = document.getElementById('admin-members-tbody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align:center; padding:3rem; color:var(--text-med);">
        <span class="loader-spinner" style="margin: 0 auto 1rem auto; width:30px; height:30px;"></span>
        Loading member directory...
      </td>
    </tr>
  `;

  if (membersUnsubscribe) {
    membersUnsubscribe();
    membersUnsubscribe = null;
  }

  membersUnsubscribe = firebaseOperations.onMembersListChanged((members) => {
    tbody.innerHTML = '';

    if (members.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:3rem; color:var(--text-med);">
            No registered members found.
          </td>
        </tr>
      `;
      return;
    }

    const sorted = [...members].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    tbody.innerHTML = '';

    sorted.forEach(m => {
      const tr = document.createElement('tr');
      const registerDate = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'N/A';
      const lastActiveDate = m.lastLogin ? new Date(m.lastLogin).toLocaleString() : 'N/A';
      
      let statusClass = 'pending';
      let statusText = 'Pending';
      if (m.approved === true) {
        statusClass = 'approved';
        statusText = 'Approved';
      } else if (m.approved === false && m.createdAt) {
        statusClass = 'suspended';
        statusText = 'Suspended';
      }

      const isSelf = m.uid === state.currentUser?.uid;
      const roleText = m.role === 'admin' ? 'Admin' : 'Member';
      const safeEmail = escapeHTML(m.email || 'unknown@user');
      const safeUid = escapeHTML(m.uid);
      const safeRole = escapeHTML(m.role || 'member');
      const emailInitial = escapeHTML((m.email || 'U').charAt(0).toUpperCase());

      tr.innerHTML = `
        <td style="padding:1.25rem 1.75rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <div style="width:32px; height:32px; border-radius:50%; background:var(--accent-gradient); display:flex; align-items:center; justify-content:center; color:var(--bg-darkest); font-weight:bold; font-size:0.85rem;">
              ${emailInitial}
            </div>
            <div>
              <span style="font-weight:600; color:var(--text-high);">${safeEmail}</span>
              ${isSelf ? '<span style="font-size:0.7rem; color:var(--text-muted); margin-left:0.25rem;">(You)</span>' : ''}
            </div>
          </div>
        </td>
        <td style="padding:1.25rem 1.75rem; color:var(--text-med);">${registerDate}</td>
        <td style="padding:1.25rem 1.75rem; color:var(--text-med);">${lastActiveDate}</td>
        <td style="padding:1.25rem 1.75rem;">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </td>
        <td style="padding:1.25rem 1.75rem;">
          <span style="font-weight:600; color:${m.role === 'admin' ? 'var(--accent-cyan)' : 'var(--text-high)'};">${roleText}</span>
        </td>
        <td style="padding:1.25rem 1.75rem; text-align:right;">
          ${!isSelf ? `
            ${m.approved === true ? `
              <button class="action-badge-btn danger-action toggle-approve-btn" data-uid="${safeUid}" data-approved="false" data-role="${safeRole}">Suspend</button>
            ` : `
              <button class="action-badge-btn toggle-approve-btn" data-uid="${safeUid}" data-approved="true" data-role="${safeRole}">Approve</button>
            `}
            ${m.role === 'admin' ? `
              <button class="action-badge-btn toggle-role-btn" data-uid="${safeUid}" data-approved="${m.approved}" data-role="member">Demote</button>
            ` : `
              <button class="action-badge-btn toggle-role-btn" data-uid="${safeUid}" data-approved="${m.approved}" data-role="admin">Make Admin</button>
            `}
          ` : '<span style="color:var(--text-muted); font-size:0.8rem; font-style:italic;">No Actions</span>'}
        </td>
      `;

      tr.querySelectorAll('.toggle-approve-btn').forEach(btn => {
        btn.onclick = async () => {
          const uid = btn.dataset.uid;
          const approveVal = btn.dataset.approved === 'true';
          const role = btn.dataset.role;
          try {
            await firebaseOperations.updateMemberStatus(uid, approveVal, role);
            showToast('Member status updated successfully.', 'success');
          } catch (err) {
            showToast('Failed to update member status: ' + err.message, 'error');
          }
        };
      });

      tr.querySelectorAll('.toggle-role-btn').forEach(btn => {
        btn.onclick = async () => {
          const uid = btn.dataset.uid;
          const approved = btn.dataset.approved === 'true';
          const nextRole = btn.dataset.role;
          try {
            await firebaseOperations.updateMemberStatus(uid, approved, nextRole);
            showToast('Member role updated successfully.', 'success');
          } catch (err) {
            showToast('Failed to update member role: ' + err.message, 'error');
          }
        };
      });

      tbody.appendChild(tr);
    });
  });
}

function renderAdminServersTable() {
  const tbody = document.getElementById('admin-servers-tbody');
  if (!tbody) return;

  const servers = getStreamServers();
  tbody.innerHTML = '';

  if (servers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:2.5rem; color:var(--text-med);">
          No streaming source servers configured. Click "Add Source API" or "Reset Defaults".
        </td>
      </tr>
    `;
    return;
  }

  servers.forEach((srv) => {
    const tr = document.createElement('tr');
    const safeName = escapeHTML(srv.name);
    const safeMovie = escapeHTML(srv.movieUrl);
    const safeTv = escapeHTML(srv.tvUrl);
    const safeId = escapeHTML(srv.id);
    const isActive = srv.active !== false;

    tr.innerHTML = `
      <td style="padding:1.25rem 1.75rem;">
        <span style="font-weight:600; color:var(--text-high);">${safeName}</span>
        ${srv.isDefault ? '<span style="font-size:0.65rem; margin-left:0.35rem; color:var(--text-muted);">(Built-in)</span>' : ''}
      </td>
      <td style="padding:1.25rem 1.75rem; color:var(--text-med); font-family:monospace; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeMovie}">
        ${safeMovie}
      </td>
      <td style="padding:1.25rem 1.75rem; color:var(--text-med); font-family:monospace; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${safeTv}">
        ${safeTv}
      </td>
      <td style="padding:1.25rem 1.75rem;">
        <span class="status-badge ${isActive ? 'approved' : 'suspended'}">${isActive ? 'Active' : 'Disabled'}</span>
      </td>
      <td style="padding:1.25rem 1.75rem; text-align:right; white-space:nowrap;">
        <button class="action-badge-btn edit-server-btn" data-id="${safeId}">Edit</button>
        <button class="action-badge-btn toggle-server-btn" data-id="${safeId}" data-active="${!isActive}">
          ${isActive ? 'Disable' : 'Enable'}
        </button>
        <button class="action-badge-btn danger-action delete-server-btn" data-id="${safeId}">Delete</button>
      </td>
    `;

    // Action handlers
    tr.querySelector('.edit-server-btn').onclick = () => {
      openServerModal(srv);
    };

    tr.querySelector('.toggle-server-btn').onclick = async () => {
      toggleStreamServer(srv.id, !isActive);
      showToast(`Server "${srv.name}" ${!isActive ? 'enabled' : 'disabled'}.`, 'info');
      renderAdminServersTable();
      syncAdminConfigToCloud();
    };

    tr.querySelector('.delete-server-btn').onclick = () => {
      if (confirm(`Are you sure you want to delete server "${srv.name}"?`)) {
        deleteStreamServer(srv.id);
        showToast(`Server "${srv.name}" deleted.`, 'info');
        renderAdminServersTable();
        syncAdminConfigToCloud();
      }
    };

    tbody.appendChild(tr);
  });
}

function renderAdminStremioList() {
  const container = document.getElementById('admin-stremio-list');
  if (!container) return;

  const addons = getStremioAddons();
  container.innerHTML = '';

  if (addons.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:3rem; color:var(--text-med);">
        No Stremio add-ons installed. Click "Install Add-on" to add custom Stremio streams.
      </div>
    `;
    return;
  }

  addons.forEach(addon => {
    const card = document.createElement('div');
    card.className = 'stremio-addon-card';
    card.style.cssText = 'background:var(--bg-card); border:1px solid var(--border-glass); border-radius:14px; padding:1.25rem; display:flex; flex-direction:column; justify-content:space-between; gap:1rem;';

    const safeName = escapeHTML(addon.name);
    const safeDesc = escapeHTML(addon.description || 'Stremio Protocol Add-on');
    const safeVer = escapeHTML(addon.version || '1.0.0');
    const safeUrl = escapeHTML(addon.manifestUrl);
    const isActive = addon.active !== false;

    card.innerHTML = `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
          <h4 style="font-size:1rem; font-weight:700; color:var(--text-high);">${safeName}</h4>
          <span style="font-size:0.7rem; color:var(--accent-cyan); background:rgba(0,242,254,0.1); padding:0.15rem 0.5rem; border-radius:4px;">v${safeVer}</span>
        </div>
        <p style="font-size:0.8rem; color:var(--text-med); line-height:1.4; margin-bottom:0.75rem;">${safeDesc}</p>
        <div style="font-family:monospace; font-size:0.7rem; color:var(--text-muted); word-break:break-all;" title="${safeUrl}">
          ${safeUrl}
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-glass); padding-top:0.75rem;">
        <span class="status-badge ${isActive ? 'approved' : 'suspended'}">${isActive ? 'Active' : 'Disabled'}</span>
        <div style="display:flex; gap:0.35rem;">
          <button class="action-badge-btn test-stremio-btn" data-id="${escapeHTML(addon.id)}" title="Test manifest connection">Probe</button>
          <button class="action-badge-btn toggle-stremio-btn" data-id="${escapeHTML(addon.id)}">${isActive ? 'Disable' : 'Enable'}</button>
          <button class="action-badge-btn danger-action delete-stremio-btn" data-id="${escapeHTML(addon.id)}">Remove</button>
        </div>
      </div>
    `;

    card.querySelector('.test-stremio-btn').onclick = async () => {
      showToast(`Probing ${addon.name}...`, 'info');
      try {
        const res = await fetch(addon.manifestUrl);
        if (res.ok) {
          showToast(`Add-on ${addon.name} is responding online!`, 'success');
        } else {
          showToast(`Add-on responded with status ${res.status}`, 'error');
        }
      } catch (e) {
        showToast(`Failed to reach add-on: ${e.message}`, 'error');
      }
    };

    card.querySelector('.toggle-stremio-btn').onclick = () => {
      toggleStremioAddon(addon.id, !isActive);
      showToast(`Add-on "${addon.name}" ${!isActive ? 'enabled' : 'disabled'}.`, 'info');
      renderAdminStremioList();
      syncAdminConfigToCloud();
    };

    card.querySelector('.delete-stremio-btn').onclick = () => {
      if (confirm(`Remove Stremio add-on "${addon.name}"?`)) {
        removeStremioAddon(addon.id);
        showToast(`Add-on "${addon.name}" removed.`, 'info');
        renderAdminStremioList();
        syncAdminConfigToCloud();
      }
    };

    container.appendChild(card);
  });

  // Render Community Presets Section inside Admin Console
  const presetsWrapper = document.createElement('div');
  presetsWrapper.style.cssText = 'grid-column: 1 / -1; margin-top: 2rem; border-top: 1px solid var(--border-glass); padding-top: 1.5rem;';
  presetsWrapper.innerHTML = `
    <h4 style="font-family:var(--font-secondary); font-size:1.05rem; font-weight:700; color:var(--text-high); margin-bottom:0.35rem;">Recommended Community Add-ons</h4>
    <p style="font-size:0.8rem; color:var(--text-med); margin-bottom:1.25rem;">Install popular community scrapers, subtitle engines, and catalogs with one click.</p>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:1rem;" id="admin-stremio-presets-grid"></div>
  `;
  container.appendChild(presetsWrapper);

  const presetsGrid = presetsWrapper.querySelector('#admin-stremio-presets-grid');
  const installedIds = new Set(addons.map(a => a.id));

  POPULAR_STREMIO_ADDONS_PRESETS.forEach(preset => {
    const isInstalled = installedIds.has(preset.id);
    const pCard = document.createElement('div');
    pCard.style.cssText = 'background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:12px; padding:1rem; display:flex; flex-direction:column; justify-content:space-between; gap:0.75rem;';
    
    pCard.innerHTML = `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
          <h5 style="font-size:0.9rem; font-weight:700; color:var(--text-high);">${escapeHTML(preset.name)}</h5>
          <span style="font-size:0.65rem; color:var(--accent-cyan); background:rgba(0,242,254,0.1); padding:0.1rem 0.35rem; border-radius:4px;">v${escapeHTML(preset.version)}</span>
        </div>
        <p style="font-size:0.75rem; color:var(--text-med); line-height:1.4;">${escapeHTML(preset.description)}</p>
      </div>
      <div>
        ${isInstalled ? `
          <button class="action-badge-btn approved" style="width:100%; text-align:center; padding:0.4rem;" disabled>✓ Installed</button>
        ` : `
          <button class="action-badge-btn install-preset-btn" style="width:100%; text-align:center; padding:0.4rem; color:var(--accent-cyan); border-color:rgba(0,242,254,0.3);">+ 1-Click Install</button>
        `}
      </div>
    `;

    pCard.querySelector('.install-preset-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Installing...';
      try {
        const inst = await installStremioAddon(preset.manifestUrl);
        showToast(`Installed "${inst.name}"!`, 'success');
        renderAdminStremioList();
        syncAdminConfigToCloud();
      } catch (err) {
        showToast('Install failed: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '+ 1-Click Install';
      }
    });

    presetsGrid?.appendChild(pCard);
  });
}

function openServerModal(server = null) {
  const modal = document.getElementById('modal-stream-server');
  const titleEl = document.getElementById('modal-server-title');
  const idInput = document.getElementById('server-form-id');
  const nameInput = document.getElementById('server-form-name');
  const movieInput = document.getElementById('server-form-movie');
  const tvInput = document.getElementById('server-form-tv');
  const activeInput = document.getElementById('server-form-active');

  if (!modal) return;

  if (server) {
    titleEl.textContent = 'Edit Streaming Server API';
    idInput.value = server.id;
    nameInput.value = server.name;
    movieInput.value = server.movieUrl;
    tvInput.value = server.tvUrl;
    activeInput.checked = server.active !== false;
  } else {
    titleEl.textContent = 'Add Streaming Server API';
    idInput.value = '';
    nameInput.value = '';
    movieInput.value = '';
    tvInput.value = '';
    activeInput.checked = true;
  }

  modal.classList.remove('hidden');
}

function openStremioModal() {
  const stremioModal = document.getElementById('modal-stremio-addon');
  const urlInput = document.getElementById('stremio-form-url');
  if (urlInput) urlInput.value = '';
  if (stremioModal) stremioModal.classList.remove('hidden');
}

function initAdminModalsAndActions() {
  // Add server button
  document.getElementById('admin-add-server-btn')?.addEventListener('click', () => {
    openServerModal(null);
  });

  // Reset servers button
  document.getElementById('admin-reset-servers-btn')?.addEventListener('click', () => {
    if (confirm('Reset all streaming servers to built-in factory defaults?')) {
      resetStreamServersToDefault();
      renderAdminServersTable();
      syncAdminConfigToCloud();
      showToast('Streaming servers reset to defaults.', 'info');
    }
  });

  // Close server modal
  const serverModal = document.getElementById('modal-stream-server');
  document.getElementById('modal-server-close-btn')?.addEventListener('click', () => serverModal.classList.add('hidden'));
  document.getElementById('modal-server-cancel-btn')?.addEventListener('click', () => serverModal.classList.add('hidden'));

  // Server Form Submit
  const serverForm = document.getElementById('form-stream-server');
  if (serverForm) {
    serverForm.onsubmit = (e) => {
      e.preventDefault();
      const id = document.getElementById('server-form-id').value;
      const name = document.getElementById('server-form-name').value.trim();
      const movieUrl = document.getElementById('server-form-movie').value.trim();
      const tvUrl = document.getElementById('server-form-tv').value.trim();
      const active = document.getElementById('server-form-active').checked;

      saveStreamServer({ id: id || undefined, name, movieUrl, tvUrl, active });
      serverModal.classList.add('hidden');
      renderAdminServersTable();
      syncAdminConfigToCloud();
      showToast(`Streaming server "${name}" saved successfully!`, 'success');
    };
  }

  // Stremio Addons Diagnostic Health & Video Fetch Check Button
  const checkAddonsBtn = document.getElementById('admin-check-stremio-btn');
  const diagContainer = document.getElementById('admin-stremio-diagnostics');

  checkAddonsBtn?.addEventListener('click', async () => {
    checkAddonsBtn.disabled = true;
    checkAddonsBtn.innerHTML = `
      <span class="hub-spinner-sm" style="display:inline-block; margin-right:4px;"></span>
      Checking Add-on Feeds...
    `;
    showToast('Running live video catalog and streaming check on all add-ons...', 'info');

    try {
      const report = await runAddonHealthAndCapabilityCheck();

      if (diagContainer) {
        diagContainer.classList.remove('hidden');
        diagContainer.innerHTML = `
          <div class="diagnostic-report-card">
            <div class="diag-header-row">
              <div>
                <h4 style="font-size:1rem; font-weight:700; color:var(--text-high); display:flex; align-items:center; gap:0.5rem;">
                  <span style="color:var(--accent-cyan);">⚡</span> Add-on Video Capabilities & Health Report
                </h4>
                <p style="font-size:0.8rem; color:var(--text-med); margin-top:0.2rem;">
                  Tested in ${report.totalDurationMs}ms · ${report.reachableCount}/${report.totalChecked} Add-ons Online · ${report.videoFetchCount} Capable of Fetching Videos
                </p>
              </div>
              <button id="diag-close-report-btn" class="action-badge-btn" style="padding:0.35rem 0.75rem;">Close Report &times;</button>
            </div>

            <!-- Quick Metrics Grid -->
            <div class="diag-metrics-grid">
              <div class="diag-metric-item">
                <span class="diag-metric-num">${report.totalChecked}</span>
                <span class="diag-metric-label">Add-ons Checked</span>
              </div>
              <div class="diag-metric-item">
                <span class="diag-metric-num" style="color:#10b981;">${report.reachableCount}</span>
                <span class="diag-metric-label">Online & Reachable</span>
              </div>
              <div class="diag-metric-item">
                <span class="diag-metric-num" style="color:var(--accent-cyan);">${report.videoFetchCount}</span>
                <span class="diag-metric-label">Movie / Video Catalogs</span>
              </div>
              <div class="diag-metric-item">
                <span class="diag-metric-num" style="color:#f59e0b;">${report.streamCount}</span>
                <span class="diag-metric-label">Stream Scrapers</span>
              </div>
            </div>

            <!-- Detailed Add-on Table -->
            <div class="diag-table-wrap">
              <table style="width:100%; border-collapse:collapse; font-size:0.82rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-glass); color:var(--text-muted); text-align:left;">
                    <th style="padding:0.6rem 0.8rem;">Add-on</th>
                    <th style="padding:0.6rem 0.8rem;">Status & Latency</th>
                    <th style="padding:0.6rem 0.8rem;">Video Fetch Test</th>
                    <th style="padding:0.6rem 0.8rem;">Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  ${report.results.map(r => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                      <td style="padding:0.75rem 0.8rem;">
                        <strong style="color:var(--text-high);">${escapeHTML(r.name)}</strong>
                        <div style="font-size:0.7rem; color:var(--text-muted); font-family:monospace;">v${escapeHTML(r.version)}</div>
                      </td>
                      <td style="padding:0.75rem 0.8rem;">
                        ${r.isReachable ? `
                          <span class="status-badge approved">● Online (${r.latencyMs}ms)</span>
                        ` : `
                          <span class="status-badge suspended">✕ Offline</span>
                        `}
                      </td>
                      <td style="padding:0.75rem 0.8rem;">
                        ${r.canFetchVideos ? `
                          <div style="color:#10b981; font-weight:600;">
                            ✓ Fetched ${r.videoSampleCount} video titles
                          </div>
                          ${r.sampleTitles.length > 0 ? `
                            <div style="font-size:0.72rem; color:var(--text-med); margin-top:2px;">
                              e.g. ${escapeHTML(r.sampleTitles.join(', '))}
                            </div>
                          ` : ''}
                        ` : (r.isReachable ? `
                          <span style="color:var(--text-muted);">No direct catalog (Streams/Subtitles only)</span>
                        ` : `
                          <span style="color:#ef4444;">${escapeHTML(r.error || 'Failed')}</span>
                        `)}
                      </td>
                      <td style="padding:0.75rem 0.8rem;">
                        <div style="display:flex; gap:0.3rem; flex-wrap:wrap;">
                          ${r.canFetchVideos ? '<span class="hub-card-tag preset-tag">🎬 Video Feeds</span>' : ''}
                          ${r.canStream ? '<span class="hub-card-tag preset-tag">⚡ Direct Streams</span>' : ''}
                          ${r.canSubtitles ? '<span class="hub-card-tag">💬 Subtitles</span>' : ''}
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

        diagContainer.querySelector('#diag-close-report-btn')?.addEventListener('click', () => {
          diagContainer.classList.add('hidden');
        });
      }

      showToast(`Health Check Complete: ${report.reachableCount} online, ${report.videoFetchCount} can fetch videos!`, 'success');
    } catch (err) {
      showToast('Diagnostic check error: ' + err.message, 'error');
    } finally {
      checkAddonsBtn.disabled = false;
      checkAddonsBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        Run Video Catalog & Health Check
      `;
    }
  });

  // Stremio Addon Modal triggers
  const stremioModal = document.getElementById('modal-stremio-addon');
  document.getElementById('admin-add-stremio-btn')?.addEventListener('click', () => {
    openStremioModal();
  });

  document.getElementById('modal-stremio-close-btn')?.addEventListener('click', () => stremioModal.classList.add('hidden'));
  document.getElementById('modal-stremio-cancel-btn')?.addEventListener('click', () => stremioModal.classList.add('hidden'));

  const stremioForm = document.getElementById('form-stremio-addon');
  if (stremioForm) {
    stremioForm.onsubmit = async (e) => {
      e.preventDefault();
      const urlInput = document.getElementById('stremio-form-url').value.trim();
      const submitBtn = document.getElementById('stremio-form-submit-btn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Validating...';

      try {
        const installed = await installStremioAddon(urlInput);
        stremioModal.classList.add('hidden');
        renderAdminStremioList();
        syncAdminConfigToCloud();
        showToast(`Stremio Add-on "${installed.name}" installed successfully!`, 'success');
      } catch (err) {
        showToast(`Add-on installation error: ${err.message}`, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Install Add-on';
      }
    };
  }

  // TMDB Connection Test Button
  const tmdbKeyInput = document.getElementById('admin-tmdb-key-input');
  if (tmdbKeyInput) {
    tmdbKeyInput.value = getApiKey();
  }

  document.getElementById('admin-test-tmdb-btn')?.addEventListener('click', async () => {
    const rawKey = tmdbKeyInput.value.trim();
    if (!rawKey) {
      showToast('Please enter a TMDB key to test.', 'error');
      return;
    }
    showToast('Testing TMDB connection...', 'info');
    try {
      // Temporarily test key directly
      const headers = rawKey.startsWith('eyJ') ? { Authorization: `Bearer ${rawKey}` } : {};
      const query = rawKey.startsWith('eyJ') ? '' : `?api_key=${rawKey}`;
      const res = await fetch(`https://api.themoviedb.org/3/movie/popular${query}`, { headers });
      if (res.ok) {
        showToast('TMDB API connection verified successfully! 🎉', 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`TMDB Error: ${err.status_message || res.status}`, 'error');
      }
    } catch (e) {
      showToast(`Connection failed: ${e.message}`, 'error');
    }
  });

  // Save Credentials button
  document.getElementById('admin-save-credentials-btn')?.addEventListener('click', () => {
    const rawKey = tmdbKeyInput.value.trim();
    if (rawKey) {
      localStorage.setItem('tmdb_api_key', rawKey);
    }
    syncAdminConfigToCloud();
    clearTmdbCache();
    verifyApiConfiguration();
    showToast('Master credentials published to cloud database.', 'success');
  });
}

function syncAdminConfigToCloud() {
  if (state.currentUser && state.currentUser.role === 'admin') {
    const globalConfig = {
      tmdbApiKey: getApiKey(),
      streamServers: getStreamServers(),
      stremioAddons: getStremioAddons(),
      updatedAt: Date.now(),
      updatedBy: state.currentUser.email
    };
    firebaseOperations.saveGlobalConfig(globalConfig).catch(err => {
      console.warn('Failed to publish global config to Firestore:', err);
    });
  }
}

function initializeAuthListener() {
  const authOverlay = document.getElementById('auth-screen-overlay');
  const approvalOverlay = document.getElementById('approval-screen-overlay');
  
  const userProfileBtn = document.getElementById('user-profile-btn');
  const profileDropdown = document.getElementById('profile-dropdown-menu');
  
  const navAdminLink = document.getElementById('nav-item-admin');
  const dropdownAdminLink = document.getElementById('dropdown-admin-link');
  const mobileNavAdminLink = document.getElementById('mobile-nav-item-admin');
  
  // Status indicator in Admin dashboard
  const dbIndicator = document.getElementById('database-indicator');
  if (dbIndicator) {
    if (firebaseActive) {
      dbIndicator.className = 'setup-indicator status-green';
      dbIndicator.querySelector('.status-text').textContent = 'Cloud Sync Database';
    } else {
      dbIndicator.className = 'setup-indicator status-red';
      dbIndicator.querySelector('.status-text').textContent = 'Mock/Offline Database (No config)';
    }
  }

  // Temporary Auth Bypass if DISABLE_AUTH configuration toggle is active
  if (CONFIG.DISABLE_AUTH === true) {
    console.log("Authentication disabled temporarily.");
    state.currentUser = { uid: 'temp-admin', email: 'admin@ubhstream.com', role: 'admin', approved: true };
    state.isAuthInitialized = true;
    
    if (authOverlay) authOverlay.classList.add('hidden');
    if (approvalOverlay) approvalOverlay.classList.add('hidden');
    if (navAdminLink) navAdminLink.classList.remove('hidden');
    if (dropdownAdminLink) dropdownAdminLink.classList.remove('hidden');
    if (mobileNavAdminLink) mobileNavAdminLink.classList.remove('hidden');
    
    const avatarLetter = document.getElementById('user-avatar-letter');
    const userEmailDisplay = document.getElementById('user-email-display');
    const userRoleBadge = document.getElementById('user-role-badge');
    if (avatarLetter) avatarLetter.textContent = 'A';
    if (userEmailDisplay) userEmailDisplay.textContent = 'admin@ubhstream.com';
    if (userRoleBadge) userRoleBadge.textContent = 'Admin';

    const hash = window.location.hash || '#home';
    const viewName = hash.substring(1).split('?')[0];
    
    const currentViewEl = document.getElementById(`view-${state.activeView}`);
    if (currentViewEl) currentViewEl.classList.remove('active');
    
    const nextView = document.getElementById(`view-${viewName}`);
    if (nextView) {
      nextView.classList.add('active');
      state.activeView = viewName;
      updateNavigationStates(viewName);
      loadViewData(viewName);
    }
    return;
  }

  // Subscribe to auth state changes
  firebaseOperations.onAuthStateChanged(async (userProfile) => {
    state.currentUser = userProfile;
    state.isAuthInitialized = true;

    // Record diagnostic log
    try {
      const logs = JSON.parse(localStorage.getItem('auth_logs') || '[]');
      logs.push({
        time: new Date().toLocaleTimeString(),
        event: 'onAuthStateChanged',
        user: userProfile ? { uid: userProfile.uid, email: userProfile.email, approved: userProfile.approved, role: userProfile.role } : null
      });
      localStorage.setItem('auth_logs', JSON.stringify(logs.slice(-10)));
    } catch (err) {
      console.warn("Failed to write auth diagnostic log:", err);
    }

    if (!userProfile) {
      // Not logged in: force Auth Overlay
      if (authOverlay) authOverlay.classList.remove('hidden');
      if (approvalOverlay) approvalOverlay.classList.add('hidden');
      
      // Hide admin navigations
      if (navAdminLink) navAdminLink.classList.add('hidden');
      if (dropdownAdminLink) dropdownAdminLink.classList.add('hidden');
      if (mobileNavAdminLink) mobileNavAdminLink.classList.add('hidden');
      
      // Clear data states
      state.bookmarks = [];
      state.history = [];
      renderLibraryView();
      renderHistoryView();
    } else {
      // Logged in: hide auth overlay
      if (authOverlay) authOverlay.classList.add('hidden');
      
      // Update header details
      document.getElementById('user-avatar-letter').textContent = (userProfile.email || 'U').charAt(0).toUpperCase();
      document.getElementById('user-email-display').textContent = userProfile.email;
      document.getElementById('user-role-badge').textContent = userProfile.role === 'admin' ? 'Admin' : 'Member';

      // Hide Credentials block in settings for standard members (Admins only)
      const credentialsSec = document.getElementById('settings-credentials-section');
      if (credentialsSec) {
        if (userProfile.role === 'admin') {
          credentialsSec.classList.remove('hidden');
        } else {
          credentialsSec.classList.add('hidden');
        }
      }

      if (userProfile.approved === true) {
        // Logged in & Approved: enable main views
        if (approvalOverlay) approvalOverlay.classList.add('hidden');
        
        // Fetch shared config and user profile data in parallel
        let globalConfig = null;
        let cloudData = { watchlist: [], history: [] };
        
        try {
          const [configRes, userDataRes] = await Promise.all([
            firebaseOperations.fetchGlobalConfig().catch(err => { console.warn(err); return null; }),
            firebaseOperations.getUserData(userProfile.uid).catch(err => { console.warn(err); return { watchlist: [], history: [] }; })
          ]);
          globalConfig = configRes;
          cloudData = userDataRes || { watchlist: [], history: [] };
        } catch (err) {
          console.warn("Parallel initialization error:", err);
        }
        
        if (globalConfig) {
          if (globalConfig.tmdbApiKey) {
            localStorage.setItem('shared_tmdb_api_key', globalConfig.tmdbApiKey);
            const warningBanner = document.getElementById('api-warning-banner');
            if (warningBanner) warningBanner.classList.add('hidden');
          }
          if (Array.isArray(globalConfig.streamServers) && globalConfig.streamServers.length > 0) {
            localStorage.setItem('custom_stream_servers', JSON.stringify(globalConfig.streamServers));
          }
          if (Array.isArray(globalConfig.stremioAddons) && globalConfig.stremioAddons.length > 0) {
            localStorage.setItem('stremio_addons', JSON.stringify(globalConfig.stremioAddons));
          }
        }
        
        // Sync watchlist and history data from Firestore
        try {
          const localWatchlist = JSON.parse(localStorage.getItem('watchlist')) || [];
          const localHistory = JSON.parse(localStorage.getItem('history')) || [];
          let needsSync = false;
          
          if ((!cloudData.watchlist || cloudData.watchlist.length === 0) && localWatchlist.length > 0) {
            cloudData.watchlist = localWatchlist;
            needsSync = true;
          }
          if ((!cloudData.history || cloudData.history.length === 0) && localHistory.length > 0) {
            cloudData.history = localHistory;
            needsSync = true;
          }
          
          if (needsSync) {
            await firebaseOperations.syncUserData(userProfile.uid, { watchlist: cloudData.watchlist || [], history: cloudData.history || [] });
          }
          
          state.bookmarks = cloudData.watchlist || [];
          state.history = cloudData.history || [];
          
          // Re-save to localstorage for offline fallback
          localStorage.setItem('watchlist', JSON.stringify(state.bookmarks));
          localStorage.setItem('history', JSON.stringify(state.history));
        } catch (err) {
          console.error("Firestore cloud sync failed:", err);
          showToast('Failed to sync history from cloud. Running with local backups.', 'error');
        }

        // Show Admin Nav Link if user is admin
        if (userProfile.role === 'admin') {
          if (navAdminLink) navAdminLink.classList.remove('hidden');
          if (dropdownAdminLink) dropdownAdminLink.classList.remove('hidden');
          if (mobileNavAdminLink) mobileNavAdminLink.classList.remove('hidden');
        } else {
          if (navAdminLink) navAdminLink.classList.add('hidden');
          if (dropdownAdminLink) dropdownAdminLink.classList.add('hidden');
          if (mobileNavAdminLink) mobileNavAdminLink.classList.add('hidden');
          
          // Guard: redirect standard members away from admin panel
          if (state.activeView === 'admin') {
            window.location.hash = '#home';
          }
        }
        
        // Trigger active route loading since auth is fully validated
        const hash = window.location.hash || '#home';
        const viewName = hash.substring(1).split('?')[0];
        
        const currentViewEl = document.getElementById(`view-${state.activeView}`);
        if (currentViewEl) currentViewEl.classList.remove('active');
        
        const nextView = document.getElementById(`view-${viewName}`);
        if (nextView) {
          nextView.classList.add('active');
          state.activeView = viewName;
          updateNavigationStates(viewName);
          loadViewData(viewName);
        }
      } else {
        // Logged in but Pending/Suspended: show Approval screen
        if (approvalOverlay) approvalOverlay.classList.remove('hidden');
        document.getElementById('pending-user-email').textContent = userProfile.email;
        
        // Hide admin navigations
        if (navAdminLink) navAdminLink.classList.add('hidden');
        if (dropdownAdminLink) dropdownAdminLink.classList.add('hidden');
        if (mobileNavAdminLink) mobileNavAdminLink.classList.add('hidden');
      }
    }
  });

  // Auth Form Tab switches (Sign In vs Sign Up)
  const tabSignin = document.getElementById('auth-tab-signin');
  const tabSignup = document.getElementById('auth-tab-signup');
  const signinForm = document.getElementById('signin-form');
  const signupForm = document.getElementById('signup-form');
  const authSubtitle = document.getElementById('auth-subtitle');

  if (tabSignin && tabSignup && signinForm && signupForm) {
    tabSignin.onclick = () => {
      tabSignin.classList.add('active');
      tabSignup.classList.remove('active');
      signinForm.classList.remove('hidden');
      signupForm.classList.add('hidden');
      if (authSubtitle) authSubtitle.textContent = 'Sign in to your private UBH Stream portal';
    };

    tabSignup.onclick = () => {
      tabSignup.classList.add('active');
      tabSignin.classList.remove('active');
      signupForm.classList.remove('hidden');
      signinForm.classList.add('hidden');
      if (authSubtitle) authSubtitle.textContent = 'Register account to join friends & family';
    };
  }

  // Handle Email/Password Sign In Submit
  signinForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;
    
    showToast('Authorizing credentials...', 'info');
    try {
      await firebaseOperations.login(email, password);
      showToast('Logged in successfully!', 'success');
    } catch (err) {
      showToast('Login failed: ' + err.message, 'error');
    }
  });

  // Handle Email/Password Sign Up Submit
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    
    showToast('Registering user profile...', 'info');
    try {
      await firebaseOperations.signUp(email, password);
      showToast('Account registered successfully!', 'success');
    } catch (err) {
      showToast('Registration failed: ' + err.message, 'error');
    }
  });

  // Google Login button click
  document.getElementById('google-login-btn')?.addEventListener('click', async () => {
    showToast('Connecting Google credentials...', 'info');
    try {
      await firebaseOperations.signInWithGoogle();
      showToast('Google Sign-In completed!', 'success');
    } catch (err) {
      showToast('Google Auth cancelled: ' + err.message, 'error');
    }
  });

  // Logouts trigger
  const handleLogout = async () => {
    showToast('Disconnecting user profile...', 'info');
    try {
      await firebaseOperations.logout();
      showToast('Logged out successfully.', 'info');
      // Reset view back to Home
      window.location.hash = '#home';
    } catch (err) {
      showToast('Logout failed: ' + err.message, 'error');
    }
  };

  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('approval-logout-btn')?.addEventListener('click', handleLogout);

  // Avatar Dropdown Toggle click
  if (userProfileBtn && profileDropdown) {
    userProfileBtn.onclick = (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('hidden');
    };
    
    // Close dropdown on click outside
    window.addEventListener('click', (e) => {
      if (!userProfileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
        profileDropdown.classList.add('hidden');
      }
    });
  }

  // Listen to Firestore database sync failures (e.g. permission rules blocked)
  window.addEventListener('auth-error', (e) => {
    showToast('Profile load failed: ' + e.detail.message, 'error');
    try {
      const logs = JSON.parse(localStorage.getItem('auth_logs') || '[]');
      logs.push({
        time: new Date().toLocaleTimeString(),
        event: 'auth-error',
        message: e.detail.message
      });
      localStorage.setItem('auth_logs', JSON.stringify(logs.slice(-10)));
    } catch (err) {
      console.warn("Failed to write error diagnostic log:", err);
    }
  });
}
