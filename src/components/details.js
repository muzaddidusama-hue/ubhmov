import { tmdb } from '../tmdb.js';
import { escapeHTML, sanitizeUrl } from '../utils/security.js';

/**
 * Populates the details modal content.
 * @param {Object} item - Detailed TMDB movie or series object (with append_to_response credits & videos)
 * @param {string} type - 'movie' or 'tv'
 * @param {boolean} isBookmarked - Library state
 * @param {Function} onPlay - Watch stream callback
 * @param {Function} onBookmarkToggle - Library save callback
 * @param {Function} onTrailerClick - View YouTube trailer callback
 */
export function populateDetailsModal(item, type, isBookmarked, onPlay, onBookmarkToggle, onTrailerClick) {
  const contentContainer = document.getElementById('modal-content-dynamic');
  if (!contentContainer) return;
  
  const rawTitle = item.title || item.name || 'Untitled';
  const title = escapeHTML(rawTitle);
  const imdbId = item.imdb_id || (typeof item.id === 'string' && item.id.startsWith('tt') ? item.id : '');
  const stremioPosterFallback = imdbId ? `https://images.metahub.space/poster/medium/${imdbId}/img` : '';
  const stremioBackdropFallback = imdbId ? `https://images.metahub.space/background/medium/${imdbId}/img` : '';

  const rawBackdrop = item.backdrop || (item.backdrop_path ? (item.backdrop_path.startsWith('http') ? item.backdrop_path : tmdb.getImageUrl(item.backdrop_path, 'original')) : null) || stremioBackdropFallback;
  const backdropUrl = sanitizeUrl(rawBackdrop, '');
  const rawPoster = item.poster || item.posterUrl || (item.poster_path ? (item.poster_path.startsWith('http') ? item.poster_path : tmdb.getImageUrl(item.poster_path, 'w342')) : null) || stremioPosterFallback || 'https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster';
  const posterUrl = sanitizeUrl(rawPoster, 'https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster');
  const rating = escapeHTML(item.vote_average ? item.vote_average.toFixed(1) : 'N/A');
  const releaseYear = escapeHTML((item.release_date || item.first_air_date || '').split('-')[0] || 'N/A');
  const runtimeText = escapeHTML(type === 'movie' 
    ? (item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : 'N/A')
    : (item.number_of_seasons ? `${item.number_of_seasons} Season${item.number_of_seasons > 1 ? 's' : ''}` : 'N/A'));
  
  const genresList = (item.genres || []).map(g => `<span class="genre-chip" style="pointer-events:none;">${escapeHTML(g.name)}</span>`).join('');
  const overview = escapeHTML(item.overview || 'No overview available for this title.');
  
  // Cast lists
  const cast = (item.credits?.cast || []).slice(0, 8);
  const castHtml = cast.map(c => {
    const rawAvatar = c.profile_path ? tmdb.getImageUrl(c.profile_path, 'w185') : 'https://placehold.co/100x100/1e293b/ffffff?text=' + encodeURIComponent(c.name ? c.name.charAt(0) : '?');
    const avatarUrl = sanitizeUrl(rawAvatar, '');
    const castName = escapeHTML(c.name || 'Unknown');
    const castChar = escapeHTML(c.character || '');
    return `
      <div class="cast-chip">
        <img src="${avatarUrl}" class="cast-avatar" alt="${castName}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='https://placehold.co/100x100/1e293b/ffffff?text=?';">
        <div class="cast-name">${castName}</div>
        <div class="cast-character">${castChar}</div>
      </div>
    `;
  }).join('');

  // Right Side Info Elements
  const status = escapeHTML(item.status || 'Unknown');
  const releaseDateText = escapeHTML(item.release_date || item.first_air_date || 'N/A');
  const networks = escapeHTML((item.networks || []).slice(0, 2).map(n => n.name).join(', ') || '');
  const genresShort = escapeHTML((item.genres || []).slice(0, 3).map(g => g.name).join(', ') || 'N/A');
  const budgetFormatted = escapeHTML(item.budget ? `$${item.budget.toLocaleString()}` : '');
  const revenueFormatted = escapeHTML(item.revenue ? `$${item.revenue.toLocaleString()}` : '');
  const popularityFormatted = escapeHTML(item.popularity ? item.popularity.toFixed(0) : 'N/A');
  const originalLanguage = escapeHTML((item.original_language || 'en').toUpperCase());
  
  // Find trailer
  const trailerVideo = (item.videos?.results || []).find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  const hasTrailer = !!trailerVideo;
  
  // Format bookmark icon
  const bookmarkIcon = isBookmarked 
    ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`
    : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  
  contentContainer.innerHTML = `
    <!-- Top banner background -->
    <div class="modal-hero-section">
      <div class="modal-hero-bg" style="background-image: url('${backdropUrl}');"></div>
      <div class="modal-hero-overlay"></div>
      <div class="modal-hero-content">
        <div class="modal-poster">
          <img src="${posterUrl}" alt="${title}" onerror="if (this.dataset.triedMetahub !== '1' && '${imdbId}') { this.dataset.triedMetahub = '1'; this.src='https://images.metahub.space/poster/medium/${imdbId}/img'; } else { this.onerror=null; this.src='https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster'; }">
        </div>
        <div class="modal-header-meta">
          <h2 class="modal-title">${title}</h2>
          <div class="modal-tags">
            <span class="meta-rating" style="color: #ffb800; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              ${rating}
            </span>
            <span class="meta-divider">•</span>
            <span>${releaseYear}</span>
            <span class="meta-divider">•</span>
            <span>${runtimeText}</span>
            <span class="meta-divider">•</span>
            <span style="text-transform: uppercase;">${originalLanguage}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Body Details -->
    <div class="modal-body-section">
      <div class="modal-body-left">
        <!-- Main Actions Row inside details -->
        <div class="hero-actions-row" style="margin-bottom: 0.5rem;">
          <button id="modal-play-btn" class="primary-btn accent-glow-btn" style="padding: 0.8rem 2.2rem;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Play Stream
          </button>
          
          <button id="modal-bookmark-btn" class="icon-only-btn" title="Add to Library">
            ${bookmarkIcon}
          </button>

          ${hasTrailer ? `
            <button id="modal-trailer-btn" class="secondary-btn">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>
              Watch Trailer
            </button>
          ` : ''}
        </div>

        <p class="modal-overview">${overview}</p>
        
        <div class="modal-cast-section">
          <h4>Principal Cast</h4>
          <div class="cast-row">
            ${castHtml || '<p style="color:var(--text-muted); font-size:0.9rem;">Cast information not available.</p>'}
          </div>
        </div>
      </div>

      <div class="modal-body-right">
        <div>
          <h4>Information</h4>
          <div class="meta-details-list">
            <div class="meta-detail-item">
              <span class="meta-detail-label">Status</span>
              <span class="meta-detail-val">${status}</span>
            </div>
            <div class="meta-detail-item">
              <span class="meta-detail-label">Release Date</span>
              <span class="meta-detail-val">${releaseDateText}</span>
            </div>
            ${type === 'tv' && networks ? `
              <div class="meta-detail-item">
                <span class="meta-detail-label">Network</span>
                <span class="meta-detail-val">${networks}</span>
              </div>
            ` : ''}
            <div class="meta-detail-item">
              <span class="meta-detail-label">Genres</span>
              <span class="meta-detail-val">${genresShort}</span>
            </div>
            ${type === 'movie' && budgetFormatted ? `
              <div class="meta-detail-item">
                <span class="meta-detail-label">Budget</span>
                <span class="meta-detail-val">${budgetFormatted}</span>
              </div>
            ` : ''}
            ${type === 'movie' && revenueFormatted ? `
              <div class="meta-detail-item">
                <span class="meta-detail-label">Revenue</span>
                <span class="meta-detail-val">${revenueFormatted}</span>
              </div>
            ` : ''}
            <div class="meta-detail-item">
              <span class="meta-detail-label">Popularity</span>
              <span class="meta-detail-val">${popularityFormatted}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach Event Listeners
  const playBtn = document.getElementById('modal-play-btn');
  const bookmarkBtn = document.getElementById('modal-bookmark-btn');
  const trailerBtn = document.getElementById('modal-trailer-btn');

  playBtn.addEventListener('click', () => {
    onPlay(item, type);
  });

  bookmarkBtn.addEventListener('click', () => {
    const active = onBookmarkToggle(item, type);
    // Update button styling interactively
    bookmarkBtn.innerHTML = active 
      ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`
      : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
  });

  if (trailerBtn && trailerVideo) {
    trailerBtn.addEventListener('click', () => {
      onTrailerClick(trailerVideo.key);
    });
  }
}
