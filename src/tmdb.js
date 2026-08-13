import { CONFIG } from '../config.js';

// Resolve TMDB key/token prioritizing:
// 1. localStorage (runtime custom setting)
// 2. CONFIG file values (static environment build setting)
export function getApiKey() {
  const localKey = localStorage.getItem('tmdb_api_key');
  if (localKey && localKey !== 'YOUR_TMDB_API_KEY_HERE' && localKey.trim() !== '') {
    return localKey.trim();
  }
  
  const sharedKey = localStorage.getItem('shared_tmdb_api_key');
  if (sharedKey && sharedKey !== 'YOUR_TMDB_API_KEY_HERE' && sharedKey.trim() !== '') {
    return sharedKey.trim();
  }
  
  return CONFIG.TMDB_API_KEY !== 'YOUR_TMDB_API_KEY_HERE' ? CONFIG.TMDB_API_KEY : '';
}

// Check if TMDB API is active and key is supplied
export function isApiConfigured() {
  const key = getApiKey();
  return key && key.length > 5; // Basic sanity check
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// In-Memory API Cache to eliminate redundant network roundtrips and enable butter-smooth navigation
const tmdbCache = new Map();
const pendingRequests = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Clear cached TMDB responses (useful when switching API keys)
 */
export function clearTmdbCache() {
  tmdbCache.clear();
  pendingRequests.clear();
}

// Fetch helper with in-memory caching, request deduplication, and Bearer / v3 API key support
async function tmdbFetch(endpoint, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('TMDB API Key/Token is not configured.');
  }

  // Construct cache key based on endpoint and sorted query params
  const sortedParamKeys = Object.keys(params).sort();
  const cacheParamStr = sortedParamKeys.map(k => `${k}=${params[k]}`).join('&');
  const cacheKey = `${endpoint}?${cacheParamStr}`;

  // 1. Check in-memory cache
  const cached = tmdbCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  // 2. Request deduplication: reuse in-flight promises for identical endpoints
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  // Construct URL
  let url = `${TMDB_BASE_URL}${endpoint}`;
  const queryParams = new URLSearchParams(params);

  // If the key is a v4 Read Access Token (usually very long, starts with eyJ...)
  // We append it as Authorization Header. Otherwise, we add it as standard v3 api_key query param.
  const headers = {
    'Content-Type': 'application/json;charset=utf-8'
  };

  if (apiKey.startsWith('eyJ')) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    queryParams.append('api_key', apiKey);
  }

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  
  const fetchPromise = (async () => {
    try {
      const response = await fetch(`${url}${queryString}`, { headers });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.status_message || `TMDB API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store in memory cache
      tmdbCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      // Keep cache size bounded (max 200 items)
      if (tmdbCache.size > 200) {
        const oldestKey = tmdbCache.keys().next().value;
        tmdbCache.delete(oldestKey);
      }

      return data;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

// TMDB Client Object
export const tmdb = {
  // Get trending movies (Daily)
  getTrendingMovies: async () => {
    return tmdbFetch('/trending/movie/day', { language: 'en-US' });
  },

  // Get popular TV Series
  getPopularSeries: async () => {
    return tmdbFetch('/tv/popular', { language: 'en-US', page: 1 });
  },

  // Get top rated movies
  getTopRatedMovies: async () => {
    return tmdbFetch('/movie/top_rated', { language: 'en-US', page: 1 });
  },

  // Get now playing movies
  getNowPlaying: async () => {
    return tmdbFetch('/movie/now_playing', { language: 'en-US', page: 1 });
  },

  // Search Multi (movies, tv, person)
  searchMulti: async (query, page = 1) => {
    return tmdbFetch('/search/multi', { query, page, language: 'en-US', include_adult: false });
  },

  // Discover movies by filter
  discoverMovies: async (page = 1, genreId = '', originalLanguage = '') => {
    const params = { page, language: 'en-US', sort_by: 'popularity.desc' };
    if (genreId === '18plus') {
      params.include_adult = true;
      params.with_keywords = '190370|207268|208879|12181|14710|15540';
    } else if (genreId) {
      params.with_genres = genreId;
    }
    if (originalLanguage) {
      params.with_original_language = originalLanguage;
    }
    return tmdbFetch('/discover/movie', params);
  },

  // Discover TV shows by filter
  discoverSeries: async (page = 1, genreId = '', originalLanguage = '') => {
    const params = { page, language: 'en-US', sort_by: 'popularity.desc' };
    if (genreId === '18plus') {
      params.include_adult = true;
      params.with_keywords = '190370|207268|208879|12181|14710|15540';
    } else if (genreId) {
      params.with_genres = genreId;
    }
    if (originalLanguage) {
      params.with_original_language = originalLanguage;
    }
    return tmdbFetch('/discover/tv', params);
  },

  // Get Details (Movie or TV)
  getDetails: async (id, type) => {
    // If ID is an IMDB ID (starts with tt...), resolve via /find endpoint first
    if (typeof id === 'string' && id.startsWith('tt')) {
      try {
        const findRes = await tmdbFetch(`/find/${id}`, { external_source: 'imdb_id', language: 'en-US' });
        const match = (findRes.movie_results && findRes.movie_results[0]) ||
                      (findRes.tv_results && findRes.tv_results[0]);
        if (match) {
          const resolvedType = match.title ? 'movie' : 'tv';
          return tmdbFetch(`/${resolvedType}/${match.id}`, { append_to_response: 'credits,videos', language: 'en-US' });
        }
      } catch (e) {
        console.warn('Could not resolve IMDB ID via TMDB find:', e);
      }
    }
    const endpoint = `/${type}/${id}`;
    // Append credits and videos (trailers) in one request
    return tmdbFetch(endpoint, { append_to_response: 'credits,videos', language: 'en-US' });
  },

  // Find by external ID (e.g. imdb_id)
  findFromExternalId: async (externalId, externalSource = 'imdb_id') => {
    return tmdbFetch(`/find/${externalId}`, { external_source: externalSource, language: 'en-US' });
  },

  // Get TV Season details (for episodes)
  getTVSeason: async (tvId, seasonNumber) => {
    return tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`, { language: 'en-US' });
  },

  // Get Genres (Movie and TV combined and deduplicated)
  getGenres: async () => {
    const movieGenres = await tmdbFetch('/genre/movie/list', { language: 'en-US' });
    const tvGenres = await tmdbFetch('/genre/tv/list', { language: 'en-US' });
    
    // Combine list and deduplicate
    const combined = [...movieGenres.genres];
    tvGenres.genres.forEach(tvGenre => {
      if (!combined.some(g => g.id === tvGenre.id)) {
        combined.push(tvGenre);
      }
    });
    
    return combined.sort((a, b) => a.name.localeCompare(b.name));
  },

  // Helper to build Image URLs
  getImageUrl: (path, size = 'w500') => {
    if (!path) return ''; // Return empty string for placeholders handling
    return `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}`;
  }
};
