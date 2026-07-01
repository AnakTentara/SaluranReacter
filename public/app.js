// Main frontend logic using plain JS & Socket.io

const socket = io();

// ── App State ──────────────────────────────────────────────────────────────
const state = {
  accounts: [],
  channels: [],
  config: null,
  activeTab: 'accounts',
  selectedAccountIdForQr: null,
  selectedApiKeyIndex: 0,
  rateLimitStats: [],
  selectedChannelIdForChat: null,
  selectedChannelIdForGallery: null,
  isSidebarCollapsed: localStorage.getItem('sidebar_collapsed') === 'true',
};

// ── DOM Cache ──────────────────────────────────────────────────────────────
const DOM = {
  navBtns: document.querySelectorAll('.nav-btn'),
  panels: document.querySelectorAll('.tab-panel'),
  accountsGrid: document.getElementById('accounts-grid'),
  channelsList: document.getElementById('channels-list'),
  logList: document.getElementById('log-list'),
  debugTbody: document.getElementById('debug-tbody'),

  // Rate limits
  rlRpmVal: document.getElementById('rl-rpm-val'),
  rlRpmBar: document.getElementById('rl-rpm-bar'),
  rlRpdVal: document.getElementById('rl-rpd-val'),
  rlRpdBar: document.getElementById('rl-rpd-bar'),
  rlPrevKey: document.getElementById('rl-prev-key'),
  rlNextKey: document.getElementById('rl-next-key'),
  rlKeyIndex: document.getElementById('rl-key-index'),
  rlKeyMasked: document.getElementById('rl-key-masked'),

  // Apikey
  inputApikey: document.getElementById('input-apikey'),
  btnSaveApikey: document.getElementById('btn-save-apikey'),
  apikeyStatus: document.getElementById('apikey-status'),

  // Polling
  inputPolling: document.getElementById('input-polling'),
  btnSavePolling: document.getElementById('btn-save-polling'),

  // Debug settings
  toggleDebug: document.getElementById('toggle-debug'),
  toggleDebugText: document.getElementById('toggle-debug-text'),
  debugModeNotice: document.getElementById('debug-mode-notice'),

  // Modals
  qrModal: document.getElementById('qr-modal'),
  qrImage: document.getElementById('qr-image'),
  qrLoading: document.getElementById('qr-loading'),
  qrStatusText: document.getElementById('qr-status-text'),
  qrModalTitle: document.getElementById('qr-modal-title'),

  addAccountModal: document.getElementById('add-account-modal'),
  editAccountModal: document.getElementById('edit-account-modal'),
  addChannelModal: document.getElementById('add-channel-modal'),

  // Buttons & Inputs inside modals
  btnAddAccount: document.getElementById('btn-add-account'),
  btnAddChannel: document.getElementById('btn-add-channel'),
  btnSubmitAccount: document.getElementById('btn-submit-account'),
  btnSubmitChannel: document.getElementById('btn-submit-channel'),
  btnSubmitEdit: document.getElementById('btn-submit-edit'),

  // Clear logs/debug
  btnClearLog: document.getElementById('btn-clear-log'),
  btnClearDebug: document.getElementById('btn-clear-debug'),

  // Debug Force React
  debugReactAccount: document.getElementById('debug-react-account'),
  debugReactJid: document.getElementById('debug-react-jid'),
  debugReactMsgId: document.getElementById('debug-react-msgid'),
  debugReactServerId: document.getElementById('debug-react-serverid'),
  debugReactEmoji: document.getElementById('debug-react-emoji'),
  btnDebugReact: document.getElementById('btn-debug-react'),
  debugReactResult: document.getElementById('debug-react-result'),

  // New Chat & Starred References
  chatHistoryBody: document.getElementById('chat-history-body'),
  mediaGalleryGrid: document.getElementById('media-gallery-grid'),
  chatCountLabel: document.getElementById('chat-count-label'),
  btnRefreshChat: document.getElementById('btn-refresh-chat'),

  // Custom Silent Hours
  silentStart: document.getElementById('silent-start'),
  silentEnd: document.getElementById('silent-end'),
  silentMultiplier: document.getElementById('silent-multiplier'),
  btnSaveSilent: document.getElementById('btn-save-silent'),

  // Collapsible Sidebar & Layout Overhauls
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  sidebar: document.querySelector('.sidebar'),
  
  // Dual Pane Containers
  chatChannelList: document.getElementById('chat-channel-list'),
  galleryChannelList: document.getElementById('gallery-channel-list'),
  chatEmptyView: document.getElementById('chat-empty-view'),
  chatActiveView: document.getElementById('chat-active-view'),
  galleryEmptyView: document.getElementById('gallery-empty-view'),
  galleryActiveView: document.getElementById('gallery-active-view'),
  activeChatTitle: document.getElementById('active-chat-title'),
  activeGalleryTitle: document.getElementById('active-gallery-title'),

  // Starred Drawer
  starredDrawer: document.getElementById('starred-drawer'),
  starredDrawerContent: document.getElementById('starred-drawer-content'),
  starredDrawerBody: document.getElementById('starred-drawer-body'),
  btnOpenStarredDrawer: document.getElementById('btn-open-starred-drawer'),
  btnCloseStarredDrawer: document.getElementById('btn-close-starred-drawer'),
};

// ── Init App ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  if (state.isSidebarCollapsed) {
    DOM.sidebar.classList.add('collapsed');
  }
  await refreshAll();
  appendLog('system', 'Dashboard initialized and connected to server');

  // Load recent logs and debug messages from API
  loadRecentLogs();
  loadRecentDebugMessages();

  // Initialize Lucide icons on static elements
  lucide.createIcons();
});

