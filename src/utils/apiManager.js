import { CONFIG } from '../../config.js';
import { escapeHTML, sanitizeUrl } from './security.js';

// Default built-in streaming server embed templates
export const DEFAULT_STREAM_SERVERS = [
  {
    id: 'multiembed',
    name: 'Server 1 (MultiEmbed - Fast & Clean)',
    movieUrl: 'https://multiembed.mov/?video_id={id}&tmdb=1',
    tvUrl: 'https://multiembed.mov/?video_id={id}&tmdb=1&s={season}&e={episode}',
    active: true,
    isDefault: true
  },
  {
    id: 'vidsrc_to',
    name: 'Server 2 (VidSrc.to)',
    movieUrl: 'https://vidsrc.to/embed/movie/{id}',
    tvUrl: 'https://vidsrc.to/embed/tv/{id}/{season}/{episode}',
    active: true,
    isDefault: true
  },
  {
    id: 'vidsrc_xyz',
    name: 'Server 3 (VidSrc.xyz)',
    movieUrl: 'https://vidsrc.xyz/embed/movie/{id}',
    tvUrl: 'https://vidsrc.xyz/embed/tv/{id}/{season}/{episode}',
    active: true,
    isDefault: true
  },
  {
    id: 'vidsrc_me',
    name: 'Server 4 (VidSrc.me)',
    movieUrl: 'https://vidsrc.me/embed/movie/{id}',
    tvUrl: 'https://vidsrc.me/embed/tv/{id}/{season}/{episode}',
    active: true,
    isDefault: true
  },
  {
    id: 'embed_su',
    name: 'Server 5 (Embed.su - High Quality)',
    movieUrl: 'https://embed.su/embed/movie/{id}',
    tvUrl: 'https://embed.su/embed/tv/{id}/{season}/{episode}',
    active: true,
    isDefault: true
  },
  {
    id: 'hindi_api',
    name: 'Server 6 (MoviesAPI - Bollywood & BD)',
    movieUrl: 'https://moviesapi.club/movie/{id}',
    tvUrl: 'https://moviesapi.club/tv/{id}-{season}-{episode}',
    active: true,
    isDefault: true
  },
  {
    id: 'smashystream',
    name: 'Server 7 (SmashyStream)',
    movieUrl: 'https://player.smashy.stream/movie/{id}',
    tvUrl: 'https://player.smashy.stream/tv/{id}?s={season}&e={episode}',
    active: true,
    isDefault: false
  },
  {
    id: 'autoembed',
    name: 'Server 8 (AutoEmbed)',
    movieUrl: 'https://player.autoembed.cc/embed/movie/{id}',
    tvUrl: 'https://player.autoembed.cc/embed/tv/{id}/{season}/{episode}',
    active: true,
    isDefault: false
  },
  {
    id: '2embed',
    name: 'Server 9 (2Embed)',
    movieUrl: 'https://www.2embed.cc/embed/{id}',
    tvUrl: 'https://www.2embed.cc/embedtv/{id}&s={season}&e={episode}',
    active: true,
    isDefault: false
  }
];

// Default Stremio Addon manifest registries
export const DEFAULT_STREMIO_ADDONS = [
  {
    id: 'cinemeta',
    name: 'Cinemeta (Official Catalog)',
    description: 'Official Cinemeta metadata provider for movies & series IMDB mappings',
    manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    version: '3.0.12',
    resources: ['meta', 'catalog'],
    types: ['movie', 'series'],
    catalogs: [
      { type: 'movie', id: 'top', name: 'Top Movies' },
      { type: 'series', id: 'top', name: 'Top Series' }
    ],
    active: true,
    isOfficial: true
  },
  {
    id: 'cyberflix',
    name: 'CyberFlix Catalog',
    description: 'Direct feeds for Netflix, Apple TV+, Disney+, and HBO Max titles',
    manifestUrl: 'https://cyberflix.elfhosted.com/manifest.json',
    version: '1.4.2',
    resources: ['meta', 'catalog'],
    types: ['movie', 'series'],
    catalogs: [
      { type: 'movie', id: 'netflix', name: 'Netflix Movies' },
      { type: 'movie', id: 'apple', name: 'Apple TV+ Movies' },
      { type: 'series', id: 'netflix', name: 'Netflix Series' }
    ],
    active: true,
    isOfficial: false
  },
  {
    id: 'opensubtitles',
    name: 'OpenSubtitles v3',
    description: 'Official multi-language subtitle provider for Stremio',
    manifestUrl: 'https://opensubtitles-v3.strem.io/manifest.json',
    version: '1.0.0',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    catalogs: [],
    active: true,
    isOfficial: true
  }
];

