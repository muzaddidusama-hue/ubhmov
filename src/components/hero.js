import { tmdb } from '../tmdb.js';
import { escapeHTML, sanitizeUrl } from '../utils/security.js';

/**
 * Creates an interactive multi-slide Hero Spotlight carousel.
 * @param {Array} items - List of TMDB movie/tv items to slide (e.g., top 5)
 * @param {Function} onPlay - Play callback function
 * @param {Function} onInfo - More Info callback function
 * @returns {HTMLElement} - The fully interactive hero slider DOM element
 */
export function createHeroSliderComponent(items, onPlay, onInfo) {
  const container = document.createElement('div');
  container.className = 'hero-spotlight';
  
  if (!items || items.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);">No featured content available.</div>';
    return container;
  }
  
  // Limit to maximum of 5 items for premium slide focus
  const slidesData = items.slice(0, 5);
  let activeIndex = 0;
  let autoplayTimer = null;
  
  // Build slide HTML strings
  let slidesHtml = '';
  slidesData.forEach((item, index) => {
    const rawTitle = item.title || item.name || 'Featured Title';
    const title = escapeHTML(rawTitle);
    const rawBackdropUrl = tmdb.getImageUrl(item.backdrop_path, 'original');
    const backdropUrl = sanitizeUrl(rawBackdropUrl, '');
    const rating = escapeHTML(item.vote_average ? (typeof item.vote_average === 'number' ? item.vote_average.toFixed(1) : String(item.vote_average)) : 'N/A');
    const releaseYear = escapeHTML((item.release_date || item.first_air_date || '').split('-')[0] || 'N/A');
    const overview = escapeHTML(item.overview || 'No description available.');
    const mediaType = (item.media_type || (item.first_air_date ? 'tv' : 'movie')) === 'tv' ? 'tv' : 'movie';
    const lang = escapeHTML((item.original_language || 'en').toUpperCase());
    const tag = mediaType === 'tv' ? 'TV Series' : 'Blockbuster';
    
    slidesHtml += `
      <div class="hero-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
        <div class="hero-backdrop" style="background-image: url('${backdropUrl}');"></div>
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <span class="hero-tag">${tag}</span>
          <h1 class="hero-title">${title}</h1>
          <div class="hero-meta">
            <span class="meta-rating">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
              ${rating}
            </span>
            <span class="meta-year">${releaseYear}</span>
            <span class="meta-lang">${lang}</span>
          </div>
          <p class="hero-overview">${overview}</p>
          <div class="hero-actions-row">
            <button class="primary-btn accent-glow-btn play-slide-btn" data-id="${item.id}" data-type="${mediaType}">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Watch Now
            </button>
            <button class="secondary-btn info-slide-btn" data-id="${item.id}" data-type="${mediaType}">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              More Info
            </button>
          </div>
        </div>
      </div>
    `;
  });
  
  // Build navigation indicators and dots
  let dotsHtml = '';
  slidesData.forEach((_, index) => {
    dotsHtml += `<div class="hero-dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`;
  });
  
  container.innerHTML = `
    ${slidesHtml}
    
    <!-- Left & Right Arrow Controls -->
    <button class="hero-slide-prev-btn" title="Previous Slide">
      <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <button class="hero-slide-next-btn" title="Next Slide">
      <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
    
    <!-- Dots indicator -->
    <div class="hero-dots-container">
      ${dotsHtml}
    </div>
  `;
  
  const slides = container.querySelectorAll('.hero-slide');
  const dots = container.querySelectorAll('.hero-dot');
  
  // Transition controller
  const showSlide = (nextIndex) => {
    slides[activeIndex].classList.remove('active');
    dots[activeIndex].classList.remove('active');
    
    activeIndex = (nextIndex + slidesData.length) % slidesData.length;
    
    slides[activeIndex].classList.add('active');
    dots[activeIndex].classList.add('active');
  };
  
  // Autoplay control loops (6 seconds intervals)
  const startAutoplay = () => {
    stopAutoplay();
    autoplayTimer = setInterval(() => {
      showSlide(activeIndex + 1);
    }, 6000);
  };
  
  const stopAutoplay = () => {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  };
  
  // Event: Side arrows clicks
  container.querySelector('.hero-slide-prev-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showSlide(activeIndex - 1);
    startAutoplay(); // Reset timer
  });
  
  container.querySelector('.hero-slide-next-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showSlide(activeIndex + 1);
    startAutoplay(); // Reset timer
  });
  
  // Event: Dot clicks
  dots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetIndex = parseInt(dot.dataset.index);
      showSlide(targetIndex);
      startAutoplay(); // Reset timer
    });
  });
  
  // Events: Pause/Resume on Hover
  container.addEventListener('mouseenter', stopAutoplay);
  container.addEventListener('mouseleave', startAutoplay);
  
  // Events: Play & Info Button clicks
  container.querySelectorAll('.play-slide-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onPlay(parseInt(btn.dataset.id), btn.dataset.type);
    });
  });
  
  container.querySelectorAll('.info-slide-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onInfo(parseInt(btn.dataset.id), btn.dataset.type);
    });
  });
  
  // Initialize timer
  startAutoplay();
  
  return container;
}