// ── Navigation / Tabs ──────────────────────────────────────────────────────
function setupEventListeners() {
  DOM.navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // Apikey Save
  DOM.btnSaveApikey.addEventListener('click', saveApiKey);

  // Polling Save
  DOM.btnSavePolling.addEventListener('click', savePollingInterval);

  // Debug Toggle
  DOM.toggleDebug.addEventListener('change', toggleDebugMode);

  // QR Modal Close
  document.getElementById('qr-modal-close').addEventListener('click', () => closeQrModal());
  document.getElementById('add-account-close').addEventListener('click', () => closeAddAccountModal());
  document.getElementById('edit-account-close').addEventListener('click', () => closeEditAccountModal());
  document.getElementById('add-channel-close').addEventListener('click', () => closeAddChannelModal());

  // Trigger add modals
  DOM.btnAddAccount.addEventListener('click', () => openAddAccountModal());
  DOM.btnAddChannel.addEventListener('click', () => openAddChannelModal());

  // Submit modals
  DOM.btnSubmitAccount.addEventListener('click', submitAddAccount);
  DOM.btnSubmitChannel.addEventListener('click', submitAddChannel);
  DOM.btnSubmitEdit.addEventListener('click', submitEditAccount);

  // Clear buttons
  DOM.btnClearLog.addEventListener('click', () => {
    DOM.logList.innerHTML = '';
    appendLog('info', 'Logs cleared locally');
  });
  DOM.btnClearDebug.addEventListener('click', clearDebugLogs);

  // Force React Debug
  document.getElementById('btn-debug-react').addEventListener('click', forceReact);

  // Rate Limit Key Carousel Navigation
  DOM.rlPrevKey.addEventListener('click', () => {
    if (!state.rateLimitStats || state.rateLimitStats.length <= 1) return;
    state.selectedApiKeyIndex = (state.selectedApiKeyIndex - 1 + state.rateLimitStats.length) % state.rateLimitStats.length;
    renderRateLimitCurrentKey();
  });

  DOM.rlNextKey.addEventListener('click', () => {
    if (!state.rateLimitStats || state.rateLimitStats.length <= 1) return;
    state.selectedApiKeyIndex = (state.selectedApiKeyIndex + 1) % state.rateLimitStats.length;
    renderRateLimitCurrentKey();
  });

  // Save Custom Silent Hours
  DOM.btnSaveSilent.addEventListener('click', saveSilentHours);

  // Refresh Chat Viewer
  DOM.btnRefreshChat.addEventListener('click', loadChatHistory);

  // Sidebar Toggle Minimize
  DOM.btnToggleSidebar.addEventListener('click', () => {
    state.isSidebarCollapsed = !state.isSidebarCollapsed;
    DOM.sidebar.classList.toggle('collapsed', state.isSidebarCollapsed);
    localStorage.setItem('sidebar_collapsed', state.isSidebarCollapsed);
  });

  // Starred Drawer Toggle
  DOM.btnOpenStarredDrawer.addEventListener('click', () => {
    DOM.starredDrawer.style.display = 'block';
    setTimeout(() => {
      DOM.starredDrawerContent.style.right = '0';
    }, 10);
    loadStarredDrawer();
  });

  DOM.btnCloseStarredDrawer.addEventListener('click', closeStarredDrawer);
  DOM.starredDrawer.addEventListener('click', (e) => {
    if (e.target === DOM.starredDrawer) closeStarredDrawer();
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  DOM.navBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  DOM.panels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });

  if (tab === 'chat') {
    renderChannelSelectors('chat');
    if (state.selectedChannelIdForChat) {
      loadChatHistory();
    } else {
      DOM.chatEmptyView.style.display = 'flex';
      DOM.chatActiveView.style.display = 'none';
    }
  } else if (tab === 'gallery') {
    renderChannelSelectors('gallery');
    if (state.selectedChannelIdForGallery) {
      loadMediaGallery();
    } else {
      DOM.galleryEmptyView.style.display = 'flex';
      DOM.galleryActiveView.style.display = 'none';
    }
  }
}

// ── Socket.io Events ───────────────────────────────────────────────────────
socket.on('accounts:all', (accounts) => {
  // Sync full account status
  accounts.forEach((updated) => {
    const existing = state.accounts.find((a) => a.id === updated.id);
    if (existing) Object.assign(existing, updated);
  });
  renderAccounts();
});

socket.on('accounts:statusUpdate', (updated) => {
  const account = state.accounts.find((a) => a.id === updated.id);
  if (account) {
    Object.assign(account, updated);
    renderAccounts();

    // Update active QR modal if relevant
    if (state.selectedAccountIdForQr === updated.id) {
      if (updated.status === 'connected') {
        closeQrModal();
        appendLog('success', `Bot ${account.name} successfully connected!`);
      } else {
        DOM.qrStatusText.textContent = `Status: ${updated.status.toUpperCase()}`;
      }
    }
  }
});

socket.on('ratelimit:stats', (stats) => {
  updateRateLimitUI(stats);
});

// Listen to session QR events dynamically
socket.on('connect', () => {
  // Re-register session QR handlers on reconnection
  state.accounts.forEach((acc) => {
    socket.off(`qr:${acc.id}`);
    socket.on(`qr:${acc.id}`, ({ qrDataUrl }) => {
      if (state.selectedAccountIdForQr === acc.id) {
        DOM.qrLoading.style.display = 'none';
        DOM.qrImage.src = qrDataUrl;
        DOM.qrImage.style.display = 'block';
      }
    });
  });
});

// Logs from server
socket.on('channel:newPost', (post) => {
  appendLog('info', `[Post] New content detected. Type: ${post.contentType.toUpperCase()}`);
  if (state.activeTab === 'chat') {
    loadChatHistory();
  }
});

socket.on('posts:deleted', ({ id }) => {
  const bubble = document.querySelector(`[data-post-id="${id}"]`);
  if (bubble) {
    const footer = bubble.querySelector('.chat-bubble-footer');
    if (footer && !bubble.querySelector('.chat-deleted-badge')) {
      const badge = document.createElement('span');
      badge.className = 'chat-deleted-badge';
      badge.textContent = 'Dihapus';
      footer.prepend(badge);
    }
    appendLog('warning', `[Anti-Delete] Pesan ${id} dihapus di WhatsApp, tetapi dipertahankan di dashboard.`);
  }
});

socket.on('ai:decision', (data) => {
  appendLog('success', `[AI] Analysis: mood=${data.analysis.mood}, sending reactions via ${data.reactionCount} accounts`);
});

socket.on('reaction:sent', (data) => {
  appendLog('success', `[React] Reaction ${data.emoji} sent from "${data.accountName}"`);
});

socket.on('reaction:failed', (data) => {
  appendLog('error', `[React] Failed reaction from ${data.accountId}: ${data.error}`);
});

socket.on('log:error', (data) => {
  appendLog('error', `[Error] ${data.message}`);
});

socket.on('debug:message', (msg) => {
  addDebugRow(msg);
});