/**
 * Get all configured streaming servers from LocalStorage or Defaults
 */
export function getStreamServers() {
  try {
    const custom = JSON.parse(localStorage.getItem('custom_stream_servers'));
    if (Array.isArray(custom) && custom.length > 0) {
      return custom;
    }
  } catch (e) {
    console.warn('Failed to parse custom_stream_servers:', e);
  }
  return DEFAULT_STREAM_SERVERS;
}

/**
 * Get only active streaming servers for the video player selector
 */
export function getActiveStreamServers() {
  const all = getStreamServers();
  return all.filter(s => s.active !== false);
}

/**
 * Save / Update a streaming server
 */
export function saveStreamServer(serverData) {
  const servers = getStreamServers();
  const index = servers.findIndex(s => s.id === serverData.id);

  if (index > -1) {
    servers[index] = { ...servers[index], ...serverData };
  } else {
    const newId = serverData.id || 'server_' + Date.now().toString(36);
    servers.push({
      id: newId,
      name: serverData.name || 'Custom Server',
      movieUrl: serverData.movieUrl,
      tvUrl: serverData.tvUrl,
      active: serverData.active !== false,
      isDefault: false
    });
  }

  localStorage.setItem('custom_stream_servers', JSON.stringify(servers));
  window.dispatchEvent(new CustomEvent('stream-servers-changed', { detail: servers }));
  return servers;
}

/**
 * Delete a streaming server by ID
 */
export function deleteStreamServer(serverId) {
  let servers = getStreamServers();
  servers = servers.filter(s => s.id !== serverId);
  localStorage.setItem('custom_stream_servers', JSON.stringify(servers));
  window.dispatchEvent(new CustomEvent('stream-servers-changed', { detail: servers }));
  return servers;
}

/**
 * Toggle streaming server active status
 */
export function toggleStreamServer(serverId, active) {
  const servers = getStreamServers();
  const server = servers.find(s => s.id === serverId);
  if (server) {
    server.active = active;
    localStorage.setItem('custom_stream_servers', JSON.stringify(servers));
    window.dispatchEvent(new CustomEvent('stream-servers-changed', { detail: servers }));
  }
  return servers;
}

/**
 * Reset streaming servers to default factory settings
 */
export function resetStreamServersToDefault() {
  localStorage.removeItem('custom_stream_servers');
  window.dispatchEvent(new CustomEvent('stream-servers-changed', { detail: DEFAULT_STREAM_SERVERS }));
  return DEFAULT_STREAM_SERVERS;
}

// ==========================================================================
// Stremio Addon Protocol & Manifest Manager
// ==========================================================================

/**
 * Get all installed Stremio addons
 */
export function getStremioAddons() {
  try {
    const addons = JSON.parse(localStorage.getItem('stremio_addons'));
    if (Array.isArray(addons) && addons.length > 0) {
      return addons;
    }
  } catch (e) {
    console.warn('Failed to parse stremio_addons:', e);
  }
  return DEFAULT_STREMIO_ADDONS;
}

/**
 * Normalize Stremio manifest URL (handles stremio:// scheme)
 */
export function normalizeStremioUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  if (url.startsWith('stremio://')) {
    url = url.replace('stremio://', 'https://');
  }
  if (!url.endsWith('/manifest.json') && !url.endsWith('.json')) {
    url = url.replace(/\/+$/, '') + '/manifest.json';
  }
  return url;
}

/**
 * Add and validate a new Stremio addon via its manifest URL
 */
