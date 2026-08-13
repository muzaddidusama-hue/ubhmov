import { tmdb } from '../tmdb.js';
import { escapeHTML, sanitizeUrl } from '../utils/security.js';

/**
 * Creates a movie/series card element.
 */
export function createMovieCard(item, mediaType, onClick, onRemove = null) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  
  const rawTitle = item.title || item.name || 'Untitled';
  const title = escapeHTML(rawTitle);
  const rawPosterUrl = item.poster_path ? tmdb.getImageUrl(item.poster_path, 'w342') : 'https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster';
  const posterUrl = sanitizeUrl(rawPosterUrl, 'https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster');
  const rating = escapeHTML(item.vote_average ? item.vote_average.toFixed(1) : 'N/A');
  const releaseYear = escapeHTML((item.release_date || item.first_air_date || '').split('-')[0] || '');
  const type = (mediaType || (item.first_air_date ? 'tv' : 'movie')) === 'tv' ? 'tv' : 'movie';
  const typeBadge = type === 'tv' ? 'TV' : 'Movie';
  
  // Calculate watch progress indicator
  let progressHtml = '';
  try {
    const history = JSON.parse(localStorage.getItem('history')) || [];
    const record = history.find(h => h.id === item.id && h.type === type);
    if (record && record.progressSeconds > 10) {
      const runtimeMinutes = type === 'movie' ? 120 : 45;
      const totalSeconds = runtimeMinutes * 60;
      const percent = Math.min(95, Math.round((record.progressSeconds / totalSeconds) * 100));
      if (percent > 2) {
        progressHtml = `
          <div class="card-progress-container" title="Progress: ${percent}%">
            <div class="card-progress-fill" style="width: ${percent}%;"></div>
          </div>
        `;
      }
    }
  } catch (e) {
    console.error('Error reading progress:', e);
  }
  
  const removeButtonHtml = onRemove 
    ? `<button class="card-remove-btn" title="Remove from Continue Watching">&times;</button>`
    : '';

  card.innerHTML = `
    <div class="card-poster-wrapper">
      <img src="${posterUrl}" class="card-poster" alt="${title}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster';">
      <span class="card-badge">${typeBadge}</span>
      ${progressHtml}
      ${removeButtonHtml}
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
  
  card.addEventListener('click', () => onClick(item, type));
  
  if (onRemove) {
    card.querySelector('.card-remove-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove(item.id, type);
    });
  }
  
  return card;
}

/**
 * Creates a horizontally scrolling category row with arrow controls.
 */
export function createCarouselComponent(title, items, mediaType, onCardClick, onRemoveClick = null, onViewAll = null) {
  const rowWrapper = document.createElement('div');
  rowWrapper.className = 'carousel-row-container';
  
  const countBadge = items && items.length > 0 ? ` (${items.length})` : '';

  // Outer structure
  rowWrapper.innerHTML = `
    <div class="row-title-container">
      <div class="row-title-left" style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
        <h2 class="row-title" style="cursor:pointer;" title="View all in this category">${title}</h2>
        <button class="see-all-btn" title="View all available videos in ${title}">
          <span>See All${countBadge}</span>
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
      <div class="row-navigation-arrows">
        <button class="arrow-btn arrow-prev" title="Scroll Left">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <button class="arrow-btn arrow-next" title="Scroll Right">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>
    </div>
    <div class="carousel-viewport"></div>
  `;
  
  const viewport = rowWrapper.querySelector('.carousel-viewport');
  
  // Fill viewport with cards
  if (items && items.length > 0) {
    items.forEach(item => {
      // Determine individual card media type if missing from parameter
      const cardType = mediaType || item.media_type || (item.first_air_date ? 'tv' : 'movie');
      const card = createMovieCard(item, cardType, onCardClick, onRemoveClick);
      viewport.appendChild(card);
    });
  } else {
    viewport.innerHTML = '<div class="empty-row-text">No items found.</div>';
  }
  
  // Set up arrow scrolling logic
  const prevBtn = rowWrapper.querySelector('.arrow-prev');
  const nextBtn = rowWrapper.querySelector('.arrow-next');
  
  prevBtn.addEventListener('click', () => {
    // Scroll left by a portion of viewport width
    viewport.scrollBy({ left: -viewport.offsetWidth * 0.75, behavior: 'smooth' });
  });
  
  nextBtn.addEventListener('click', () => {
    // Scroll right
    viewport.scrollBy({ left: viewport.offsetWidth * 0.75, behavior: 'smooth' });
  });

  // View all click triggers
  const handleViewAllTrigger = () => {
    if (typeof onViewAll === 'function') {
      onViewAll({ title, items, mediaType });
    } else {
      window.dispatchEvent(new CustomEvent('open-section-gallery', {
        detail: { title, items, mediaType }
      }));
    }
  };

  rowWrapper.querySelector('.see-all-btn')?.addEventListener('click', handleViewAllTrigger);
  rowWrapper.querySelector('.row-title')?.addEventListener('click', handleViewAllTrigger);
  
  return rowWrapper;
}

/**
 * Creates a horizontal row of skeletons while loading data.
 */
export function createSkeletonCarouselComponent(title, count = 6) {
  const rowWrapper = document.createElement('div');
  rowWrapper.className = 'carousel-row-container loading-skeleton-row';
  
  let skeletonsHtml = '';
  for (let i = 0; i < count; i++) {
    skeletonsHtml += `
      <div class="skeleton-card">
        <div class="skeleton-poster skeleton-pulse"></div>
        <div class="skeleton-text skeleton-pulse"></div>
        <div class="skeleton-text short skeleton-pulse"></div>
      </div>
    `;
  }
  
  rowWrapper.innerHTML = `
    <div class="row-title-container">
      <h2 class="row-title">${title}</h2>
    </div>
    <div class="carousel-viewport" style="overflow: hidden;">
      ${skeletonsHtml}
    </div>
  `;
  
  return rowWrapper;
}