// ── Refresh / Fetch ────────────────────────────────────────────────────────
async function refreshAll() {
  await fetchConfig();
  await fetchStatus();
  renderAccounts();
  renderChannels();
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    state.config = await res.json();
    state.accounts = state.config.accounts;
    state.channels = state.config.channels;

    // Prefill settings inputs
    if (state.config.geminiApiKeys && state.config.geminiApiKeys.length > 0) {
      DOM.inputApikey.value = state.config.geminiApiKeys.join('\n');
    } else {
      DOM.inputApikey.value = state.config.geminiApiKeySet ? '********' : '';
    }
    DOM.inputPolling.value = state.config.pollingIntervalSeconds;
    DOM.toggleDebug.checked = state.config.debugMode;
    DOM.toggleDebugText.textContent = state.config.debugMode ? 'Aktif' : 'Nonaktif';
    DOM.debugModeNotice.style.display = state.config.debugMode ? 'block' : 'none';

    // Silent hours prefill
    DOM.silentStart.value = state.config.silentStart !== undefined ? state.config.silentStart : 23;
    DOM.silentEnd.value = state.config.silentEnd !== undefined ? state.config.silentEnd : 6;
    DOM.silentMultiplier.value = state.config.silentMultiplier !== undefined ? state.config.silentMultiplier : 4;

    // Set QR listeners for any existing accounts
    state.accounts.forEach((acc) => {
      socket.off(`qr:${acc.id}`);
      socket.on(`qr:${acc.id}`, ({ qrDataUrl }) => {
        if (state.selectedAccountIdForQr === acc.id) {
          DOM.qrLoading.style.display = 'none';
          DOM.qrImage.src = qrDataUrl;
          DOM.qrImage.style.display = 'block';
        }
      });
    });
  } catch (err) {
    console.error('Failed to fetch config', err);
  }
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    // Merge backend WA statuses into config accounts
    data.accounts.forEach((status) => {
      const acc = state.accounts.find((a) => a.id === status.id);
      if (acc) Object.assign(acc, status);
    });
    updateRateLimitUI(data.rateLimit);
  } catch (err) {
    console.error('Failed to fetch status', err);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderAccounts() {
  DOM.accountsGrid.innerHTML = '';
  if (state.accounts.length === 0) {
    document.getElementById('accounts-empty').style.display = 'block';
    return;
  }

  document.getElementById('accounts-empty').style.display = 'none';

  state.accounts.forEach((acc) => {
    const card = document.createElement('div');
    card.className = 'account-card';

    const status = acc.status || 'disconnected';
    const listenerBadge = acc.isListener ? '<span class="status-badge online" style="margin-left: 8px">LISTENER</span>' : '';

    card.innerHTML = `
      <div class="card-header">
        <div class="acc-info">
          <h3>${escapeHtml(acc.name)}</h3>
          <code>${escapeHtml(acc.id)}</code> ${listenerBadge}
        </div>
        <span class="status-badge ${status}">${status.toUpperCase()}</span>
      </div>
      <div class="acc-stats">
        <span>React: <strong>${Math.round(acc.reactProbability * 100)}%</strong></span>
        <span>Delay: <strong>${acc.minDelaySeconds}–${acc.maxDelaySeconds}s</strong></span>
      </div>
      <div class="card-actions">
        ${
          status === 'scanning' || status === 'disconnected' || status === 'error'
            ? `<button class="btn btn-primary btn-xs" onclick="openQrModal('${acc.id}')">Scan QR</button>`
            : ''
        }
        ${
          status === 'connected'
            ? `<button class="btn btn-secondary btn-xs" onclick="logoutAccount('${acc.id}')">Disconnect/Logout</button>`
            : ''
        }
        <button class="btn btn-ghost btn-xs" onclick="openEditAccountModal('${acc.id}')">Edit</button>
        <button class="btn btn-danger btn-xs" onclick="deleteAccount('${acc.id}')">Hapus</button>
        
        <label class="toggle-label" style="margin-left: auto">
          <input type="checkbox" class="toggle-input" ${acc.enabled ? 'checked' : ''} onchange="toggleAccountActive('${acc.id}', this.checked)" />
          <span class="toggle-slider" style="transform: scale(0.8)"></span>
        </label>
      </div>
    `;

    DOM.accountsGrid.appendChild(card);
  });

  // Keep debug force-react dropdown in sync
  populateDebugAccountDropdown();
  lucide.createIcons();
}

function renderChannels() {
  DOM.channelsList.innerHTML = '';
  if (state.channels.length === 0) {
    document.getElementById('channels-empty').style.display = 'block';
    return;
  }

  document.getElementById('channels-empty').style.display = 'none';

  state.channels.forEach((ch) => {
    const item = document.createElement('div');
    item.className = 'channel-item';
    item.innerHTML = `
      <div class="channel-info">
        <h3>${escapeHtml(ch.name)}</h3>
        <code>${escapeHtml(ch.id)}</code>
      </div>
      <div class="channel-actions">
        <label class="toggle-label">
          <input type="checkbox" class="toggle-input" ${ch.enabled ? 'checked' : ''} onchange="toggleChannelActive('${encodeURIComponent(ch.id)}', this.checked)" />
          <span class="toggle-slider"></span>
        </label>
        <button class="btn btn-danger btn-xs" onclick="deleteChannel('${encodeURIComponent(ch.id)}')">Hapus</button>
      </div>
    `;
    DOM.channelsList.appendChild(item);
  });
  lucide.createIcons();
}

// ── Rate Limit UI ──────────────────────────────────────────────────────────
function updateRateLimitUI(statsArray) {
  if (!statsArray) return;
  
  state.rateLimitStats = Array.isArray(statsArray) ? statsArray : [statsArray];
  
  if (state.selectedApiKeyIndex >= state.rateLimitStats.length) {
    state.selectedApiKeyIndex = 0;
  }
  
  renderRateLimitCurrentKey();
}

function renderRateLimitCurrentKey() {
  const stats = state.rateLimitStats[state.selectedApiKeyIndex];
  if (!stats) return;

  const totalKeys = state.rateLimitStats.length;
  DOM.rlKeyIndex.textContent = `${state.selectedApiKeyIndex + 1}/${totalKeys}`;
  DOM.rlKeyMasked.textContent = stats.key || 'default';

  if (totalKeys <= 1) {
    DOM.rlPrevKey.style.opacity = '0.3';
    DOM.rlNextKey.style.opacity = '0.3';
    DOM.rlPrevKey.style.cursor = 'not-allowed';
    DOM.rlNextKey.style.cursor = 'not-allowed';
  } else {
    DOM.rlPrevKey.style.opacity = '1';
    DOM.rlNextKey.style.opacity = '1';
    DOM.rlPrevKey.style.cursor = 'pointer';
    DOM.rlNextKey.style.cursor = 'pointer';
  }

  const rpmPct = (stats.rpm.used / stats.rpm.limit) * 100;
  const rpdPct = (stats.rpd.used / stats.rpd.limit) * 100;

  DOM.rlRpmVal.textContent = `${stats.rpm.used}/${stats.rpm.limit}`;
  DOM.rlRpmBar.style.width = `${Math.min(rpmPct, 100)}%`;
  DOM.rlRpmBar.style.backgroundColor = rpmPct > 80 ? 'var(--error)' : rpmPct > 50 ? 'var(--warning)' : 'var(--primary)';

  DOM.rlRpdVal.textContent = `${stats.rpd.used}/${stats.rpd.limit}`;
  DOM.rlRpdBar.style.width = `${Math.min(rpdPct, 100)}%`;
  DOM.rlRpdBar.style.backgroundColor = rpdPct > 90 ? 'var(--error)' : rpdPct > 70 ? 'var(--warning)' : 'var(--success)';
}

// ── Log Handler ────────────────────────────────────────────────────────────
function appendLog(type, message) {
  const empty = DOM.logList.querySelector('.empty-state');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = `log-item ${type}`;

  const timeStr = new Date().toLocaleTimeString('id-ID', { hour12: false });
  item.innerHTML = `<span class="time">[${timeStr}]</span><span class="msg">${escapeHtml(message)}</span>`;

  DOM.logList.appendChild(item);
  DOM.logList.scrollTop = DOM.logList.scrollHeight;
}

// ── API Actions ────────────────────────────────────────────────────────────

async function saveApiKey() {
  const apiKey = DOM.inputApikey.value.trim();
  if (!apiKey) return;

  DOM.btnSaveApikey.disabled = true;
  DOM.apikeyStatus.className = 'status-msg';
  DOM.apikeyStatus.textContent = '⏳ Memverifikasi semua API key (bisa memakan waktu)...';

  try {
    const res = await fetch('/api/config/apikey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const result = await res.json();
    if (result.ok) {
      DOM.apikeyStatus.className = 'status-msg success';
      DOM.apikeyStatus.innerHTML = result.message.replace(/\n/g, '<br>');
      await refreshAll();
    } else {
      DOM.apikeyStatus.className = 'status-msg error';
      DOM.apikeyStatus.innerHTML = `❌ ${result.error.replace(/\n/g, '<br>')}`;
    }
  } catch (err) {
    DOM.apikeyStatus.className = 'status-msg error';
    DOM.apikeyStatus.textContent = `❌ Gagal menghubungi server: ${err.message}`;
  } finally {
    DOM.btnSaveApikey.disabled = false;
  }
}

async function savePollingInterval() {
  const pollingIntervalSeconds = Number(DOM.inputPolling.value);
  try {
    const res = await fetch('/api/config/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollingIntervalSeconds }),
    });
    const result = await res.json();
    if (result.ok) {
      appendLog('success', `Interval polling diubah ke ${pollingIntervalSeconds} detik`);
      await refreshAll();
    }
  } catch (err) {
    appendLog('error', 'Gagal mengubah interval polling');
  }
}

async function toggleDebugMode() {
  const debugMode = DOM.toggleDebug.checked;
  try {
    const res = await fetch('/api/config/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debugMode }),
    });
    const result = await res.json();
    if (result.ok) {
      DOM.toggleDebugText.textContent = debugMode ? 'Aktif' : 'Nonaktif';
      DOM.debugModeNotice.style.display = debugMode ? 'block' : 'none';
      appendLog('info', `Debug Mode diubah ke: ${debugMode ? 'Aktif' : 'Nonaktif'}`);
      await refreshAll();
    }
  } catch (err) {
    appendLog('error', 'Gagal mengubah debug mode');
  }
}