export async function installStremioAddon(manifestInputUrl) {
  const manifestUrl = normalizeStremioUrl(manifestInputUrl);
  if (!manifestUrl.startsWith('http://') && !manifestUrl.startsWith('https://')) {
    throw new Error('Invalid URL. Manifest URL must start with https:// or stremio://');
  }

  // Fetch and validate manifest
  const response = await fetch(manifestUrl, { headers: { 'Accept': 'application/json' } });
  if (!response.ok) {
    throw new Error(`Failed to reach Stremio manifest: HTTP ${response.status}`);
  }

  const manifest = await response.json();
  if (!manifest || !manifest.id || !manifest.name) {
    throw new Error('Invalid Stremio manifest. Missing required id or name field.');
  }

  const addons = getStremioAddons();
  const existingIdx = addons.findIndex(a => a.id === manifest.id);

  const addonEntry = {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description || 'Custom Stremio Addon',
    manifestUrl: manifestUrl,
    version: manifest.version || '1.0.0',
    resources: manifest.resources || ['stream'],
    types: manifest.types || ['movie', 'series'],
    catalogs: manifest.catalogs || [],
    background: manifest.background || '',
    logo: manifest.logo || '',
    active: true,
    isOfficial: false,
    installedAt: Date.now()
  };

  if (existingIdx > -1) {
    addons[existingIdx] = addonEntry;
  } else {
    addons.push(addonEntry);
  }

  localStorage.setItem('stremio_addons', JSON.stringify(addons));
  window.dispatchEvent(new CustomEvent('stremio-addons-changed', { detail: addons }));
  return addonEntry;
}

/**
 * Remove an installed Stremio addon
 */
export function removeStremioAddon(addonId) {
  let addons = getStremioAddons();
  addons = addons.filter(a => a.id !== addonId);
  localStorage.setItem('stremio_addons', JSON.stringify(addons));
  window.dispatchEvent(new CustomEvent('stremio-addons-changed', { detail: addons }));
  return addons;
}

/**
 * Toggle Stremio addon active status
 */
export function toggleStremioAddon(addonId, active) {
  const addons = getStremioAddons();
  const addon = addons.find(a => a.id === addonId);
  if (addon) {
    addon.active = active;
    localStorage.setItem('stremio_addons', JSON.stringify(addons));
    window.dispatchEvent(new CustomEvent('stremio-addons-changed', { detail: addons }));
  }
  return addons;
}

/**
 * Query all active Stremio stream addons for a specific movie or episode
 * @param {string} imdbId - e.g. "tt0137523"
 * @param {string} type - "movie" or "series"
 * @param {number} season - e.g. 1
 * @param {number} episode - e.g. 1
 * @returns {Promise<Array>} List of stream items
 */
