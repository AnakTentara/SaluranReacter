// Main frontend logic using plain JS & Socket.io

const socket = io();

// ── App State ──────────────────────────────────────────────────────────────
const state = {
  accounts: [],
  channels: [],
  config: null,
  activeTab: 'accounts',
  selectedAccountIdForQr: null,
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
};

// ── Init App ───────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await refreshAll();
  appendLog('system', 'Dashboard initialized and connected to server');

  // Load recent logs and debug messages from API
  loadRecentLogs();
  loadRecentDebugMessages();
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
}

function switchTab(tab) {
  state.activeTab = tab;
  DOM.navBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  DOM.panels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
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
      <div class="acc-personality">${escapeHtml(acc.personality)}</div>
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
}

// ── Rate Limit UI ──────────────────────────────────────────────────────────
function updateRateLimitUI(stats) {
  if (!stats) return;
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
  const personality = document.getElementById('new-acc-personality').value.trim();
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
      body: JSON.stringify({ id, name, personality, reactProbability, minDelaySeconds, maxDelaySeconds }),
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
  document.getElementById('edit-acc-personality').value = acc.personality;
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
  const personality = document.getElementById('edit-acc-personality').value.trim();
  const reactProbability = parseFloat(document.getElementById('edit-acc-prob').value);
  const minDelaySeconds = parseInt(document.getElementById('edit-acc-min-delay').value);
  const maxDelaySeconds = parseInt(document.getElementById('edit-acc-max-delay').value);

  const errEl = document.getElementById('edit-account-error');
  errEl.style.display = 'none';

  try {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, personality, reactProbability, minDelaySeconds, maxDelaySeconds }),
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