async function toggleAccountActive(id, enabled) {
  try {
    await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    appendLog('info', `Bot "${id}" status enabled: ${enabled}`);
    await refreshAll();
  } catch (err) {
    appendLog('error', 'Gagal mengubah status aktif bot');
  }
}

async function toggleChannelActive(idEncoded, enabled) {
  try {
    await fetch(`/api/channels/${idEncoded}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    appendLog('info', `Saluran status enabled: ${enabled}`);
    await refreshAll();
  } catch (err) {
    appendLog('error', 'Gagal mengubah status aktif saluran');
  }
}

// ── Modals: QR ─────────────────────────────────────────────────────────────
window.openQrModal = async function (id) {
  state.selectedAccountIdForQr = id;
  const acc = state.accounts.find((a) => a.id === id);
  DOM.qrModalTitle.textContent = `Scan QR: ${acc.name}`;

  DOM.qrLoading.style.display = 'block';
  DOM.qrImage.style.display = 'none';
  DOM.qrStatusText.textContent = 'Status: CONNECTING...';
  DOM.qrModal.style.display = 'flex';

  try {
    // Request reconnect to trigger fresh QR if disconnected
    await fetch(`/api/accounts/${id}/reconnect`, { method: 'POST' });

    // Try fetching existing QR if already available
    const res = await fetch(`/api/accounts/${id}/qr`);
    if (res.status === 200) {
      const data = await res.json();
      if (data.qrDataUrl) {
        DOM.qrLoading.style.display = 'none';
        DOM.qrImage.src = data.qrDataUrl;
        DOM.qrImage.style.display = 'block';
      }
    }
  } catch (err) {
    console.error('Failed to trigger QR load', err);
  }
};

function closeQrModal() {
  state.selectedAccountIdForQr = null;
  DOM.qrModal.style.display = 'none';
  DOM.qrImage.src = '';
}

window.logoutAccount = async function (id) {
  if (!confirm('Apakah kamu yakin ingin logout/disconnect? Sesi di server akan dihapus dan harus scan QR ulang.')) return;
  try {
    await fetch(`/api/accounts/${id}/logout`, { method: 'POST' });
    appendLog('info', `Request logout bot "${id}" dikirim`);
    await refreshAll();
  } catch (err) {
    appendLog('error', 'Gagal logout account');
  }
};

// ── Modals: Add Account ────────────────────────────────────────────────────
function openAddAccountModal() {
  DOM.addAccountModal.style.display = 'flex';
}

function closeAddAccountModal() {
  DOM.addAccountModal.style.display = 'none';
  document.getElementById('add-account-error').style.display = 'none';
  document.getElementById('new-acc-id').value = '';
  document.getElementById('new-acc-name').value = '';
}

async function submitAddAccount() {
  const id = document.getElementById('new-acc-id').value.trim();
  const name = document.getElementById('new-acc-name').value.trim();
  const reactProbability = parseFloat(document.getElementById('new-acc-prob').value);
  const minDelaySeconds = parseInt(document.getElementById('new-acc-min-delay').value);
  const maxDelaySeconds = parseInt(document.getElementById('new-acc-max-delay').value);

  const errEl = document.getElementById('add-account-error');
  errEl.style.display = 'none';

  if (!id || !name) {
    errEl.textContent = 'ID Akun dan Nama Tampilan wajib diisi';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, reactProbability, minDelaySeconds, maxDelaySeconds }),
    });
    const result = await res.json();
    if (result.ok) {
      closeAddAccountModal();
      await refreshAll();
      appendLog('success', `Bot "${name}" berhasil ditambahkan`);
      openQrModal(id);
    } else {
      errEl.textContent = result.error;
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = `Gagal menyimpan: ${err.message}`;
    errEl.style.display = 'block';
  }
}

window.deleteAccount = async function (id) {
  if (!confirm(`Hapus bot "${id}"? Seluruh sesi dan log bot ini akan terhapus permanen.`)) return;
  try {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      appendLog('info', `Bot "${id}" dihapus`);
      await refreshAll();
    }
  } catch (err) {
    appendLog('error', `Gagal menghapus bot: ${err.message}`);
  }
};

// ── Modals: Edit Account ───────────────────────────────────────────────────
window.openEditAccountModal = function (id) {
  const acc = state.accounts.find((a) => a.id === id);
  if (!acc) return;

  document.getElementById('edit-acc-id').value = acc.id;
  document.getElementById('edit-acc-name').value = acc.name;
  document.getElementById('edit-acc-prob').value = acc.reactProbability;
  document.getElementById('edit-acc-min-delay').value = acc.minDelaySeconds;
  document.getElementById('edit-acc-max-delay').value = acc.maxDelaySeconds;

  DOM.editAccountModal.style.display = 'flex';
};

function closeEditAccountModal() {
  DOM.editAccountModal.style.display = 'none';
  document.getElementById('edit-account-error').style.display = 'none';
}

async function submitEditAccount() {
  const id = document.getElementById('edit-acc-id').value;
  const name = document.getElementById('edit-acc-name').value.trim();
  const reactProbability = parseFloat(document.getElementById('edit-acc-prob').value);
  const minDelaySeconds = parseInt(document.getElementById('edit-acc-min-delay').value);
  const maxDelaySeconds = parseInt(document.getElementById('edit-acc-max-delay').value);

  const errEl = document.getElementById('edit-account-error');
  errEl.style.display = 'none';

  try {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, reactProbability, minDelaySeconds, maxDelaySeconds }),
    });
    const result = await res.json();
    if (result.ok) {
      closeEditAccountModal();
      await refreshAll();
      appendLog('success', `Bot "${name}" berhasil diupdate`);
    } else {
      errEl.textContent = result.error;
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = `Gagal mengupdate: ${err.message}`;
    errEl.style.display = 'block';
  }
}

// ── Modals: Add Channel ────────────────────────────────────────────────────
function openAddChannelModal() {
  DOM.addChannelModal.style.display = 'flex';
}

function closeAddChannelModal() {
  DOM.addChannelModal.style.display = 'none';
  document.getElementById('add-channel-error').style.display = 'none';
  document.getElementById('new-ch-id').value = '';
  document.getElementById('new-ch-name').value = '';
}

async function submitAddChannel() {
  const id = document.getElementById('new-ch-id').value.trim();
  const name = document.getElementById('new-ch-name').value.trim();
  const errEl = document.getElementById('add-channel-error');
  errEl.style.display = 'none';

  if (!id) {
    errEl.textContent = 'Channel JID wajib diisi';
    errEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name }),
    });
    const result = await res.json();
    if (result.ok) {
      closeAddChannelModal();
      await refreshAll();
      appendLog('success', `Saluran "${name || id}" berhasil ditambahkan`);
    } else {
      errEl.textContent = result.error;
      errEl.style.display = 'block';
    }
  } catch (err) {
    errEl.textContent = `Gagal menyimpan: ${err.message}`;
    errEl.style.display = 'block';
  }
}

window.deleteChannel = async function (idEncoded) {
  if (!confirm('Hapus saluran target ini? Bot tidak akan memantau saluran ini lagi.')) return;
  try {
    const res = await fetch(`/api/channels/${idEncoded}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      appendLog('info', 'Saluran dihapus');
      await refreshAll();
    }
  } catch (err) {
    appendLog('error', `Gagal menghapus saluran: ${err.message}`);
  }
};