export async function fetchStremioStreams(imdbId, type = 'movie', season = 1, episode = 1) {
  if (!imdbId) return [];
  
  const activeAddons = getStremioAddons().filter(a => a.active !== false);
  const streamAddons = activeAddons.filter(a => {
    const res = Array.isArray(a.resources) ? a.resources : [];
    return res.includes('stream') || res.some(r => typeof r === 'object' && r.name === 'stream');
  });

  if (streamAddons.length === 0) return [];

  const streamType = type === 'tv' ? 'series' : 'movie';
  const queryId = streamType === 'series' ? `${imdbId}:${season}:${episode}` : imdbId;

  const results = [];

  for (const addon of streamAddons) {
    try {
      const baseUrl = addon.manifestUrl.replace(/\/manifest\.json$/i, '');
      const endpoint = `${baseUrl}/stream/${streamType}/${encodeURIComponent(queryId)}.json`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.streams)) {
          data.streams.forEach((s, idx) => {
            results.push({
              addonId: addon.id,
              addonName: addon.name,
              name: s.name || addon.name,
              title: s.title || s.name || `Stream ${idx + 1}`,
              url: s.url || '',
              externalUrl: s.externalUrl || '',
              infoHash: s.infoHash || '',
              fileIdx: s.fileIdx,
              behaviorHints: s.behaviorHints || {}
            });
          });
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch streams from Stremio addon ${addon.name}:`, err);
    }
  }

  return results;
}

/**
 * Community Recommended Stremio Addons Presets for 1-Click Installation
 */
export const POPULAR_STREMIO_ADDONS_PRESETS = [
  {
    id: 'torrentio',
    name: 'Torrentio (Torrents & Debrid)',
    description: 'Scrapes torrent streams from multiple providers with support for RealDebrid, AllDebrid, Premiumize, and direct P2P.',
    manifestUrl: 'https://torrentio.strem.fun/manifest.json',
    version: '1.0.13',
    tags: ['4K Streams', 'Debrid Support', 'Auto-Sync'],
    icon: '⚡'
  },
  {
    id: 'cyberflix',
    name: 'CyberFlix Catalog',
    description: 'Brings curated catalogs from Netflix, Apple TV+, HBO Max, Disney+, Hulu, and Paramount+ directly into your library.',
    manifestUrl: 'https://cyberflix.elfhosted.com/c/catalogs/manifest.json',
    version: '1.4.2',
    tags: ['OTT Platforms', 'Catalog', 'Popular'],
    icon: '🎬'
  },
  {
    id: 'mediafusion',
    name: 'MediaFusion Multi-Engine',
    description: 'Comprehensive scraper covering live TV streams, sports events, international film releases, and series.',
    manifestUrl: 'https://mediafusion.elfhosted.com/manifest.json',
    version: '3.9.1',
    tags: ['Live Events', 'Scraper', 'Multi-Language'],
    icon: '🛰️'
  },
  {
    id: 'comet',
    name: 'Comet Fast Scraper',
    description: 'High-speed torrent and Debrid indexer with sub-second response times and multi-resolution stream filtering.',
    manifestUrl: 'https://comet.elfhosted.com/manifest.json',
    version: '1.2.0',
    tags: ['Ultra-Fast', 'Debrid', 'HDR/DV'],
    icon: '☄️'
  },
  {
    id: 'opensubtitles',
    name: 'OpenSubtitles v3 (Official)',
    description: 'Official multi-language subtitle provider for Stremio with automated synchronization and language filtering.',
    manifestUrl: 'https://opensubtitles-v3.strem.io/manifest.json',
    version: '1.0.0',
    tags: ['Subtitles', 'Multi-Language', 'Official'],
    icon: '💬'
  },
  {
    id: 'cinemeta',
    name: 'Cinemeta Catalog (Official)',
    description: 'Official Cinemeta metadata provider supplying accurate IMDB ratings, posters, cast information, and episode listings.',
    manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    version: '3.0.12',
    tags: ['Metadata', 'IMDB Mappings', 'Official'],
    icon: '🍿'
  },
  {
    id: 'anime-kitsu',
    name: 'Anime Kitsu Catalog',
    description: 'Complete Anime series, movies, and OVAs catalog sourced from Kitsu.io with Japanese audio and subtitle feeds.',
    manifestUrl: 'https://anime-kitsu.strem.fun/manifest.json',
    version: '1.0.4',
    tags: ['Anime', 'Kitsu.io', 'Japanese/Sub'],
    icon: '🎌'
  }
];

/**
 * Probes the network latency (RTT) of an endpoint in milliseconds
 * @param {string} url - Manifest or origin URL to test
 * @returns {Promise<{status: 'ok'|'error', ms: number, error?: string}>}
 */
export async function probeEndpointLatency(url) {
  if (!url) return { status: 'error', ms: 0, error: 'Empty URL' };
  const startTime = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500); // 3.5s timeout
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      signal: controller.signal,
      headers: { 'Accept': 'application/json, text/html, */*' }
    });
    clearTimeout(timer);
    const ms = Math.round(performance.now() - startTime);
    if (res.ok || res.status === 304 || res.status === 200) {
      return { status: 'ok', ms };
    }
    return { status: 'ok', ms, error: `HTTP ${res.status}` };
  } catch (err) {
    const ms = Math.round(performance.now() - startTime);
    if (err.name === 'AbortError') {
      return { status: 'error', ms, error: 'Timeout (>3.5s)' };
    }
    return { status: 'error', ms, error: err.message || 'CORS/Blocked' };
  }
}

/**
 * Catalog Channels configuration for Stremio video stream feeds
 */
export const STREMIO_CATALOG_CHANNELS = [
  {
    id: 'movie_top',
    name: 'Top Stremio Movies',
    type: 'movie',
    icon: '🍿',
    endpoint: 'https://v3-cinemeta.strem.io/catalog/movie/top.json',
    description: 'Trending and top-rated movies indexed across Stremio manifests'
  },
  {
    id: 'series_top',
    name: 'Popular Series',
    type: 'tv',
    icon: '📺',
    endpoint: 'https://v3-cinemeta.strem.io/catalog/series/top.json',
    description: 'Top-rated TV series with multi-season stream options'
  },
  {
    id: 'cyberflix_netflix',
    name: 'Netflix Feeds',
    type: 'movie',
    icon: '🎬',
    endpoint: 'https://cyberflix.elfhosted.com/c/catalogs/catalog/movie/netflix.json',
    description: 'Curated Netflix library streams fetched via CyberFlix'
  },
  {
    id: 'cyberflix_apple',
    name: 'Apple TV+ Originals',
    type: 'movie',
    icon: '🍏',
    endpoint: 'https://cyberflix.elfhosted.com/c/catalogs/catalog/movie/apple.json',
    description: 'Apple TV+ exclusive cinema streams'
  }
];

/**
 * Fetch video meta items from a Stremio catalog channel
 * @param {string} channelId - e.g. 'movie_top', 'series_top', 'cyberflix_netflix'
 * @returns {Promise<Array>} List of standardized movie/series items
 */
/**
 * Resolves all active catalog feeds from all running/active Stremio add-ons
 * @returns {Array<Object>} List of feed descriptors
 */
export function getActiveAddonCatalogFeeds() {
  const activeAddons = getStremioAddons().filter(a => a.active !== false);
  const feeds = [];

  activeAddons.forEach(addon => {
    const baseUrl = addon.manifestUrl.replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
    
    // Check if addon has explicit catalogs array
    if (Array.isArray(addon.catalogs) && addon.catalogs.length > 0) {
      addon.catalogs.forEach(cat => {
        const catType = cat.type || 'movie';
        const catId = cat.id || 'top';
        const icon = catType === 'movie' ? '🍿' : (catType === 'series' || catType === 'tv' ? '📺' : '🎬');
        feeds.push({
          feedId: `${addon.id}_${catType}_${catId}`,
          addonId: addon.id,
          addonName: addon.name,
          catalogType: catType === 'series' ? 'tv' : catType,
          catalogId: catId,
          catalogName: cat.name ? `${addon.name} - ${cat.name}` : `${addon.name} ${catType}`,
          endpoint: `${baseUrl}/catalog/${catType}/${catId}.json`,
          icon: icon
        });
      });
    } else if (addon.id === 'cinemeta' || (addon.resources && (addon.resources.includes('meta') || addon.resources.includes('catalog')))) {
      // Default Cinemeta/meta catalogs fallback
      feeds.push({
        feedId: `${addon.id}_movie_top`,
        addonId: addon.id,
        addonName: addon.name,
        catalogType: 'movie',
        catalogId: 'top',
        catalogName: `${addon.name} - Top Movies`,
        endpoint: `${baseUrl}/catalog/movie/top.json`,
        icon: '🍿'
      });
      feeds.push({
        feedId: `${addon.id}_series_top`,
        addonId: addon.id,
        addonName: addon.name,
        catalogType: 'tv',
        catalogId: 'top',
        catalogName: `${addon.name} - Popular TV Series`,
        endpoint: `${baseUrl}/catalog/series/top.json`,
        icon: '📺'
      });
    }
  });

  return feeds;
}

/**
 * Fetch video items from a specific Stremio catalog feed
 * @param {Object} feed - Feed descriptor
 * @returns {Promise<Array>} List of standardized movie/series items
 */
export async function fetchStremioFeedItems(feed) {
  if (!feed || !feed.endpoint) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout
    const res = await fetch(feed.endpoint, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const metas = data && Array.isArray(data.metas) ? data.metas : [];

    return metas.map(meta => {
      const type = (meta.type === 'series' || meta.type === 'tv') ? 'tv' : 'movie';
      const poster = meta.poster || 'https://placehold.co/342x513/0c0e15/ffffff?text=No+Poster';
      return {
        id: meta.id,
        imdb_id: meta.id,
        title: meta.name || 'Untitled',
        name: meta.name || 'Untitled',
        type: type,
        media_type: type,
        poster: poster,
        poster_path: null,
        posterUrl: poster,
        backdrop_path: meta.background || null,
        vote_average: meta.imdbRating ? parseFloat(meta.imdbRating) : 7.8,
        release_date: meta.releaseInfo || (meta.year ? String(meta.year) : ''),
        first_air_date: meta.releaseInfo || (meta.year ? String(meta.year) : ''),
        overview: meta.description || 'Streamable via Stremio add-on engines.',
        genres: Array.isArray(meta.genres) ? meta.genres : [],
        isStremioStream: true,
        sourceEngine: feed.addonName || 'Stremio Add-on'
      };
    });
  } catch (err) {
    console.warn(`Failed to fetch Stremio feed for ${feed.catalogName}:`, err);
    return [];
  }
}

/**
 * Diagnostic Runner: Checks all active & installed Stremio add-ons for:
 * 1. Manifest connectivity & response latency (RTT)
 * 2. Ability to fetch movies/videos from catalogs or meta
 * 3. Streaming and subtitle scraper capabilities
 * @returns {Promise<Object>} Diagnostic Results & Report
 */
export async function runAddonHealthAndCapabilityCheck() {
  const addons = getStremioAddons();
  const startTime = performance.now();

  const checkPromises = addons.map(async (addon) => {
    const probeStart = performance.now();
    const result = {
      id: addon.id,
      name: addon.name,
      manifestUrl: addon.manifestUrl,
      version: addon.version || '1.0.0',
      active: addon.active !== false,
      isReachable: false,
      latencyMs: 0,
      canFetchVideos: false,
      videoSampleCount: 0,
      sampleTitles: [],
      canStream: false,
      canSubtitles: false,
      detectedCatalogs: [],
      error: null
    };

    try {
      // 1. Probe Manifest
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(addon.manifestUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeout);

      result.latencyMs = Math.round(performance.now() - probeStart);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const manifest = await res.json();
      result.isReachable = true;

      // Extract capabilities from manifest
      const resources = manifest.resources || addon.resources || [];
      const resourceNames = resources.map(r => typeof r === 'string' ? r : (r.name || ''));
      result.canStream = resourceNames.includes('stream');
      result.canSubtitles = resourceNames.includes('subtitles');

      // Check catalog capabilities
      const baseUrl = addon.manifestUrl.replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
      const catalogs = manifest.catalogs || addon.catalogs || [];
      result.detectedCatalogs = catalogs;

      // 2. Video Fetch Test: probe catalog if available or fallback
      let testEndpoint = '';
      if (catalogs.length > 0) {
        const firstCat = catalogs[0];
        testEndpoint = `${baseUrl}/catalog/${firstCat.type}/${firstCat.id}.json`;
      } else if (resourceNames.includes('meta') || resourceNames.includes('catalog') || addon.id === 'cinemeta') {
        testEndpoint = `${baseUrl}/catalog/movie/top.json`;
      }

      if (testEndpoint) {
        try {
          const catController = new AbortController();
          const catTimeout = setTimeout(() => catController.abort(), 4500);
          const catRes = await fetch(testEndpoint, {
            signal: catController.signal,
            headers: { 'Accept': 'application/json' }
          });
          clearTimeout(catTimeout);

          if (catRes.ok) {
            const catData = await catRes.json();
            if (catData && Array.isArray(catData.metas) && catData.metas.length > 0) {
              result.canFetchVideos = true;
              result.videoSampleCount = catData.metas.length;
              result.sampleTitles = catData.metas.slice(0, 3).map(m => m.name || m.title || 'Untitled');
            }
          }
        } catch (catErr) {
          console.warn(`Catalog fetch test note for ${addon.name}:`, catErr.message);
        }
      }

    } catch (err) {
      result.latencyMs = Math.round(performance.now() - probeStart);
      result.error = err.message || 'Connection failed';
    }

    return result;
  });

  const results = await Promise.all(checkPromises);
  const totalDurationMs = Math.round(performance.now() - startTime);

  const reachableCount = results.filter(r => r.isReachable).length;
  const videoFetchCount = results.filter(r => r.canFetchVideos).length;
  const streamCount = results.filter(r => r.canStream).length;

  return {
    totalChecked: addons.length,
    reachableCount,
    videoFetchCount,
    streamCount,
    totalDurationMs,
    results
  };
}


