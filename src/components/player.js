import { tmdb } from '../tmdb.js';
import { escapeHTML } from '../utils/security.js';
import { getActiveStreamServers, fetchStremioStreams } from '../utils/apiManager.js';
import { isProxyActive, setProxyState, proxifyUrl, getCurrentProxyNode } from '../utils/proxyManager.js';

/**
 * Initializes and manages the full-screen video player overlay.
 * Supports dynamic streaming servers, TV series season/episode selections,
 * Stremio add-on stream discovery, Next Episode overlay controls, and progress tracking.
 * @param {Object} item - TMDB details object for the title
 * @param {string} type - 'movie' or 'tv'
 * @param {string} movieUrlTemplate - String template e.g., 'https://vidsrc.to/embed/movie/{id}'
 * @param {string} tvUrlTemplate - String template e.g., 'https://vidsrc.to/embed/tv/{id}/{season}/{episode}'
 * @param {Object} options - { season: Number, episode: Number, onProgressSave: Function }
 */
export async function openPlayerOverlay(item, type, movieUrlTemplate, tvUrlTemplate, options = {}) {
  const overlay = document.getElementById('player-overlay');
  const iframeRoot = document.getElementById('player-iframe-root');
  const playerTitle = document.getElementById('player-title');
  const playerSubtitle = document.getElementById('player-subtitle');
  const tvSelectors = document.getElementById('tv-player-selectors');
  
  const nextBtn = document.getElementById('player-next-episode-btn');
  
  if (!overlay || !iframeRoot) return;
  
  let currentSeason = options.season || 1;
  let currentEpisode = options.episode || 1;
  let startProgressSeconds = options.progressSeconds || 0;
  let episodes = [];
  let episodeOpenTime = Date.now();
  let nextEpisodeTimer = null;
  let stremioStreamsList = [];
  
  const onProgressSave = options.onProgressSave || (() => {});
  
  // Set Title Info safely
  playerTitle.textContent = item.title || item.name || 'Stream title';
  
  // Helper to load Iframe content
  const loadIframe = (url) => {
    iframeRoot.innerHTML = `
      <iframe src="${url}" 
        allowfullscreen 
        scrolling="no" 
        frameborder="0" 
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; clipboard-write">
      </iframe>
    `;
  };

  // Helper to load HTML5 direct video stream (e.g. from Stremio stream)
  const loadDirectVideo = (streamUrl) => {
    iframeRoot.innerHTML = `
      <video src="${streamUrl}" 
        controls 
        autoplay 
        playsinline 
        style="width:100%; height:100%; object-fit:contain; background:#000; border-radius:14px;">
        Your browser does not support HTML5 video streaming.
      </video>
    `;
  };
  
  // Helper to interpolate url placeholders
  const getStreamUrl = (template, id, imdbId = '', s = 1, e = 1) => {
    return template
      .replace(/\{id\}/g, id)
      .replace(/\{imdb\}/g, imdbId || id)
      .replace(/\{season\}/g, s)
      .replace(/\{episode\}/g, e);
  };

  // Populate Server Dropdown dynamically from active configured servers + Stremio streams
  const populateServerSelect = () => {
    const serverSelect = document.getElementById('player-server-select');
    if (!serverSelect) return;

    const activeServers = getActiveStreamServers();
    const savedServer = localStorage.getItem('selected_stream_server') || (activeServers[0]?.id || 'multiembed');

    serverSelect.innerHTML = '';

    // Standard Embed Servers group
    const embedGroup = document.createElement('optgroup');
    embedGroup.label = 'Web Embed Servers';

    activeServers.forEach(srv => {
      const opt = document.createElement('option');
      opt.value = srv.id;
      opt.textContent = srv.name;
      if (srv.id === savedServer) opt.selected = true;
      embedGroup.appendChild(opt);
    });
    serverSelect.appendChild(embedGroup);

    // Stremio Add-on Streams group (if available)
    if (stremioStreamsList.length > 0) {
      const stremioGroup = document.createElement('optgroup');
      stremioGroup.label = '⚡ Stremio Addon Streams';

      stremioStreamsList.forEach((st, idx) => {
        const opt = document.createElement('option');
        opt.value = `stremio_${idx}`;
        const torrentTag = st.isTorrent ? '🧲 ' : '▶ ';
        opt.textContent = `${torrentTag}[${(st.addonName || '').substring(0, 12)}] ${st.title || st.name}`;
        if (opt.value === savedServer) opt.selected = true;
        stremioGroup.appendChild(opt);
      });
      serverSelect.appendChild(stremioGroup);
    }
  };

  // Helper to refresh URL based on selected server
  const refreshPlayerUrl = () => {
    const serverSelect = document.getElementById('player-server-select');
    const activeServers = getActiveStreamServers();
    const fallbackId = activeServers[0]?.id || 'multiembed';
    const selectedServer = serverSelect ? serverSelect.value : fallbackId;
    localStorage.setItem('selected_stream_server', selectedServer);

    // Check if selected option is a Stremio stream
    if (selectedServer.startsWith('stremio_')) {
      const streamIdx = parseInt(selectedServer.replace('stremio_', ''));
      const stremioItem = stremioStreamsList[streamIdx];
      if (stremioItem) {
        // Direct HTTP stream — play in HTML5 video element
        if (stremioItem.url && (stremioItem.url.startsWith('http://') || stremioItem.url.startsWith('https://'))) {
          const directUrl = isProxyActive() ? proxifyUrl(stremioItem.url) : stremioItem.url;
          loadDirectVideo(directUrl);
          return;
        }
        // External/iframe-able URL
        if (stremioItem.externalUrl && stremioItem.externalUrl.startsWith('http')) {
          loadIframe(stremioItem.externalUrl);
          return;
        }
        // Torrent stream — can't play in browser, show Stremio launcher card
        if (stremioItem.isTorrent || stremioItem.infoHash) {
          const imdbIdLocal = item.imdb_id || item.external_ids?.imdb_id || '';
          const streamTypeLocal = type === 'tv' ? 'series' : 'movie';
          const stremioWebUrl = `https://web.stremio.com/#/detail/${streamTypeLocal}/${imdbIdLocal}`;
          iframeRoot.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.5rem;padding:2rem;text-align:center;background:#0a0b0f;border-radius:14px;">
              <div style="font-size:3rem;">🧲</div>
              <div style="color:#fff;font-size:1.1rem;font-weight:700;">Torrent Stream Found</div>
              <div style="color:rgba(255,255,255,0.6);font-size:0.85rem;max-width:420px;line-height:1.6;">
                This stream (<strong style="color:#00f2fe;">${stremioItem.addonName}</strong>) is a torrent/magnet link. 
                Browsers can't play torrents directly. Open it in the Stremio app or Stremio Web to stream instantly.
              </div>
              <div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;">
                <a href="${stremioWebUrl}" target="_blank" rel="noopener" 
                   style="background:linear-gradient(135deg,#00f2fe,#4facfe);color:#000;font-weight:700;padding:0.65rem 1.5rem;border-radius:8px;text-decoration:none;font-size:0.9rem;">
                  ▶ Open in Stremio Web
                </a>
                ${stremioItem.infoHash ? `
                <a href="magnet:?xt=urn:btih:${stremioItem.infoHash}" 
                   style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#fff;font-weight:600;padding:0.65rem 1.5rem;border-radius:8px;text-decoration:none;font-size:0.9rem;">
                  🧲 Copy Magnet
                </a>` : ''}
              </div>
              <div style="color:rgba(255,255,255,0.35);font-size:0.75rem;">Quality: ${stremioItem.title || stremioItem.name}</div>
            </div>
          `;
          return;
        }
      }
    }

    // Lookup selected server in configured active servers
    const matchedServer = activeServers.find(s => s.id === selectedServer) || activeServers[0];
    
    let template = '';
    if (matchedServer) {
      template = type === 'movie' ? (matchedServer.movieUrl || movieUrlTemplate) : (matchedServer.tvUrl || tvUrlTemplate);
    } else {
      template = type === 'movie' ? movieUrlTemplate : tvUrlTemplate;
    }

    const imdbId = item.imdb_id || item.external_ids?.imdb_id || '';
    let streamUrl = getStreamUrl(template, item.id, imdbId, currentSeason, currentEpisode);
    
    // Append start progress time if valid and not yet consumed
    if (startProgressSeconds > 10) {
      const separator = streamUrl.includes('?') ? '&' : '?';
      streamUrl += `${separator}start=${startProgressSeconds}&t=${startProgressSeconds}`;
      startProgressSeconds = 0; // Consume once
    }
    
    loadIframe(streamUrl);
  };

  // Initial population of servers dropdown
  populateServerSelect();

  // Async query for Stremio Addon Streams using IMDB ID
  const imdbId = item.imdb_id || item.external_ids?.imdb_id || '';
  if (imdbId) {
    fetchStremioStreams(imdbId, type, currentSeason, currentEpisode).then(streams => {
      if (streams && streams.length > 0) {
        stremioStreamsList = streams;
        populateServerSelect();
      }
    }).catch(err => {
      console.warn('Stremio streams query completed with notice:', err);
    });
  }

  // Configure Server Selector Change listener
  const serverSelect = document.getElementById('player-server-select');
  if (serverSelect) {
    serverSelect.onchange = () => {
      refreshPlayerUrl();
    };
  }

  // Configure Player USA Proxy Button
  const playerProxyBtn = document.getElementById('player-proxy-toggle-btn');
  const playerProxyText = document.getElementById('player-proxy-text');

  const updatePlayerProxyUI = () => {
    const active = isProxyActive();
    const node = getCurrentProxyNode();
    if (playerProxyBtn) {
      if (active) {
        playerProxyBtn.classList.add('active');
        if (playerProxyText) playerProxyText.textContent = `US Proxy: ON (${node.city})`;
      } else {
        playerProxyBtn.classList.remove('active');
        if (playerProxyText) playerProxyText.textContent = 'US Proxy: OFF';
      }
    }
  };

  updatePlayerProxyUI();

  if (playerProxyBtn) {
    playerProxyBtn.onclick = () => {
      const nextState = !isProxyActive();
      setProxyState(nextState);
      updatePlayerProxyUI();
      refreshPlayerUrl();
    };
  }

  let hasNextEpisode = false;

  // Helper to manage Next Episode visibility rules
  const updateNextEpisodeButtonState = () => {
    if (!nextBtn) return;
    
    if (type !== 'tv') {
      hasNextEpisode = false;
      nextBtn.classList.add('hidden');
      nextBtn.classList.remove('visible');
      return;
    }
    
    const hasNextInSeason = currentEpisode < episodes.length;
    const hasNextSeason = currentSeason < (item.number_of_seasons || 1);
    hasNextEpisode = hasNextInSeason || hasNextSeason;
    
    // Keep it hidden initially until the timed scheduled trigger fires
    nextBtn.classList.add('hidden');
    nextBtn.classList.remove('visible');
  };
  
  overlay.classList.remove('hidden');
  episodeOpenTime = Date.now(); // Start tracking watch time
  
  // Prevent top-level redirect hijacks while video player is active
  window.onbeforeunload = (e) => {
    e.preventDefault();
    e.returnValue = "Warning: A script is attempting to redirect you away from UBH Stream.";
    return e.returnValue;
  };
  
  if (type === 'movie') {
    playerSubtitle.textContent = 'Feature Film';
    tvSelectors.classList.add('hidden');
    if (nextBtn) {
      nextBtn.classList.add('hidden');
      nextBtn.classList.remove('visible');
    }
    
    refreshPlayerUrl();
  } else {
    // TV Series Handling
    tvSelectors.classList.remove('hidden');
    
    const seasonSelect = document.getElementById('player-season-select');
    const episodeSelect = document.getElementById('player-episode-select');
    const quickList = document.getElementById('episodes-quick-list');
    
    // Populate Seasons Dropdown
    seasonSelect.innerHTML = '';
    const totalSeasons = item.number_of_seasons || 1;
    for (let s = 1; s <= totalSeasons; s++) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = `Season ${s}`;
      if (s === currentSeason) opt.selected = true;
      seasonSelect.appendChild(opt);
    }
    
    // Function to reload episodes when Season changes
    const loadSeasonEpisodes = async (seasonNum, autoPlayEpisode = 1) => {
      currentSeason = seasonNum;
      
      // Update quick status
      quickList.innerHTML = '<span class="loader-spinner" style="width:20px; height:20px;"></span>';
      
      try {
        const seasonData = await tmdb.getTVSeason(item.id, seasonNum);
        episodes = seasonData.episodes || [];
        
        // Populate Episodes dropdown
        episodeSelect.innerHTML = '';
        episodes.forEach(ep => {
          const opt = document.createElement('option');
          opt.value = ep.episode_number;
          opt.textContent = `Ep ${ep.episode_number}: ${ep.name || 'Episode ' + ep.episode_number}`;
          if (ep.episode_number === autoPlayEpisode) opt.selected = true;
          episodeSelect.appendChild(opt);
        });
        
        // Populate Horizontal quick-select bar
        quickList.innerHTML = '';
        episodes.forEach(ep => {
          const card = document.createElement('div');
          card.className = `episode-card ${ep.episode_number === autoPlayEpisode ? 'active' : ''}`;
          card.dataset.episode = ep.episode_number;
          card.innerHTML = `
            <div class="episode-card-num">Episode ${ep.episode_number}</div>
            <div class="episode-card-title">${ep.name || 'Episode ' + ep.episode_number}</div>
          `;
          
          card.addEventListener('click', () => {
            // Save progress for current episode before switching
            const duration = Math.floor((Date.now() - episodeOpenTime) / 1000);
            onProgressSave(item, type, currentSeason, currentEpisode, duration);
            episodeOpenTime = Date.now();
            
            playEpisode(seasonNum, ep.episode_number);
          });
          quickList.appendChild(card);
        });
        
        // Auto play the selected episode
        playEpisode(seasonNum, autoPlayEpisode, false);
      } catch (err) {
        console.error(err);
        quickList.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Failed to load episodes.</div>';
      }
    };
    
    // Function to set active episode stream
    const playEpisode = (seasonNum, epNum, updateDropdowns = true) => {
      currentSeason = parseInt(seasonNum);
      currentEpisode = parseInt(epNum);
      
      playerSubtitle.textContent = `Season ${currentSeason} • Episode ${currentEpisode}`;
      
      // Clear existing automatic trigger timer
      if (nextEpisodeTimer) clearTimeout(nextEpisodeTimer);
      
      // Hide next button initially
      if (nextBtn) {
        nextBtn.classList.remove('visible');
        nextBtn.classList.add('hidden');
      }
      
      refreshPlayerUrl();
      
      // Highlight quick list card
      quickList.querySelectorAll('.episode-card').forEach(c => {
        if (parseInt(c.dataset.episode) === currentEpisode) {
          c.classList.add('active');
          c.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
          c.classList.remove('active');
        }
      });
      
      if (updateDropdowns) {
        episodeSelect.value = currentEpisode;
      }
      
      // Check Next Episode button availability
      updateNextEpisodeButtonState();
      
      // Schedule automatic display of Next Episode button 3-4 minutes (e.g. 3.5 minutes) before ending
      const currentEpisodeObj = episodes.find(e => e.episode_number === currentEpisode);
      const runtimeMinutes = (currentEpisodeObj && currentEpisodeObj.runtime) ? currentEpisodeObj.runtime : 45;
      const showNextBtnAfterSeconds = Math.max(0, (runtimeMinutes - 3.5) * 60);
      
      nextEpisodeTimer = setTimeout(() => {
        if (type === 'tv' && hasNextEpisode) {
          if (nextBtn) {
            nextBtn.classList.remove('hidden');
            setTimeout(() => {
              nextBtn.classList.add('visible');
            }, 50);
          }
        }
      }, showNextBtnAfterSeconds * 1000);
    };
    
    // Dropdowns event listeners
    seasonSelect.onchange = (e) => {
      // Save progress for current episode before changing seasons
      const duration = Math.floor((Date.now() - episodeOpenTime) / 1000);
      onProgressSave(item, type, currentSeason, currentEpisode, duration);
      episodeOpenTime = Date.now();
      
      loadSeasonEpisodes(parseInt(e.target.value), 1);
    };
    
    episodeSelect.onchange = (e) => {
      // Save progress for current episode before changing episodes
      const duration = Math.floor((Date.now() - episodeOpenTime) / 1000);
      onProgressSave(item, type, currentSeason, currentEpisode, duration);
      episodeOpenTime = Date.now();
      
      playEpisode(currentSeason, parseInt(e.target.value));
    };
    
    // Wire up Netflix Next Episode Button Trigger click
    if (nextBtn) {
      nextBtn.onclick = () => {
        // Save progress for current episode
        const duration = Math.floor((Date.now() - episodeOpenTime) / 1000);
        onProgressSave(item, type, currentSeason, currentEpisode, duration);
        episodeOpenTime = Date.now();
        
        const hasNextInSeason = currentEpisode < episodes.length;
        const hasNextSeason = currentSeason < (item.number_of_seasons || 1);
        
        if (hasNextInSeason) {
          playEpisode(currentSeason, currentEpisode + 1);
        } else if (hasNextSeason) {
          const nextSeason = currentSeason + 1;
          seasonSelect.value = nextSeason;
          loadSeasonEpisodes(nextSeason, 1);
        }
      };
    }
    
    // Initial fetch of Season Episodes
    await loadSeasonEpisodes(currentSeason, currentEpisode);
  }
   // Ambient backlight toggle handling
  const ambientToggle = document.getElementById('ambient-glow-toggle');
  const ambientGlow = document.getElementById('player-ambient-glow');
  
  if (ambientToggle && ambientGlow) {
    ambientToggle.onclick = () => {
      ambientToggle.classList.toggle('active');
      ambientGlow.classList.toggle('hidden');
    };
  }
  
  // Handle mouse/touch movement activity to move next episode button
  let activityTimeout = null;
  const resetActivity = () => {
    overlay.classList.add('player-active');
    clearTimeout(activityTimeout);
    activityTimeout = setTimeout(() => {
      overlay.classList.remove('player-active');
    }, 4000);
  };
  
  overlay.addEventListener('mousemove', resetActivity);
  overlay.addEventListener('click', resetActivity);
  overlay.addEventListener('touchstart', resetActivity, { passive: true });

  // Handle auto-rotate to landscape on fullscreen
  const handleFullscreenChange = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } else {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    }
  };
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

  // Setup close listener
  const closeBtn = document.getElementById('player-close-btn');
  closeBtn.onclick = () => {
    // Save final progress
    const duration = Math.floor((Date.now() - episodeOpenTime) / 1000);
    onProgressSave(item, type, type === 'tv' ? currentSeason : null, type === 'tv' ? currentEpisode : null, duration);
    
    // Clear timers and event listeners to prevent memory leaks
    if (nextEpisodeTimer) clearTimeout(nextEpisodeTimer);
    clearTimeout(activityTimeout);
    
    overlay.removeEventListener('mousemove', resetActivity);
    overlay.removeEventListener('click', resetActivity);
    overlay.removeEventListener('touchstart', resetActivity);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    overlay.classList.remove('player-active');
    
    // Clear redirect hijack blocker when player is closed
    window.onbeforeunload = null;
    
    // Unload player to stop any streaming background audio/video playback
    iframeRoot.innerHTML = '';
    overlay.classList.remove('player-active');
    if (nextBtn) {
      nextBtn.classList.remove('visible');
      nextBtn.classList.add('hidden');
    }
    overlay.classList.add('hidden');
  };
}