// ── Debug Logs ─────────────────────────────────────────────────────────────
async function loadRecentLogs() {
  try {
    const res = await fetch('/api/reactions?limit=50');
    const data = await res.json();
    if (data.length > 0) {
      DOM.logList.innerHTML = '';
      data.reverse().forEach((r) => {
        const timeStr = new Date(r.sent_at * 1000).toLocaleTimeString('id-ID', { hour12: false });
        const type = r.success ? 'success' : 'error';
        const msg = r.success
          ? `[React] Reaction ${r.emoji} sent from "${r.account_id}"`
          : `[React] Failed reaction from ${r.account_id}: ${r.error_msg}`;
        const item = document.createElement('div');
        item.className = `log-item ${type}`;
        item.innerHTML = `<span class="time">[${timeStr}]</span><span class="msg">${escapeHtml(msg)}</span>`;
        DOM.logList.appendChild(item);
      });
      DOM.logList.scrollTop = DOM.logList.scrollHeight;
    }
  } catch (err) {
    console.error('Failed to load logs', err);
  }
}

async function loadRecentDebugMessages() {
  try {
    const res = await fetch('/api/debug/messages?limit=100');
    const data = await res.json();
    if (data.length > 0) {
      DOM.debugTbody.innerHTML = '';
      data.forEach((msg) => addDebugRow(msg));
    }
  } catch (err) {
    console.error('Failed to load debug messages', err);
  }
}

