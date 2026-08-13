import {
  getStremioAddons,
  installStremioAddon,
  removeStremioAddon,
  toggleStremioAddon,
  getStreamServers,
  toggleStreamServer,
  deleteStreamServer,
  POPULAR_STREMIO_ADDONS_PRESETS,
  probeEndpointLatency
} from '../utils/apiManager.js';
import { escapeHTML } from '../utils/security.js';

/**
 * Creates the Stremio Addons & Streaming Servers Hub Section component.
 * @param {Object} callbacks - { onOpenServerModal, onOpenStremioModal, showToast, syncCloud }
 * @returns {HTMLElement}
 */
export function createStremioServersSection(callbacks = {}) {
  const {
    onOpenServerModal = () => {},
    onOpenStremioModal = () => {},
    showToast = (msg, type) => console.log(type, msg),
    syncCloud = () => {}
  } = callbacks;

  const sectionWrapper = document.createElement('div');
  sectionWrapper.className = 'stremio-hub-container';

  let currentTab = 'stremio'; // 'stremio' | 'servers' | 'presets'
  let isProbingAll = false;
  const latencyResults = {};

  function renderContent() {
    const addons = getStremioAddons();
    const servers = getStreamServers();
    const activeAddonsCount = addons.filter(a => a.active !== false).length;
    const activeServersCount = servers.filter(s => s.active !== false).length;

    sectionWrapper.innerHTML = `
      <div class="stremio-hub-header">
        <div class="stremio-hub-title-group">
          <div class="stremio-hub-badge">
            <span class="stremio-hub-pulse-dot"></span>
            <span>STREAMING ENGINE & ADD-ON HUB</span>
          </div>
          <h2 class="stremio-hub-title">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stremio-hub-icon">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            Stremio Add-ons & Source Servers
          </h2>
          <p class="stremio-hub-subtitle">
            Manage your connected Stremio add-on manifests, monitor real-time server latencies, and configure multi-source playback engines for seamless 4K/HD streaming.
          </p>
        </div>

        <div class="stremio-hub-header-actions">
          <button id="hub-probe-all-btn" class="secondary-btn hub-btn-sm" ${isProbingAll ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
            ${isProbingAll ? 'Probing Latency...' : 'Probe All Speeds'}
          </button>
          <button id="hub-add-addon-btn" class="primary-btn accent-glow-btn hub-btn-sm">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none">
              <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Install Add-on
          </button>
          <button id="hub-add-server-btn" class="secondary-btn hub-btn-sm">
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
            Add Source API
          </button>
        </div>
      </div>

      <!-- Quick Manifest URL Install Bar -->
      <div class="stremio-quick-install-bar">
        <div class="quick-install-input-wrap">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="quick-install-icon">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          <input type="text" id="hub-quick-manifest-input" placeholder="Paste Stremio manifest URL (e.g. https://torrentio.strem.fun/manifest.json or stremio://...)" autocomplete="off">
          <button id="hub-quick-enter-key-btn" class="hub-enter-key-btn" type="button" title="Click or Press Enter on keyboard to Install">
            <span class="kbd-badge">↵ Enter</span>
          </button>
        </div>
        <button id="hub-quick-manifest-btn" class="primary-btn accent-glow-btn">
          <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none">
            <polyline points="9 10 4 15 9 20"></polyline>
            <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
          </svg>
          Install Manifest
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="stremio-hub-tabs">
        <button class="stremio-hub-tab ${currentTab === 'stremio' ? 'active' : ''}" data-tab="stremio">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          Stremio Add-ons
          <span class="hub-tab-count">${addons.length} (${activeAddonsCount} Active)</span>
        </button>
        
        <button class="stremio-hub-tab ${currentTab === 'servers' ? 'active' : ''}" data-tab="servers">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
          Embed Source APIs
          <span class="hub-tab-count">${servers.length} (${activeServersCount} Active)</span>
        </button>

        <button class="stremio-hub-tab ${currentTab === 'presets' ? 'active' : ''}" data-tab="presets">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          Recommended Add-on Hub
          <span class="hub-tab-badge">1-Click</span>
        </button>
      </div>

      <!-- Tab Panes Content -->
      <div class="stremio-hub-content">
        <div id="hub-cards-grid" class="stremio-cards-grid"></div>
      </div>
    `;

    // Attach Header Listeners
    sectionWrapper.querySelector('#hub-probe-all-btn')?.addEventListener('click', probeAllEndpoints);
    sectionWrapper.querySelector('#hub-add-addon-btn')?.addEventListener('click', () => onOpenStremioModal());
    sectionWrapper.querySelector('#hub-add-server-btn')?.addEventListener('click', () => onOpenServerModal());
    
    // Quick Install listener
    const quickInput = sectionWrapper.querySelector('#hub-quick-manifest-input');
    const quickBtn = sectionWrapper.querySelector('#hub-quick-manifest-btn');
    const quickEnterBtn = sectionWrapper.querySelector('#hub-quick-enter-key-btn');
    
    const handleQuickInstall = async () => {
      const val = quickInput?.value?.trim();
      if (!val) {
        showToast('Please enter a valid Stremio manifest URL', 'error');
        return;
      }
      if (quickBtn) {
        quickBtn.disabled = true;
        quickBtn.textContent = 'Installing...';
      }
      if (quickEnterBtn) {
        quickEnterBtn.disabled = true;
      }
      try {
        const installed = await installStremioAddon(val);
        showToast(`Successfully installed Stremio add-on: "${installed.name}"`, 'success');
        if (quickInput) quickInput.value = '';
        syncCloud();
        renderContent();
      } catch (err) {
        showToast('Install failed: ' + err.message, 'error');
      } finally {
        if (quickBtn) {
          quickBtn.disabled = false;
          quickBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.5" fill="none">
              <polyline points="9 10 4 15 9 20"></polyline>
              <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
            </svg>
            Install Manifest
          `;
        }
        if (quickEnterBtn) {
          quickEnterBtn.disabled = false;
        }
      }
    };

    quickBtn?.addEventListener('click', handleQuickInstall);
    quickEnterBtn?.addEventListener('click', handleQuickInstall);
    quickInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQuickInstall();
      }
    });

    // Tab switcher listeners
    sectionWrapper.querySelectorAll('.stremio-hub-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        currentTab = tabBtn.getAttribute('data-tab');
        renderContent();
      });
    });

    // Populate Cards Grid according to active tab
    const grid = sectionWrapper.querySelector('#hub-cards-grid');
    if (grid) {
      if (currentTab === 'stremio') {
        renderStremioAddonCards(grid);
      } else if (currentTab === 'servers') {
        renderStreamServerCards(grid);
      } else if (currentTab === 'presets') {
        renderPresetAddonCards(grid);
      }
    }
  }

  function renderStremioAddonCards(container) {
    const addons = getStremioAddons();
    container.innerHTML = '';

    if (addons.length === 0) {
      container.innerHTML = `
        <div class="hub-empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" stroke="var(--text-muted)" stroke-width="1.5" fill="none">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <h3>No Stremio Add-ons Connected</h3>
          <p>Install community add-ons like Torrentio, CyberFlix, or OpenSubtitles to enable multi-source stream discovery.</p>
          <button class="primary-btn accent-glow-btn hub-empty-btn" id="empty-open-presets-btn">Browse Recommended Add-ons</button>
        </div>
      `;
      container.querySelector('#empty-open-presets-btn')?.addEventListener('click', () => {
        currentTab = 'presets';
        renderContent();
      });
      return;
    }

    addons.forEach(addon => {
      const card = document.createElement('div');
      card.className = 'stremio-hub-card';
      const isActive = addon.active !== false;
      const safeId = escapeHTML(addon.id);
      const safeName = escapeHTML(addon.name);
      const safeDesc = escapeHTML(addon.description || 'Stremio Protocol Add-on');
      const safeVer = escapeHTML(addon.version || '1.0.0');
      const safeUrl = escapeHTML(addon.manifestUrl);
      const lat = latencyResults[addon.id];

      let latencyBadge = `<span class="hub-latency-pill standby">● Standby</span>`;
      if (lat !== undefined) {
        if (lat.status === 'ok') {
          latencyBadge = `<span class="hub-latency-pill online">● Online (${lat.ms}ms)</span>`;
        } else {
          latencyBadge = `<span class="hub-latency-pill offline">● Offline (${lat.error})</span>`;
        }
      }

      const resList = Array.isArray(addon.resources)
        ? addon.resources.map(r => typeof r === 'object' ? r.name : r)
        : ['stream'];
      const resourceTags = resList.map(r => `<span class="hub-card-tag">${escapeHTML(r)}</span>`).join('');

      card.innerHTML = `
        <div class="hub-card-header">
          <div class="hub-card-icon-wrap">
            <span class="hub-card-icon">⚡</span>
            <div>
              <div class="hub-card-title-row">
                <h3 class="hub-card-title">${safeName}</h3>
                <span class="hub-version-tag">v${safeVer}</span>
              </div>
              <div class="hub-card-status-row">
                ${latencyBadge}
                ${addon.isOfficial ? '<span class="hub-official-badge">Official</span>' : ''}
              </div>
            </div>
          </div>
          
          <label class="hub-toggle-switch" title="Toggle active status">
            <input type="checkbox" class="hub-addon-toggle" data-id="${safeId}" ${isActive ? 'checked' : ''}>
            <span class="hub-toggle-slider"></span>
          </label>
        </div>

        <p class="hub-card-desc">${safeDesc}</p>

        <div class="hub-card-tags">
          ${resourceTags}
        </div>

        <div class="hub-manifest-url-box" title="${safeUrl}">
          <span class="hub-manifest-url-text">${safeUrl}</span>
          <button class="hub-copy-url-btn" data-url="${safeUrl}" title="Copy Manifest URL">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>

        <div class="hub-card-actions">
          <button class="hub-action-btn probe-btn" data-id="${safeId}">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
            Probe
          </button>
          ${!addon.isOfficial ? `
            <button class="hub-action-btn remove-btn danger-hover" data-id="${safeId}">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Remove
            </button>
          ` : ''}
        </div>
      `;

      // Event Listeners for Card
      card.querySelector('.hub-addon-toggle')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        toggleStremioAddon(addon.id, checked);
        showToast(`Add-on "${addon.name}" ${checked ? 'enabled' : 'disabled'}.`, 'info');
        syncCloud();
        renderContent();
      });

      card.querySelector('.hub-copy-url-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(addon.manifestUrl);
        showToast('Manifest URL copied to clipboard!', 'success');
      });

      card.querySelector('.probe-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = `<span class="hub-spinner-sm"></span> Testing...`;
        const res = await probeEndpointLatency(addon.manifestUrl);
        latencyResults[addon.id] = res;
        if (res.status === 'ok') {
          showToast(`"${addon.name}" responded in ${res.ms}ms (Online)`, 'success');
        } else {
          showToast(`Failed to probe "${addon.name}": ${res.error}`, 'error');
        }
        renderContent();
      });

      card.querySelector('.remove-btn')?.addEventListener('click', () => {
        if (confirm(`Remove Stremio add-on "${addon.name}"?`)) {
          removeStremioAddon(addon.id);
          showToast(`Add-on "${addon.name}" removed.`, 'info');
          syncCloud();
          renderContent();
        }
      });

      container.appendChild(card);
    });
  }

  function renderStreamServerCards(container) {
    const servers = getStreamServers();
    container.innerHTML = '';

    servers.forEach(server => {
      const card = document.createElement('div');
      card.className = 'stremio-hub-card server-card';
      const isActive = server.active !== false;
      const safeId = escapeHTML(server.id);
      const safeName = escapeHTML(server.name);
      const safeMovie = escapeHTML(server.movieUrl);
      const safeTv = escapeHTML(server.tvUrl);
      const lat = latencyResults[server.id];

      let latencyBadge = `<span class="hub-latency-pill standby">● Ready</span>`;
      if (lat !== undefined) {
        if (lat.status === 'ok') {
          latencyBadge = `<span class="hub-latency-pill online">● Online (${lat.ms}ms)</span>`;
        } else {
          latencyBadge = `<span class="hub-latency-pill offline">● Status (${lat.error})</span>`;
        }
      }

      card.innerHTML = `
        <div class="hub-card-header">
          <div class="hub-card-icon-wrap">
            <span class="hub-card-icon server-icon">🌐</span>
            <div>
              <div class="hub-card-title-row">
                <h3 class="hub-card-title">${safeName}</h3>
                ${server.isDefault ? '<span class="hub-version-tag default-tag">Default</span>' : ''}
              </div>
              <div class="hub-card-status-row">
                ${latencyBadge}
              </div>
            </div>
          </div>
          
          <label class="hub-toggle-switch" title="Toggle player availability">
            <input type="checkbox" class="hub-server-toggle" data-id="${safeId}" ${isActive ? 'checked' : ''}>
            <span class="hub-toggle-slider"></span>
          </label>
        </div>

        <div class="hub-server-templates-box">
          <div class="hub-template-item">
            <span class="hub-template-label">Movie:</span>
            <code class="hub-template-code" title="${safeMovie}">${safeMovie}</code>
          </div>
          <div class="hub-template-item">
            <span class="hub-template-label">TV Series:</span>
            <code class="hub-template-code" title="${safeTv}">${safeTv}</code>
          </div>
        </div>

        <div class="hub-card-actions">
          <button class="hub-action-btn probe-server-btn" data-id="${safeId}">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>
            Probe
          </button>
          <button class="hub-action-btn edit-server-btn" data-id="${safeId}">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit
          </button>
          ${!server.isDefault ? `
            <button class="hub-action-btn delete-server-btn danger-hover" data-id="${safeId}">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Delete
            </button>
          ` : ''}
        </div>
      `;

      // Event Listeners
      card.querySelector('.hub-server-toggle')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        toggleStreamServer(server.id, checked);
        showToast(`Server "${server.name}" ${checked ? 'enabled' : 'disabled'} in player.`, 'info');
        syncCloud();
        renderContent();
      });

      card.querySelector('.probe-server-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = `<span class="hub-spinner-sm"></span> Testing...`;
        // Probe root origin of the server template
        try {
          const u = new URL(server.movieUrl.replace('{id}', '550'));
          const res = await probeEndpointLatency(u.origin);
          latencyResults[server.id] = res;
          if (res.status === 'ok') {
            showToast(`"${server.name}" origin responded in ${res.ms}ms`, 'success');
          } else {
            showToast(`"${server.name}" probe: ${res.error}`, 'info');
          }
        } catch (e) {
          latencyResults[server.id] = { status: 'error', error: 'Invalid URL' };
        }
        renderContent();
      });

      card.querySelector('.edit-server-btn')?.addEventListener('click', () => {
        onOpenServerModal(server);
      });

      card.querySelector('.delete-server-btn')?.addEventListener('click', () => {
        if (confirm(`Delete streaming source API "${server.name}"?`)) {
          deleteStreamServer(server.id);
          showToast(`Server "${server.name}" deleted.`, 'info');
          syncCloud();
          renderContent();
        }
      });

      container.appendChild(card);
    });
  }

  function renderPresetAddonCards(container) {
    const installed = getStremioAddons();
    const installedIds = new Set(installed.map(a => a.id));
    const installedUrls = new Set(installed.map(a => a.manifestUrl.toLowerCase()));

    container.innerHTML = '';

    POPULAR_STREMIO_ADDONS_PRESETS.forEach(preset => {
      const isAlreadyInstalled = installedIds.has(preset.id) || installedUrls.has(preset.manifestUrl.toLowerCase());
      const card = document.createElement('div');
      card.className = 'stremio-hub-card preset-card';

      const safeName = escapeHTML(preset.name);
      const safeDesc = escapeHTML(preset.description);
      const safeVer = escapeHTML(preset.version);
      const tags = (preset.tags || []).map(t => `<span class="hub-card-tag preset-tag">${escapeHTML(t)}</span>`).join('');

      card.innerHTML = `
        <div class="hub-card-header">
          <div class="hub-card-icon-wrap">
            <span class="hub-card-icon preset-icon">${preset.icon || '🚀'}</span>
            <div>
              <div class="hub-card-title-row">
                <h3 class="hub-card-title">${safeName}</h3>
                <span class="hub-version-tag">v${safeVer}</span>
              </div>
              <span class="hub-community-badge">Community Add-on</span>
            </div>
          </div>
        </div>

        <p class="hub-card-desc">${safeDesc}</p>

        <div class="hub-card-tags">
          ${tags}
        </div>

        <div class="hub-card-actions" style="margin-top:auto;">
          ${isAlreadyInstalled ? `
            <button class="hub-installed-btn" disabled>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Installed & Active
            </button>
          ` : `
            <button class="primary-btn accent-glow-btn hub-install-preset-btn" data-url="${preset.manifestUrl}">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              1-Click Install
            </button>
          `}
        </div>
      `;

      card.querySelector('.hub-install-preset-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = `<span class="hub-spinner-sm"></span> Installing...`;
        try {
          const res = await installStremioAddon(preset.manifestUrl);
          showToast(`Installed "${res.name}" successfully!`, 'success');
          syncCloud();
          renderContent();
        } catch (err) {
          showToast(`Install failed: ${err.message}`, 'error');
          btn.disabled = false;
          btn.textContent = '1-Click Install';
        }
      });

      container.appendChild(card);
    });
  }

  async function probeAllEndpoints() {
    if (isProbingAll) return;
    isProbingAll = true;
    showToast('Probing latencies for all Stremio add-ons and source servers...', 'info');
    renderContent();

    const addons = getStremioAddons();
    const servers = getStreamServers();

    const addonPromises = addons.map(async (a) => {
      const res = await probeEndpointLatency(a.manifestUrl);
      latencyResults[a.id] = res;
    });

    const serverPromises = servers.map(async (s) => {
      try {
        const u = new URL(s.movieUrl.replace('{id}', '550'));
        const res = await probeEndpointLatency(u.origin);
        latencyResults[s.id] = res;
      } catch (e) {
        latencyResults[s.id] = { status: 'error', error: 'Invalid URL' };
      }
    });

    await Promise.allSettled([...addonPromises, ...serverPromises]);

    isProbingAll = false;
    showToast('Speed probe complete! Latencies updated.', 'success');
    renderContent();
  }

  // Listen to external events for live multi-tab / modal synchronization
  window.addEventListener('stremio-addons-changed', () => {
    renderContent();
  });
  window.addEventListener('stream-servers-changed', () => {
    renderContent();
  });

  // Initial render
  renderContent();
  return sectionWrapper;
}
