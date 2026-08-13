import { tmdb } from '../tmdb.js';
import { escapeHTML } from '../utils/security.js';
import { getActiveStreamServers, fetchStremioStreams, getActiveDebridService, resolveDebridStream } from '../utils/apiManager.js';
import { isProxyActive, setProxyState, proxifyUrl, getCurrentProxyNode } from '../utils/proxyManager.js';

let currentHlsInstance = null;
let currentWebTorrentClient = null;

/**
 * Initializes and manages the full-screen video player overlay.
 * Supports dynamic streaming servers, HLS adaptive bitrate (.m3u8), WebTorrent P2P streams,
 * Real-Debrid unfreezing, CloudStream direct embeds, Next Episode overlay controls, and progress tracking.
 * @param {Object} item - TMDB/Cloudstream/Stremio details object
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

  // Helper to cleanup active HLS or WebTorrent instances
  const destroyActiveEngines = () => {
    if (currentHlsInstance) {
      try { currentHlsInstance.destroy(); } catch (_) {}
      currentHlsInstance = null;
    }
    if (currentWebTorrentClient) {
      try { currentWebTorrentClient.destroy(); } catch (_) {}
      currentWebTorrentClient = null;
    }
  };
  
  // Helper to load Iframe content
  const loadIframe = (url) => {
    destroyActiveEngines();
    iframeRoot.innerHTML = `
      <iframe src="${url}" 
        allowfullscreen 
        scrolling="no" 
        frameborder="0" 
        referrerpolicy="no-referrer"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope; clipboard-write"
        style="width:100%; height:100%; border:none; background:#000;">
      </iframe>
    `;
  };

  // Helper to load HTML5 direct video stream with universal HLS.js adaptive bitrate engine
  const loadHlsOrDirectVideo = (streamUrl, subtitleTracks = []) => {
    destroyActiveEngines();

    iframeRoot.innerHTML = `
      <div style="position:relative; width:100%; height:100%; background:#000; border-radius:14px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
        <video id="active-html5-player" 
          controls 
          autoplay 
          playsinline 
          crossorigin="anonymous"
          style="width:100%; height:100%; object-fit:contain; background:#000;">
          ${subtitleTracks.map(t => `<track kind="subtitles" src="${t.url}" srclang="${t.lang || 'en'}" label="${t.label || t.lang || 'English'}" ${t.default ? 'default' : ''}>`).join('')}
          Your browser does not support HTML5 video streaming.
        </video>
        <div id="video-stream-spinner" style="position:absolute; pointer-events:none; display:none;">
          <span class="loader-spinner" style="width:40px; height:40px;"></span>
        </div>
      </div>
    `;

    const videoEl = document.getElementById('active-html5-player');
    const spinner = document.getElementById('video-stream-spinner');
    if (!videoEl) return;

    videoEl.addEventListener('waiting', () => { if (spinner) spinner.style.display = 'block'; });
    videoEl.addEventListener('playing', () => { if (spinner) spinner.style.display = 'none'; });

    const isHlsStream = streamUrl.includes('.m3u8') || streamUrl.includes('m3u8') || streamUrl.includes('application/x-mpegURL');

    if (isHlsStream && window.Hls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });
      currentHlsInstance = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        videoEl.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('HLS Network error encountered, attempting recovery...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('HLS Media error encountered, recovering media...');
              hls.recoverMediaError();
              break;
            default:
              console.error('Fatal HLS error, destroying engine:', data);
              destroyActiveEngines();
              break;
          }
        }
      });
    } else {
      // Direct MP4 or Native browser HLS (Safari/iOS)
      videoEl.src = streamUrl;
      videoEl.play().catch(() => {});
    }
  };

  // Helper to stream torrents directly in browser via WebTorrent
  const loadWebTorrentStream = (infoHash, fileIdx) => {
    destroyActiveEngines();

    iframeRoot.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:1.25rem; padding:2rem; text-align:center; background:#0a0b0f; border-radius:14px;">
        <div style="font-size:2.8rem;">🧲</div>
        <div style="color:#fff; font-size:1.15rem; font-weight:700;">Streaming P2P Torrent in Browser</div>
        <div id="torrent-status-msg" style="color:var(--accent-cyan); font-size:0.85rem;">Connecting to swarm peers...</div>
        <div style="width:280px; height:6px; background:rgba(255,255,255,0.1); border-radius:10px; overflow:hidden;">
          <div id="torrent-progress-bar" style="width:0%; height:100%; background:var(--accent-cyan); transition:width 0.3s;"></div>
        </div>
        <div id="webtorrent-video-container" style="width:100%; max-height:480px; display:none;"></div>
      </div>
    `;

    if (window.WebTorrent) {
      try {
        const client = new window.WebTorrent();
        currentWebTorrentClient = client;
        const magnetUri = `magnet:?xt=urn:btih:${infoHash}&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=wss%3A%2F%2Ftracker.openwebtorrent.com`;

        client.add(magnetUri, (torrent) => {
          const statusMsg = document.getElementById('torrent-status-msg');
          const progressBar = document.getElementById('torrent-progress-bar');
          const container = document.getElementById('webtorrent-video-container');

          torrent.on('download', () => {
            const percent = Math.round(torrent.progress * 100);
            const speed = (torrent.downloadSpeed / 1024 / 1024).toFixed(1);
            if (statusMsg) statusMsg.textContent = `Buffering: ${percent}% · ${speed} MB/s · ${torrent.numPeers} peers`;
            if (progressBar) progressBar.style.width = `${percent}%`;
          });

          // Find video file
          let file = torrent.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.webm'));
          if (fileIdx !== undefined && torrent.files[fileIdx]) file = torrent.files[fileIdx];

          if (file && container) {
            container.style.display = 'block';
            file.renderTo(container, { autoplay: true, controls: true }, (err) => {
              if (err) console.warn('WebTorrent render error:', err);
            });
          }
        });

        client.on('error', (err) => {
          console.warn('WebTorrent client error:', err);
        });
      } catch (err) {
        console.warn('Failed to start WebTorrent:', err);
      }
    }
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
    const isCloudStreamItem = item.embedUrl || item.directUrl || item.streamUrl || item.isCloudStream;
    const savedServer = localStorage.getItem('selected_stream_server') || (activeServers[0]?.id || 'multiembed');

    serverSelect.innerHTML = '';

    // CloudStream Direct Stream group (if item has embedUrl or directUrl)
    if (isCloudStreamItem) {
      const csGroup = document.createElement('optgroup');
      csGroup.label = '☁️ CloudStream Plugin Stream';
      const opt = document.createElement('option');
      opt.value = 'cloudstream_direct';
      opt.textContent = `▶ [${item.providerName || 'CloudStream'}] Live Direct Stream`;
      opt.selected = true;
      csGroup.appendChild(opt);
      serverSelect.appendChild(csGroup);
    }

    // Stremio Add-on Streams group (if available)
    if (stremioStreamsList.length > 0) {
      const stremioGroup = document.createElement('optgroup');
      stremioGroup.label = `⚡ Stremio Streams (${stremioStreamsList.length})`;

      stremioStreamsList.forEach((st, idx) => {
        const opt = document.createElement('option');
        opt.value = `stremio_${idx}`;
        const streamTypeIcon = st.isTorrent ? '🧲 ' : '▶ ';
        opt.textContent = `${streamTypeIcon}[${(st.addonName || '').substring(0, 12)}] ${st.title || st.name}`;
        if (opt.value === savedServer && !isCloudStreamItem) opt.selected = true;
        stremioGroup.appendChild(opt);
      });
      serverSelect.appendChild(stremioGroup);
    }

    // Standard Embed Servers group
    const embedGroup = document.createElement('optgroup');
    embedGroup.label = 'Web Embed Servers';

    activeServers.forEach(srv => {
      const opt = document.createElement('option');
      opt.value = srv.id;
      opt.textContent = srv.name;
      if (srv.id === savedServer && !isCloudStreamItem && stremioStreamsList.length === 0) opt.selected = true;
      embedGroup.appendChild(opt);
    });
    serverSelect.appendChild(embedGroup);
  };

  // Helper to refresh URL based on selected server
  const refreshPlayerUrl = async () => {
    const serverSelect = document.getElementById('player-server-select');
    const activeServers = getActiveStreamServers();
    const isCloudStreamItem = item.embedUrl || item.directUrl || item.streamUrl || item.isCloudStream;
    const fallbackId = isCloudStreamItem ? 'cloudstream_direct' : (activeServers[0]?.id || 'multiembed');
    const selectedServer = serverSelect ? serverSelect.value : fallbackId;
    
    if (!isCloudStreamItem) {
      localStorage.setItem('selected_stream_server', selectedServer);
    }

    // Check if CloudStream direct embed/stream is active
    if (selectedServer === 'cloudstream_direct' || (isCloudStreamItem && !selectedServer.startsWith('stremio_'))) {
      if (item.embedUrl) {
        loadIframe(item.embedUrl);
        return;
      }
      if (item.directUrl || item.streamUrl) {
        const streamSrc = item.directUrl || item.streamUrl;
        const proxied = isProxyActive() ? proxifyUrl(streamSrc) : streamSrc;
        loadHlsOrDirectVideo(proxied);
        return;
      }
    }

    // Check if selected option is a Stremio stream
    if (selectedServer.startsWith('stremio_')) {
      const streamIdx = parseInt(selectedServer.replace('stremio_', ''));
      const stremioItem = stremioStreamsList[streamIdx];
      if (stremioItem) {
        // 1. Direct HTTP/HLS stream
        if (stremioItem.url && (stremioItem.url.startsWith('http://') || stremioItem.url.startsWith('https://'))) {
          const directUrl = isProxyActive() ? proxifyUrl(stremioItem.url) : stremioItem.url;
          loadHlsOrDirectVideo(directUrl);
          return;
        }
        
        // 2. External iframe stream
        if (stremioItem.externalUrl && stremioItem.externalUrl.startsWith('http')) {
          loadIframe(stremioItem.externalUrl);
          return;
        }
        
        // 3. Torrent / InfoHash stream: Auto-resolve via Real-Debrid/Torbox or WebTorrent
        if (stremioItem.infoHash) {
          const debrid = getActiveDebridService();
          if (debrid) {
            iframeRoot.innerHTML = `
              <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:1rem; text-align:center;">
                <span class="loader-spinner" style="width:40px; height:40px;"></span>
                <p style="color:var(--text-high); font-weight:600;">Unfreezing stream via ${debrid.service.name}...</p>
              </div>
            `;
            const resolvedUrl = await resolveDebridStream(stremioItem.infoHash, stremioItem.fileIdx);
            if (resolvedUrl) {
              loadHlsOrDirectVideo(resolvedUrl);
              return;
            }
          }

          // In-browser WebTorrent streaming
          if (window.WebTorrent) {
            loadWebTorrentStream(stremioItem.infoHash, stremioItem.fileIdx);
            return;
          }

          // Fallback Stremio Deep Link
          const imdbIdLocal = item.imdb_id || item.external_ids?.imdb_id || '';
          const streamTypeLocal = type === 'tv' ? 'series' : 'movie';
          const stremioWebUrl = `https://web.stremio.com/#/detail/${streamTypeLocal}/${imdbIdLocal}`;
          iframeRoot.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:1.5rem; padding:2rem; text-align:center; background:#0a0b0f; border-radius:14px;">
              <div style="font-size:3rem;">🧲</div>
              <div style="color:#fff; font-size:1.1rem; font-weight:700;">Torrent Stream Detected</div>
              <div style="color:rgba(255,255,255,0.6); font-size:0.85rem; max-width:420px; line-height:1.6;">
                Stream from <strong style="color:var(--accent-cyan);">${stremioItem.addonName}</strong> is ready. Open in Stremio app or configure a Debrid API key in Admin Settings for instant playback.
              </div>
              <div style="display:flex; gap:1rem; flex-wrap:wrap; justify-content:center;">
                <a href="${stremioWebUrl}" target="_blank" rel="noopener" 
                   style="background:var(--accent-gradient); color:#000; font-weight:700; padding:0.65rem 1.5rem; border-radius:8px; text-decoration:none; font-size:0.9rem;">
                  ▶ Open in Stremio Web
                </a>
              </div>
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

  // Async query for Stremio Addon Streams with auto IMDB ID lookup
  const loadStremioStreamsAsync = async () => {
    let resolvedImdbId = item.imdb_id || item.external_ids?.imdb_id || '';

    // If IMDB ID is not on item, fetch it from TMDB external IDs
    if (!resolvedImdbId && typeof item.id === 'number') {
      try {
        const extData = await tmdb.getExternalIds(item.id, type);
        if (extData && extData.imdb_id) {
          resolvedImdbId = extData.imdb_id;
          item.imdb_id = resolvedImdbId;
        }
      } catch (_) {}
    }

    if (resolvedImdbId) {
      try {
        const streams = await fetchStremioStreams(resolvedImdbId, type, currentSeason, currentEpisode);
        if (streams && streams.length > 0) {
          stremioStreamsList = streams;
          populateServerSelect();
        }
      } catch (err) {
        console.warn('Stremio streams query completed with notice:', err);
      }
    }
  };

  loadStremioStreamsAsync();

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
    
    // Unload player and destroy HLS / WebTorrent engines to stop background streaming
    destroyActiveEngines();
    iframeRoot.innerHTML = '';
    overlay.classList.remove('player-active');
    if (nextBtn) {
      nextBtn.classList.remove('visible');
      nextBtn.classList.add('hidden');
    }
    overlay.classList.add('hidden');
  };
}