function addDebugRow(msg) {
  // Remove empty row if exists
  const empty = DOM.debugTbody.querySelector('.table-empty');
  if (empty) empty.remove();

  const tr = document.createElement('tr');
  const time = new Date(msg.received_at * 1000 || Date.now()).toLocaleTimeString('id-ID', { hour12: false });

  let serverId = '';
  try {
    const rawKey = JSON.parse(msg.raw || '{}');
    serverId = rawKey.server_id || '';
  } catch {}

  tr.innerHTML = `
    <td>${time}</td>
    <td style="font-family: var(--font-mono); font-size:12px;">${escapeHtml(msg.jid)}</td>
    <td><span class="status-badge online" style="font-size:10px;">${escapeHtml(msg.contentType.toUpperCase())}</span></td>
    <td style="max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(msg.preview)}">${escapeHtml(msg.preview)}</td>
    <td style="display: flex; gap: 4px;">
      <button class="btn btn-secondary btn-xs" onclick="useDebugJid('${escapeHtml(msg.jid)}')">Gunakan</button>
      <button class="btn btn-primary btn-xs" onclick="useDebugForReact('${escapeHtml(msg.jid)}', '${escapeHtml(msg.messageId)}', '${escapeHtml(serverId)}')">Test React</button>
    </td>
  `;
  DOM.debugTbody.insertBefore(tr, DOM.debugTbody.firstChild);
}

window.useDebugJid = function (jid) {
  openAddChannelModal();
  document.getElementById('new-ch-id').value = jid;
  document.getElementById('new-ch-name').value = 'Saluran Acell';
};

window.useDebugForReact = function (jid, messageId, serverId) {
  // Switch to debug tab if needed
  switchTab('debug');

  DOM.debugReactJid.value = jid;
  DOM.debugReactMsgId.value = messageId;
  DOM.debugReactServerId.value = serverId || '';

  // Scroll to test panel and highlight it
  const testPanel = document.querySelector('.settings-card[style*="rgba(245, 158, 11"]');
  if (testPanel) {
    testPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    testPanel.style.transform = 'scale(1.02)';
    testPanel.style.borderColor = 'var(--primary)';
    setTimeout(() => {
      testPanel.style.transform = 'scale(1)';
      testPanel.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    }, 500);
  }
};

async function clearDebugLogs() {
  try {
    await fetch('/api/debug/messages', { method: 'DELETE' });
    DOM.debugTbody.innerHTML = '<tr><td colspan="5" class="table-empty">Belum ada pesan debug.</td></tr>';
    appendLog('info', 'Debug messages cleared from database');
  } catch (err) {
    appendLog('error', 'Gagal membersihkan debug messages');
  }
}

// ── Force React Debug ───────────────────────────────────────────────────────
function populateDebugAccountDropdown() {
  if (!DOM.debugReactAccount) return;
  const connected = state.accounts.filter((a) => a.status === 'connected');
  DOM.debugReactAccount.innerHTML = connected.length
    ? connected.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} (${escapeHtml(a.id)})</option>`).join('')
    : '<option value="">— Tidak ada akun terhubung —</option>';
}

async function forceReact() {
  const accountId = DOM.debugReactAccount.value;
  const channelJid = DOM.debugReactJid.value.trim();
  const messageId = DOM.debugReactMsgId.value.trim();
  const serverId = DOM.debugReactServerId.value.trim();
  const emoji = DOM.debugReactEmoji.value.trim();
  const resultEl = DOM.debugReactResult;

  if (!accountId || !channelJid || !messageId || !emoji) {
    resultEl.className = 'status-msg error';
    resultEl.textContent = '❌ ID Akun, Channel JID, Message ID, dan Emoji wajib diisi';
    return;
  }

  DOM.btnDebugReact.disabled = true;
  resultEl.className = 'status-msg';
  resultEl.textContent = '⏳ Mengirim reaction...';

  try {
    const res = await fetch('/api/debug/send-reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, channelJid, messageId, serverId, emoji }),
    });
    const data = await res.json();
    if (data.ok) {
      resultEl.className = 'status-msg success';
      resultEl.textContent = `✅ ${data.message}`;
      appendLog('success', `[ForceReact] ${emoji} sent from ${accountId} to msg ${messageId} (server_id: ${serverId || 'none'})`);
    } else {
      resultEl.className = 'status-msg error';
      resultEl.textContent = `❌ ${data.error}`;
    }
  } catch (err) {
    resultEl.className = 'status-msg error';
    resultEl.textContent = `❌ Network error: ${err.message}`;
  } finally {
    DOM.btnDebugReact.disabled = false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Custom Silent Hours ──────────────────────────────────────────────────────
async function saveSilentHours() {
  const silentStart = parseInt(DOM.silentStart.value);
  const silentEnd = parseInt(DOM.silentEnd.value);
  const silentMultiplier = parseInt(DOM.silentMultiplier.value);

  DOM.btnSaveSilent.disabled = true;
  try {
    const res = await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ silentStart, silentEnd, silentMultiplier }),
    });
    const data = await res.json();
    if (data.ok) {
      appendLog('success', `Jam Tidur diupdate: ${silentStart}:00 s/d ${silentEnd}:00 WIB (${silentMultiplier}x delay)`);
      alert('Jam Tidur berhasil disimpan!');
    } else {
      alert(`Gagal menyimpan: ${data.error}`);
    }
  } catch (err) {
    alert(`Network error: ${err.message}`);
  } finally {
    DOM.btnSaveSilent.disabled = false;
  }
}

async function loadChatHistory() {
  const channelId = state.selectedChannelIdForChat;
  if (!channelId) return;

  DOM.chatHistoryBody.innerHTML = '<div class="empty-state"><i data-lucide="loader-2" class="animate-spin" style="margin-bottom:12px;"></i><p>Memuat riwayat chat...</p></div>';
  lucide.createIcons();
  try {
    const res = await fetch('/api/posts');
    const allPosts = await res.json();
    
    // Filter posts for this specific channel
    const posts = allPosts.filter((p) => p.channel_id === channelId);
    
    // Sort chronological (oldest first for display)
    posts.reverse();

    DOM.chatCountLabel.textContent = `${posts.length} Postingan Tersimpan`;

    if (posts.length === 0) {
      DOM.chatHistoryBody.innerHTML = `
        <div class="empty-state">
          <i data-lucide="message-square" class="empty-state-icon"></i>
          <p>Belum ada postingan saluran. Aktifkan bot dan tunggu postingan baru.</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    DOM.chatHistoryBody.innerHTML = '';
    
    // Centered wrapper for chat bubbles
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-body-wrapper';

    posts.forEach((post) => {
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble acell';
      bubble.setAttribute('data-post-id', post.id);

      const dt = new Date(post.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const isStarred = post.is_starred === 1;

      const actionsHtml = `
        <div class="chat-bubble-actions">
          <button class="chat-star-btn ${isStarred ? 'starred' : ''}" onclick="toggleStar('${encodeURIComponent(post.id)}')" title="${isStarred ? 'Batal Bintangi' : 'Bintangi (Simpan Permanen)'}">
            <i data-lucide="star" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      `;

      let mediaHtml = '';
      if (post.media_path) {
        const mediaUrl = `/media_cache/${post.id}_${post.content_type}`;
        if (post.content_type === 'image') {
          mediaHtml = `<div class="chat-bubble-media"><a href="${mediaUrl}" target="_blank"><img src="${mediaUrl}" alt="Media Post" /></a></div>`;
        } else if (post.content_type === 'video') {
          mediaHtml = `<div class="chat-bubble-media"><video controls src="${mediaUrl}"></video></div>`;
        } else if (post.content_type === 'audio') {
          mediaHtml = `
            <div class="chat-bubble-audio">
              <span class="audio-icon"><i data-lucide="mic" style="width: 18px; height: 18px; color: var(--primary);"></i></span>
              <audio controls src="${mediaUrl}"></audio>
            </div>`;
        } else if (post.content_type === 'sticker') {
          mediaHtml = `<div class="chat-bubble-media"><img src="${mediaUrl}" style="max-height: 120px; max-width: 120px; background: transparent;" /></div>`;
        }
      }

      let reactionsHtml = '';
      if (post.reactions_sent) {
        try {
          const reactions = JSON.parse(post.reactions_sent);
          if (reactions.length > 0) {
            reactionsHtml = '<div class="chat-bubble-reactions">';
            reactions.forEach((r) => {
              reactionsHtml += `
                <div class="reaction-chip" title="Dikirim oleh ${escapeHtml(r.name)} (${r.accountId})">
                  <span>${r.emoji}</span>
                  <span class="reaction-bot-name">${escapeHtml(r.name)}</span>
                </div>
              `;
            });
            reactionsHtml += '</div>';
          }
        } catch (e) {}
      }

      const deletedBadge = post.is_deleted === 1 ? '<span class="chat-deleted-badge" style="margin-right: 6px;">Dihapus</span>' : '';

      bubble.innerHTML = `
        <div class="chat-bubble-header">
          <span>Acell Saluran</span>
          ${actionsHtml}
        </div>
        ${mediaHtml}
        ${post.text_content ? `<div class="chat-bubble-text" style="text-align: left; white-space: pre-wrap; word-break: break-word;">${escapeHtml(post.text_content)}</div>` : ''}
        ${post.caption ? `<div class="chat-bubble-caption" style="text-align: left; margin-top: 4px; font-size: 13.5px; opacity: 0.95; white-space: pre-wrap; word-break: break-word;">${escapeHtml(post.caption)}</div>` : ''}
        <div class="chat-bubble-footer">
          ${deletedBadge}
          <span class="chat-time">${dt}</span>
        </div>
        ${reactionsHtml}
      `;

      wrapper.appendChild(bubble);
    });

    DOM.chatHistoryBody.appendChild(wrapper);
    lucide.createIcons();

    // Auto-scroll chat body to the bottom
    setTimeout(() => {
      DOM.chatHistoryBody.scrollTop = DOM.chatHistoryBody.scrollHeight;
    }, 100);
  } catch (err) {
    console.error('Failed to load chat history', err);
    DOM.chatHistoryBody.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle" style="color:var(--error); margin-bottom:12px;"></i><p style="color:var(--error)">Gagal memuat chat: ${err.message}</p></div>`;
    lucide.createIcons();
  }
}

// ── Starred Media Gallery ────────────────────────────────────────────────────
async function loadMediaGallery() {
  const channelId = state.selectedChannelIdForGallery;
  if (!channelId) return;

  DOM.mediaGalleryGrid.innerHTML = '<div class="empty-state"><i data-lucide="loader-2" class="animate-spin" style="margin-bottom:12px;"></i><p>Memuat galeri media...</p></div>';
  lucide.createIcons();

  try {
    const res = await fetch('/api/posts');
    const allPosts = await res.json();

    // Filter media posts belonging to this channel
    const posts = allPosts.filter(
      (p) => p.channel_id === channelId && p.media_path
    );

    if (posts.length === 0) {
      DOM.mediaGalleryGrid.innerHTML = `
        <div class="empty-state">
          <i data-lucide="image" class="empty-state-icon"></i>
          <p>Belum ada media (Foto/Video/Audio/Stiker) di saluran ini.</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    DOM.mediaGalleryGrid.innerHTML = '';
    posts.forEach((post) => {
      const item = document.createElement('div');
      item.className = 'media-gallery-card';
      item.setAttribute('data-media-id', post.id);

      const dt = new Date(post.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const mediaUrl = `/media_cache/${post.id}_${post.content_type}`;
      const isStarred = post.is_starred === 1;

      let mediaWrapperHtml = '';
      if (post.content_type === 'image' || post.content_type === 'sticker') {
        mediaWrapperHtml = `<a href="${mediaUrl}" target="_blank"><img src="${mediaUrl}" alt="Media File" /></a>`;
      } else if (post.content_type === 'video') {
        mediaWrapperHtml = `<video src="${mediaUrl}" controls preload="metadata"></video>`;
      } else if (post.content_type === 'audio') {
        mediaWrapperHtml = `
          <div class="gallery-vn-container">
            <div class="gallery-vn-icon-wrapper">
              <i data-lucide="mic" style="width:24px; height:24px; color:var(--primary);"></i>
              <span style="font-size:12px; font-weight:600; color:var(--text-muted);">VN</span>
            </div>
            <audio controls src="${mediaUrl}"></audio>
          </div>`;
      }

      item.innerHTML = `
        <div class="media-gallery-wrapper" style="position:relative;">
          ${mediaWrapperHtml}
          <button class="gallery-star-btn ${isStarred ? 'starred' : ''}" onclick="toggleStar('${encodeURIComponent(post.id)}', true)" title="${isStarred ? 'Hapus dari Bintang' : 'Bintangi (Simpan Permanen)'}" style="color: ${isStarred ? '#f59e0b' : '#8696a0'}">
            <i data-lucide="star" style="width:16px; height:16px;"></i>
          </button>
        </div>
        <div class="media-gallery-info">
          <div class="media-gallery-caption">${escapeHtml(post.caption || post.text_content || `[Berkas ${post.content_type.toUpperCase()}]`)}</div>
          <div class="media-gallery-meta">
            <span>Tipe: <strong>${post.content_type.toUpperCase()}</strong></span>
            <span>${dt}</span>
          </div>
        </div>
      `;

      DOM.mediaGalleryGrid.appendChild(item);
    });

    // Render all icons inside cards
    lucide.createIcons();

  } catch (err) {
    console.error('Failed to load media gallery', err);
    DOM.mediaGalleryGrid.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle" style="color:var(--error); margin-bottom:12px;"></i><p style="color:var(--error)">Gagal memuat galeri: ${err.message}</p></div>`;
    lucide.createIcons();
  }
}

// Toggle post star status
window.toggleStar = async function (id, fromGallery = false) {
  try {
    const res = await fetch(`/api/posts/${id}/star`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      if (fromGallery) {
        // If from media gallery, update gallery and obrolan bubble (if loaded)
        loadMediaGallery();
        const bubble = document.querySelector(`[data-post-id="${decodeURIComponent(id)}"]`);
        if (bubble) {
          const starBtn = bubble.querySelector('.chat-star-btn');
          if (starBtn) {
            starBtn.classList.toggle('starred', data.is_starred);
          }
        }
      } else {
        // Refresh chat bubble
        const bubble = document.querySelector(`[data-post-id="${decodeURIComponent(id)}"]`);
        if (bubble) {
          const starBtn = bubble.querySelector('.chat-star-btn');
          if (starBtn) {
            starBtn.classList.toggle('starred', data.is_starred);
            starBtn.title = data.is_starred ? 'Batal Bintangi' : 'Bintangi (Simpan Permanen)';
          }
        }
        // If drawer is open, refresh drawer
        if (DOM.starredDrawer.style.display === 'block') {
          loadStarredDrawer();
        }
        appendLog('info', `Pesan ${decodeURIComponent(id)} ${data.is_starred ? 'dibintangi (disimpan permanen)' : 'batal dibintangi'}`);
      }
    }
  } catch (err) {
    console.error('Failed to toggle star', err);
  }
};

// ── Render Channel Selector Lists ─────────────────────────────────────────────
function renderChannelSelectors(type) {
  const container = type === 'chat' ? DOM.chatChannelList : DOM.galleryChannelList;
  container.innerHTML = '';

  if (state.channels.length === 0) {
    container.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">Belum ada saluran target. Tambahkan di tab Saluran.</div>';
    return;
  }

  state.channels.forEach((ch) => {
    const item = document.createElement('div');
    const isSelected = type === 'chat' 
      ? state.selectedChannelIdForChat === ch.id 
      : state.selectedChannelIdForGallery === ch.id;

    item.className = `sub-sidebar-item ${isSelected ? 'active' : ''}`;
    item.innerHTML = `
      <span class="sub-sidebar-item-name">${escapeHtml(ch.name || 'Saluran Tanpa Nama')}</span>
      <span class="sub-sidebar-item-jid">${escapeHtml(ch.id)}</span>
    `;

    item.addEventListener('click', () => {
      if (type === 'chat') {
        selectChannelForChat(ch.id, ch.name);
      } else {
        selectChannelForGallery(ch.id, ch.name);
      }
    });

    container.appendChild(item);
  });
}

function selectChannelForChat(id, name) {
  state.selectedChannelIdForChat = id;
  renderChannelSelectors('chat');
  
  DOM.chatEmptyView.style.display = 'none';
  DOM.chatActiveView.style.display = 'flex';
  DOM.activeChatTitle.textContent = `💬 Feed ${name || 'Saluran'}`;
  
  loadChatHistory();
}

function selectChannelForGallery(id, name) {
  state.selectedChannelIdForGallery = id;
  renderChannelSelectors('gallery');

  DOM.galleryEmptyView.style.display = 'none';
  DOM.galleryActiveView.style.display = 'flex';
  DOM.activeGalleryTitle.textContent = `🖼️ Album Media ${name || 'Saluran'}`;

  loadMediaGallery();
}

// ── Starred Messages Drawer ──────────────────────────────────────────────────
async function loadStarredDrawer() {
  const channelId = state.selectedChannelIdForChat;
  if (!channelId) return;

  DOM.starredDrawerBody.innerHTML = '<div class="empty-state"><i data-lucide="loader-2" class="animate-spin" style="margin-bottom:12px;"></i><p>Memuat pesan berbintang...</p></div>';
  lucide.createIcons();
  try {
    const res = await fetch('/api/posts/starred');
    const starredPosts = await res.json();

    // Filter by channel
    const posts = starredPosts.filter((p) => p.channel_id === channelId);

    if (posts.length === 0) {
      DOM.starredDrawerBody.innerHTML = `
        <div class="empty-state">
          <i data-lucide="star" class="empty-state-icon"></i>
          <p>Belum ada pesan berbintang di saluran ini.</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    DOM.starredDrawerBody.innerHTML = '';
    posts.forEach((post) => {
      const card = document.createElement('div');
      card.className = 'drawer-card';

      const dt = new Date(post.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const preview = post.text_content || post.caption || `[Berkas ${post.content_type.toUpperCase()}]`;

      card.innerHTML = `
        <div class="drawer-card-header">
          <span>${post.content_type.toUpperCase()}</span>
          <span>${dt}</span>
        </div>
        <div class="drawer-card-body">${escapeHtml(preview)}</div>
        <button class="btn btn-ghost btn-xs btn-flex" onclick="toggleStar('${encodeURIComponent(post.id)}')" style="align-self: flex-end; padding:2px 8px; font-size:11px; margin-top:4px;"><i data-lucide="star-off" style="width:11px; height:11px;"></i> Batal Bintang</button>
      `;

      DOM.starredDrawerBody.appendChild(card);
    });
    lucide.createIcons();
  } catch (err) {
    console.error('Failed to load starred drawer', err);
    DOM.starredDrawerBody.innerHTML = '<div class="empty-state"><i data-lucide="alert-triangle" style="color:var(--error); margin-bottom:12px;"></i><p style="color:var(--error)">Gagal memuat</p></div>';
    lucide.createIcons();
  }
}

function closeStarredDrawer() {
  DOM.starredDrawerContent.style.right = '-400px';
  setTimeout(() => {
    DOM.starredDrawer.style.display = 'none';
  }, 300);
}
