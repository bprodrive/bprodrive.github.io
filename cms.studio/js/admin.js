// =============================================================
// admin.js — VERSI PERBAIKAN (pengganti langsung js/admin.js)
//
// Urutan <script> di cms.studio/index.html (SEBELUM </body>):
//   <script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"></script>
//   <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
//   <script src="js/default-data.js"></script>   <- berisi const DEFAULT_CMS_DATA = {...};
//   <script src="js/admin.js"></script>
// =============================================================
'use strict';

/* =============================================================
   0. UTIL (escape, sanitasi, URL aman)
   ============================================================= */
const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));

const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='100%' height='100%' fill='#1b1a20'/></svg>");

/** Escape teks untuk disisipkan ke HTML (konten & atribut). */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Hanya izinkan http(s). Menolak javascript:, data:, dsb. */
function safeUrl(u) {
  const s = String(u ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

function extractYtId(url) {
  if (!url) return '';
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return m ? m[1] : '';
}

/** Sumber thumbnail aman untuk satu item portofolio. */
function thumbSrc(item) {
  const img = safeUrl(item.imageUrl);
  if (img) return img;
  const id = extractYtId(item.videoUrl);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : PLACEHOLDER_IMG;
}

const INLINE_TAGS = ['strong', 'em', 'b', 'i', 'br'];
const ARTICLE_TAGS = ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'em', 'b', 'i', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'];
let purifyHookAdded = false;

/** Sanitasi HTML dengan DOMPurify. Jika DOMPurify tidak termuat: gagal aman (tampil sebagai teks). */
function sanitizeHTML(html, tags) {
  if (!window.DOMPurify) return esc(html);
  if (!purifyHookAdded) {
    DOMPurify.addHook('afterSanitizeAttributes', (n) => {
      if (n.tagName === 'A' && n.getAttribute('target') === '_blank') n.setAttribute('rel', 'noopener noreferrer');
    });
    purifyHookAdded = true;
  }
  return DOMPurify.sanitize(String(html ?? ''), {
    ALLOWED_TAGS: tags || INLINE_TAGS,
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i
  });
}

/** lucide boleh gagal dimuat (CDN down) tanpa mematikan seluruh aplikasi. */
function refreshIcons() {
  try { if (window.lucide) lucide.createIcons(); } catch (e) { console.warn('lucide:', e); }
}

function uid(prefix) {
  const r = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}${r}`;
}

function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =============================================================
   1. AUTENTIKASI & KEAMANAN
   CATATAN: login sisi-klien hanyalah penghalang tampilan. Pengaman
   nyata adalah token GitHub (izin terbatas) + idealnya Cloudflare Access.
   ============================================================= */
const AUTH_CONFIG_KEY = 'bayu_cms_auth_config';
const AUTH_SESSION_KEY = 'bayu_cms_session_token';
const AUTH_FAILED_ATTEMPTS_KEY = 'bayu_cms_failed_attempts';
const AUTH_LOCKOUT_UNTIL_KEY = 'bayu_cms_lockout_until';

const PBKDF2_ITER = 210000;
const MIN_PASSWORD_LEN = 10;
const DEFAULT_AUTOLOCK_MIN = 30;
const SESSION_HOURS = 8;
const REMEMBER_DAYS = 7;

let inactivityTimer = null;
let activityListenersBound = false;
let adminActive = false;

const toB64 = (buf) => { let s = ''; new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** SHA-256 polos: HANYA untuk memverifikasi hash lama (migrasi). */
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}

function safeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Tidak ada lagi kredensial bawaan: null bila belum pernah dibuat. */
function getAuthConfig() {
  try {
    const raw = localStorage.getItem(AUTH_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function hasAuthConfig() {
  const c = getAuthConfig();
  return !!(c && c.username && (c.hash || c.passwordHash));
}

async function createAuthConfig(username, password, autoLockMinutes) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITER);
  return {
    v: 2,
    username,
    salt: toB64(salt),
    hash: toB64(bits),
    iter: PBKDF2_ITER,
    autoLockMinutes: autoLockMinutes ?? DEFAULT_AUTOLOCK_MIN
  };
}

async function verifyPassword(config, username, password) {
  if (!config) return false;
  let passOk = false;
  if (config.hash && config.salt) {
    const a = new Uint8Array(await pbkdf2(password, fromB64(config.salt), config.iter || PBKDF2_ITER));
    const b = fromB64(config.hash);
    let d = a.length ^ b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a[i] ^ b[i];
    passOk = d === 0;
  } else if (config.passwordHash) {
    // hash SHA-256 lama; akan di-upgrade otomatis ke PBKDF2 setelah login berhasil
    passOk = safeEqualStr(await sha256(password), config.passwordHash);
  }
  return passOk && username === config.username;
}

function isSessionValid() {
  if (!hasAuthConfig()) return false;
  const token = sessionStorage.getItem(AUTH_SESSION_KEY) || localStorage.getItem(AUTH_SESSION_KEY);
  if (!token) return false;
  try {
    const payload = JSON.parse(token);
    if (!payload.expiresAt || Date.now() > payload.expiresAt) {
      clearAuthSession();
      return false;
    }
    return true;
  } catch (e) {
    clearAuthSession();
    return false;
  }
}

function clearAuthSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function setAuthSession(username, remember = false) {
  const duration = remember ? REMEMBER_DAYS * 24 * 3600 * 1000 : SESSION_HOURS * 3600 * 1000;
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const data = { username, token: rnd, loginTime: Date.now(), expiresAt: Date.now() + duration };
  (remember ? localStorage : sessionStorage).setItem(AUTH_SESSION_KEY, JSON.stringify(data));
}

/* ----- Auto-lock: listener dipasang SEKALI; timer hanya jalan saat panel aktif ----- */
function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (!adminActive) return;
  const cfg = getAuthConfig() || {};
  const minutes = cfg.autoLockMinutes ?? DEFAULT_AUTOLOCK_MIN;
  if (minutes <= 0) return;
  inactivityTimer = setTimeout(() => handleInactivityLockout(minutes), minutes * 60 * 1000);
}

function handleInactivityLockout(minutes) {
  lockSession();
  showToast(`Sesi otomatis dikunci karena tidak ada aktivitas selama ${minutes} menit.`, 'warning');
}

/** Kunci sesi + hapus token GitHub dari memori peramban. */
function lockSession() {
  clearAuthSession();
  clearGitHubToken();
  showAuthGateway();
}

function setupActivityListeners() {
  if (!activityListenersBound) {
    ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach((ev) =>
      window.addEventListener(ev, resetInactivityTimer, { passive: true }));
    activityListenersBound = true;
  }
  resetInactivityTimer();
}

function toggleLoginPassword() {
  const input = $('login-password');
  input.type = input.type === 'password' ? 'text' : 'password';
}

/** Mode setup (belum ada akun) vs mode login. */
function applyLoginMode() {
  const setup = !hasAuthConfig();
  const btnText = $('login-btn-text');
  if (btnText) btnText.innerText = setup ? 'Buat Akun Admin' : 'Masuk ke Panel Studio';

  let wrap = $('login-confirm-wrap');
  if (setup && !wrap) {
    wrap = document.createElement('div');
    wrap.id = 'login-confirm-wrap';
    wrap.className = 'space-y-1.5';
    wrap.innerHTML = `
      <label class="text-brand-dim font-medium" for="login-password-confirm">Ulangi Password (min. ${MIN_PASSWORD_LEN} karakter)</label>
      <input type="password" id="login-password-confirm" autocomplete="new-password"
        class="w-full bg-[#141318] border border-brand-border rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-brand-gold text-xs font-mono">`;
    const pw = $('login-password');
    (pw.closest('.space-y-1\\.5') || pw.parentElement).after(wrap);
  } else if (!setup && wrap) {
    wrap.remove();
  }
  $('login-password').autocomplete = setup ? 'new-password' : 'current-password';
}

function showLoginError(message) {
  const box = $('login-error-box');
  const text = $('login-error-text');
  const card = $('login-card');
  if (text) text.textContent = message;
  if (box) box.classList.remove('hidden');
  if (card) {
    card.classList.add('shake-error');
    setTimeout(() => card.classList.remove('shake-error'), 400);
  }
}

/** Tidak ada kredensial bawaan. Fungsi dipertahankan agar HTML lama tidak error. */
function openForgotCredsModal() {
  const ans = prompt(
    'Lupa password?\nKetik RESET untuk menghapus kredensial admin di peramban ini.\n' +
    'Data portofolio TIDAK dihapus; kamu akan diminta membuat password baru.');
  if (ans && ans.trim().toUpperCase() === 'RESET') {
    localStorage.removeItem(AUTH_CONFIG_KEY);
    localStorage.removeItem(AUTH_FAILED_ATTEMPTS_KEY);
    localStorage.removeItem(AUTH_LOCKOUT_UNTIL_KEY);
    clearAuthSession();
    clearGitHubToken();
    applyLoginMode();
    showToast('Kredensial direset. Buat akun admin baru.', 'info');
  }
}
function fillDefaultCredsAndClose() { closeModal('modal-forgot-creds'); }

async function handleLoginSubmit(event) {
  event.preventDefault();

  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  const remember = $('login-remember').checked;
  const errorBox = $('login-error-box');
  const submitBtn = $('login-submit-btn');
  const btnText = $('login-btn-text');

  errorBox.classList.add('hidden');

  const lockoutUntil = parseInt(localStorage.getItem(AUTH_LOCKOUT_UNTIL_KEY) || '0', 10);
  if (lockoutUntil > Date.now()) {
    const sec = Math.ceil((lockoutUntil - Date.now()) / 1000);
    showLoginError(`Terlalu banyak percobaan salah. Silakan tunggu ${sec} detik.`);
    return;
  }

  submitBtn.disabled = true;
  btnText.innerText = 'Memverifikasi Akses...';

  try {
    if (!hasAuthConfig()) {
      // ----- SETUP PERTAMA: tidak ada password bawaan -----
      const confirmVal = $('login-password-confirm') ? $('login-password-confirm').value : '';
      if (!username) { showLoginError('Username wajib diisi.'); return; }
      if (password.length < MIN_PASSWORD_LEN) { showLoginError(`Password minimal ${MIN_PASSWORD_LEN} karakter.`); return; }
      if (password !== confirmVal) { showLoginError('Konfirmasi password tidak cocok.'); return; }

      localStorage.setItem(AUTH_CONFIG_KEY, JSON.stringify(await createAuthConfig(username, password)));
      onLoginSuccess(username, remember, 'Akun admin dibuat. Selamat datang di Studio CMS.');
      return;
    }

    const config = getAuthConfig();
    if (await verifyPassword(config, username, password)) {
      if (!config.hash) {
        // upgrade otomatis dari SHA-256 polos ke PBKDF2 + salt
        const upgraded = await createAuthConfig(config.username, password, config.autoLockMinutes);
        localStorage.setItem(AUTH_CONFIG_KEY, JSON.stringify(upgraded));
      }
      onLoginSuccess(username, remember, 'Autentikasi Berhasil! Selamat datang di Studio CMS.');
    } else {
      const fails = parseInt(localStorage.getItem(AUTH_FAILED_ATTEMPTS_KEY) || '0', 10) + 1;
      localStorage.setItem(AUTH_FAILED_ATTEMPTS_KEY, String(fails));
      if (fails >= 5) {
        const sec = Math.min(30 * 2 ** (fails - 5), 900); // 30s, 60s, 120s ... maks 15 menit
        localStorage.setItem(AUTH_LOCKOUT_UNTIL_KEY, String(Date.now() + sec * 1000));
        showLoginError(`${fails} kali percobaan salah. Akses ditangguhkan selama ${sec} detik.`);
      } else {
        showLoginError(`Username atau password salah! (${5 - fails} percobaan tersisa)`);
      }
    }
  } catch (err) {
    showLoginError('Terjadi kesalahan: ' + err.message + ' (Web Crypto butuh HTTPS atau localhost).');
  } finally {
    submitBtn.disabled = false;
    applyLoginMode();
  }
}

function onLoginSuccess(username, remember, message) {
  localStorage.removeItem(AUTH_FAILED_ATTEMPTS_KEY);
  localStorage.removeItem(AUTH_LOCKOUT_UNTIL_KEY);
  setAuthSession(username, remember);
  $('login-password').value = '';
  if ($('login-password-confirm')) $('login-password-confirm').value = '';
  showAdminApp();
  showToast(message, 'success');
}

function handleLogout() {
  if (confirm('Apakah Anda yakin ingin keluar dari sesi admin?')) {
    lockSession();
    showToast('Sesi Anda telah diakhiri. Berhasil keluar.', 'info');
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const newUsername = $('sec-username').value.trim() || 'admin';
  const newPass = $('sec-new-pass').value;
  const confirmPass = $('sec-confirm-pass').value;

  if (newPass.length < MIN_PASSWORD_LEN) {
    alert(`Password baru minimal ${MIN_PASSWORD_LEN} karakter!`);
    return;
  }
  if (newPass !== confirmPass) {
    alert('Password baru dan konfirmasi tidak cocok!');
    return;
  }

  const old = getAuthConfig() || {};
  const cfg = await createAuthConfig(newUsername, newPass, old.autoLockMinutes);
  localStorage.setItem(AUTH_CONFIG_KEY, JSON.stringify(cfg));
  $('session-username-display').innerText = newUsername;
  $('sec-new-pass').value = '';
  $('sec-confirm-pass').value = '';
  showToast('Username dan Password Admin berhasil diperbarui!', 'success');
}

function showAdminApp() {
  $('login-gateway').classList.add('hidden');
  $('admin-app').classList.remove('hidden');

  const cfg = getAuthConfig() || {};
  const userDisplay = $('session-username-display');
  if (userDisplay) userDisplay.innerText = cfg.username || '';
  const np = $('sec-new-pass');
  if (np) np.placeholder = `Minimal ${MIN_PASSWORD_LEN} karakter`;

  adminActive = true;
  setupActivityListeners();
  initState();
}

function showAuthGateway() {
  adminActive = false;
  if (inactivityTimer) clearTimeout(inactivityTimer);

  $('login-gateway').classList.remove('hidden');
  $('admin-app').classList.add('hidden');
  $('login-password').value = '';

  const cfg = getAuthConfig();
  $('login-username').value = cfg && cfg.username ? cfg.username : '';
  applyLoginMode();
}

/* =============================================================
   2. STATE CMS (DEFAULT_CMS_DATA ada di js/default-data.js)
   ============================================================= */
const STATE_KEY = 'bayu_cms_data';
const STATE_SCHEMA = 2;

let CMS_STATE = {};
let activeFilter = 'all';
let portfolioSearchQuery = '';
let previewBound = false;

/** Gabungkan data tersimpan dengan default TANPA menimpa data pengguna. */
function normalizeState(raw) {
  const d = clone(DEFAULT_CMS_DATA);
  const s = raw && typeof raw === 'object' ? raw : {};
  const sp = s.profile && typeof s.profile === 'object' ? s.profile : {};

  const out = {
    profile: {
      ...d.profile, ...sp,
      facts: { ...d.profile.facts, ...(sp.facts || {}) },
      social: { ...d.profile.social, ...(sp.social || {}) }
    },
    portfolio: Array.isArray(s.portfolio) ? s.portfolio : d.portfolio,
    experienceProjects: Array.isArray(s.experienceProjects) ? s.experienceProjects : d.experienceProjects,
    skills: Array.isArray(s.skills) ? s.skills : d.skills,
    articles: Array.isArray(s.articles) ? s.articles : d.articles,
    settings: { ...d.settings, ...(s.settings || {}) },
    _schema: STATE_SCHEMA
  };
  if (!Array.isArray(out.profile.aboutParagraphs)) out.profile.aboutParagraphs = d.profile.aboutParagraphs;

  const seen = new Set();
  const fixIds = (arr, prefix) => arr.filter((it) => it && typeof it === 'object').map((it) => {
    if (!it.id || seen.has(it.id)) it.id = uid(prefix);
    seen.add(it.id);
    return it;
  });
  out.portfolio = fixIds(out.portfolio, 'pf');
  out.experienceProjects = fixIds(out.experienceProjects, 'ep');
  out.articles = fixIds(out.articles, 'art');
  out.skills = out.skills.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  return out;
}

/** Migrasi SEKALI untuk data versi lama (sebelumnya dijalankan di setiap login dan bisa menghapus data). */
function migrateLegacy(saved) {
  if (saved._schema) return saved;
  const d = DEFAULT_CMS_DATA;
  if (!saved.experienceProjects || saved.experienceProjects.length <= 3) saved.experienceProjects = clone(d.experienceProjects);
  if (!saved.articles || saved.articles.length === 0) saved.articles = clone(d.articles);
  if (!saved.portfolio || saved.portfolio.filter((p) => p.category === 'graphic').length < 8) saved.portfolio = clone(d.portfolio);
  return saved;
}

function postToPreview() {
  const f = $('preview-iframe');
  if (!f || !f.contentWindow) return;
  try {
    const { settings, ...publicState } = CMS_STATE; // pengaturan GitHub tidak perlu dikirim
    f.contentWindow.postMessage({ type: 'CMS_UPDATE', data: publicState }, window.location.origin);
  } catch (e) { /* origin tidak cocok / file:// */ }
}

function initState() {
  let saved = null;
  const raw = localStorage.getItem(STATE_KEY);
  if (raw) {
    try {
      saved = JSON.parse(raw);
    } catch (e) {
      localStorage.setItem(STATE_KEY + '_corrupt_backup', raw); // jangan buang data rusak begitu saja
      showToast('Data lokal rusak. Salinannya disimpan di "' + STATE_KEY + '_corrupt_backup".', 'warning');
    }
  }
  CMS_STATE = normalizeState(saved ? migrateLegacy(saved) : null);
  saveStateToStorage(true);

  $('input-github-token').value = getGitHubToken();
  $('input-github-owner').value = CMS_STATE.settings.githubOwner || 'bprodrive';
  $('input-github-repo').value = CMS_STATE.settings.githubRepo || 'bprodrive.github.io';
  $('input-github-branch').value = CMS_STATE.settings.branch || 'main';
  $('input-github-file').value = CMS_STATE.settings.targetFile || 'index.html';

  const cfg = getAuthConfig();
  const secUsername = $('sec-username');
  if (secUsername && cfg) secUsername.value = cfg.username;

  updateGitHubStatusBadge();
  renderAllViews();

  const previewIframe = $('preview-iframe');
  if (previewIframe && !previewBound) {
    previewIframe.addEventListener('load', postToPreview);
    previewBound = true;
  }
}

function saveStateToStorage(quiet = false) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(CMS_STATE));
    if (!quiet) flashSaveIndicator();
  } catch (e) {
    showToast('Gagal menyimpan ke penyimpanan lokal (penuh/diblokir). Ekspor JSON sekarang!', 'warning');
  }
  postToPreview();
}

function flashSaveIndicator() {
  const pill = $('save-status-pill');
  const text = $('save-status-text');
  if (pill && text) {
    pill.classList.remove('hidden');
    text.innerText = 'Draft Tersimpan Lokal';
    pill.classList.add('border-emerald-500/40', 'bg-emerald-500/10');
    setTimeout(() => pill.classList.remove('border-emerald-500/40', 'bg-emerald-500/10'), 2000);
  }
}

function renderAllViews() {
  renderDashboard();
  populateProfileForm();
  renderPortfolioGrid();
  renderExperienceProjects();
  renderSkills();
  renderArticles();
  updateMetricCounts();
  refreshIcons();
}

/* ----- Navigasi ----- */
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach((el) => el.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));

  const targetPane = $(`tab-${tabId}`);
  const targetNav = $(`nav-${tabId}`);
  if (targetPane) targetPane.classList.remove('hidden');
  if (targetNav) targetNav.classList.add('active');

  const titles = {
    'dashboard': ['Dashboard Overview', 'Ringkasan performa dan pembaruan terkini'],
    'profile': ['Profil & Headline Hero', 'Sunting identitas dan pesan pembuka portofolio'],
    'portfolio': ['Manajemen Portofolio', 'Galeri karya Motion Graphic dan Graphic Design'],
    'experience': ['Karier & Proyek KIAN', 'Daftar riwayat kerja dan detail proyek produksi'],
    'skills': ['Keahlian & Perangkat Lunak', 'Daftar keahlian dan software utama'],
    'articles': ['Artikel & Blog Studio', 'Tulis materi dengan format Markdown siap ekspor'],
    'visual-editor': ['Live Visual Simulator', 'Pratinjau interaktif website langsung dalam simulator'],
    'settings': ['GitHub Sync & Pengaturan', 'Konfigurasi integrasi repository dan keamanan']
  };
  if (titles[tabId]) {
    $('topbar-title').innerText = titles[tabId][0];
    $('topbar-desc').innerText = titles[tabId][1];
  }

  if (tabId === 'visual-editor') postToPreview();
  if (window.innerWidth < 1024) toggleSidebar(false);
  refreshIcons();
}

function toggleSidebar(force) {
  const sb = $('sidebar');
  const bd = $('sidebar-backdrop');
  if (!sb) return;
  const open = typeof force === 'boolean' ? force : sb.classList.contains('-translate-x-full');
  sb.classList.toggle('-translate-x-full', !open);
  if (bd) bd.classList.toggle('hidden', !open);
}

/* =============================================================
   3. DASHBOARD & METRIK
   ============================================================= */
function renderDashboard() {
  const container = $('dashboard-recent-works');
  if (!container) return;
  container.innerHTML = CMS_STATE.portfolio.slice(0, 4).map((item) => `
    <div class="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-brand-border transition group">
      <div class="flex items-center gap-3 overflow-hidden">
        <img src="${esc(thumbSrc(item))}" alt="${esc(item.title)}" class="w-12 h-10 object-cover rounded-lg bg-black/40 shrink-0">
        <div class="truncate">
          <h5 class="text-xs font-semibold text-white group-hover:text-brand-gold transition truncate">${esc(item.title)}</h5>
          <p class="text-[11px] text-brand-dim">${esc(item.meta)} • <span class="capitalize text-brand-gold/80">${esc(item.category)}</span></p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button data-action="edit-pf" data-id="${esc(item.id)}" aria-label="Edit karya" class="p-1.5 text-brand-dim hover:text-white rounded-lg hover:bg-white/5 transition" title="Edit">
          <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>`).join('');
}

function updateMetricCounts() {
  const total = CMS_STATE.portfolio.length;
  const graphic = CMS_STATE.portfolio.filter((p) => p.category === 'graphic').length;
  const motion = CMS_STATE.portfolio.filter((p) => p.category === 'motion').length;
  const expTotal = CMS_STATE.experienceProjects.length;

  const set = (id, v) => { const el = $(id); if (el) el.innerText = v; };
  set('stat-total-portfolio', total);
  set('badge-portfolio-count', total);
  set('count-all', total);
  set('count-graphic', graphic);
  set('count-motion', motion);
  set('stat-total-skills', CMS_STATE.skills.length);
  set('stat-total-articles', CMS_STATE.articles.length);
  set('badge-articles-count', CMS_STATE.articles.length);
  set('stat-total-exp', expTotal);
  set('badge-exp-count', expTotal);

  // baris "8 Graphic • 6 Motion" yang sebelumnya hardcode di HTML
  const stat = $('stat-total-portfolio');
  if (stat && stat.parentElement) {
    const spans = stat.parentElement.querySelectorAll('span');
    if (spans[0]) spans[0].textContent = `${graphic} Graphic`;
    if (spans[1]) spans[1].textContent = `${motion} Motion`;
  }
}

/* =============================================================
   4. PROFIL
   ============================================================= */
function populateProfileForm() {
  const p = CMS_STATE.profile;
  const photo = safeUrl(p.photoUrl) || PLACEHOLDER_IMG;
  $('input-profile-name').value = p.name || '';
  $('input-profile-italic').value = p.italicName || '';
  $('input-profile-eyebrow').value = p.eyebrow || '';
  $('input-profile-hero-desc').value = p.heroDesc || '';
  $('input-profile-photo').value = p.photoUrl || '';
  $('profile-photo-preview').src = photo;
  $('sidebar-avatar').src = photo;
  $('sidebar-name').innerText = `${p.name || ''} ${p.italicName || ''}`.trim();

  $('input-fact-location').value = p.facts.location || '';
  $('input-fact-exp').value = p.facts.experience || '';
  $('input-fact-discipline').value = p.facts.discipline || '';
  $('input-fact-availability').value = p.facts.availability || '';
  $('input-profile-about-text').value = p.aboutParagraphs.join('\n\n');

  $('input-social-wa').value = p.social.whatsapp || '';
  $('input-social-email').value = p.social.email || '';
  $('input-social-linkedin').value = p.social.linkedin || '';
  $('input-social-instagram').value = p.social.instagram || '';
}

function updatePhotoPreview(url) {
  const u = safeUrl(url);
  if (u) $('profile-photo-preview').src = u;
}

function saveProfileChanges() {
  const val = (id) => $(id).value.trim();
  const photo = val('input-profile-photo');
  const wa = val('input-social-wa');
  const email = val('input-social-email');
  const linkedin = val('input-social-linkedin');
  const instagram = val('input-social-instagram');

  if (photo && !safeUrl(photo)) { alert('URL foto harus diawali http:// atau https://'); return; }
  for (const [label, v] of [['WhatsApp', wa], ['LinkedIn', linkedin], ['Instagram', instagram]]) {
    if (v && !safeUrl(v)) { alert(`Tautan ${label} harus diawali http:// atau https://`); return; }
  }
  if (email && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(email)) { alert('Format email tidak valid.'); return; }

  const p = CMS_STATE.profile;
  p.name = val('input-profile-name');
  p.italicName = val('input-profile-italic');
  p.eyebrow = val('input-profile-eyebrow');
  p.heroDesc = val('input-profile-hero-desc');
  p.photoUrl = photo;
  p.facts.location = val('input-fact-location');
  p.facts.experience = val('input-fact-exp');
  p.facts.discipline = val('input-fact-discipline');
  p.facts.availability = val('input-fact-availability');
  p.aboutParagraphs = $('input-profile-about-text').value.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  p.social.whatsapp = wa;
  p.social.email = email;
  p.social.linkedin = linkedin;
  p.social.instagram = instagram;

  saveStateToStorage();
  populateProfileForm();
  showToast('Profil berhasil disimpan!', 'success');
}

/* =============================================================
   5. PORTOFOLIO
   ============================================================= */
function filterPortfolio(cat) {
  activeFilter = cat;
  document.querySelectorAll('.pf-filter-btn').forEach((b) => {
    b.className = 'pf-filter-btn px-3 py-1.5 rounded-xl text-xs font-medium text-brand-dim hover:text-white hover:bg-white/5';
  });
  const activeBtn = $(`pf-btn-${cat}`);
  if (activeBtn) activeBtn.className = 'pf-filter-btn px-3 py-1.5 rounded-xl text-xs font-medium bg-brand-gold text-brand-bg';
  renderPortfolioGrid();
}

function searchPortfolio(query) {
  portfolioSearchQuery = String(query || '').toLowerCase();
  renderPortfolioGrid();
}

function renderPortfolioGrid() {
  const grid = $('portfolio-grid');
  if (!grid) return;

  let items = CMS_STATE.portfolio;
  if (activeFilter !== 'all') items = items.filter((i) => i.category === activeFilter);
  if (portfolioSearchQuery) {
    items = items.filter((i) =>
      String(i.title).toLowerCase().includes(portfolioSearchQuery) ||
      String(i.meta).toLowerCase().includes(portfolioSearchQuery));
  }

  if (items.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full p-10 text-center text-brand-dim glass-card rounded-2xl">
        <i data-lucide="folder-open" class="w-8 h-8 mx-auto mb-2 text-brand-gold/40"></i>
        <p class="text-xs">Tidak ada karya yang sesuai dengan pencarian atau filter.</p>
      </div>`;
    refreshIcons();
    return;
  }

  grid.innerHTML = items.map((item) => {
    const video = safeUrl(item.videoUrl);
    return `
    <div class="glass-card glass-card-hover rounded-2xl overflow-hidden border-brand-border flex flex-col justify-between group">
      <div class="relative aspect-video bg-black/40 overflow-hidden">
        <img src="${esc(thumbSrc(item))}" alt="${esc(item.title)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
        <span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider ${item.category === 'motion' ? 'bg-indigo-600/90 text-white' : 'bg-brand-gold/90 text-brand-bg'}">
          ${esc(item.category)}
        </span>
        ${video ? `
          <a href="${esc(video)}" target="_blank" rel="noopener noreferrer" class="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-lg bg-black/70 hover:bg-red-600 text-white text-[10px] flex items-center gap-1 transition">
            <i data-lucide="play" class="w-3 h-3 fill-current"></i> Video
          </a>` : ''}
      </div>
      <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <span class="text-[10px] font-mono text-brand-dim uppercase tracking-wider">${esc(item.index || '#')} / ${esc(item.category)}</span>
          <h5 class="text-sm font-semibold text-white group-hover:text-brand-gold transition line-clamp-1">${esc(item.title)}</h5>
          <p class="text-xs text-brand-dim mt-0.5 line-clamp-1">${esc(item.meta)}</p>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-white/5">
          <span class="text-[11px] text-brand-gold font-mono">${esc(item.id)}</span>
          <div class="flex items-center gap-1">
            <button data-action="edit-pf" data-id="${esc(item.id)}" aria-label="Edit karya" class="p-1.5 text-brand-dim hover:text-white rounded-lg hover:bg-white/5 transition" title="Edit">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button data-action="dup-pf" data-id="${esc(item.id)}" aria-label="Duplikat karya" class="p-1.5 text-brand-dim hover:text-brand-gold rounded-lg hover:bg-white/5 transition" title="Duplikat">
              <i data-lucide="copy" class="w-3.5 h-3.5"></i>
            </button>
            <button data-action="del-pf" data-id="${esc(item.id)}" aria-label="Hapus karya" class="p-1.5 text-brand-dim hover:text-red-400 rounded-lg hover:bg-red-500/10 transition" title="Hapus">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  refreshIcons();
}

function openPortfolioModal(itemId = null) {
  const title = $('portfolio-modal-title');
  if (itemId) {
    title.innerText = 'Edit Karya Portofolio';
    const item = CMS_STATE.portfolio.find((p) => p.id === itemId);
    if (item) {
      $('pm-id').value = item.id;
      $('pm-title').value = item.title;
      $('pm-category').value = item.category;
      $('pm-meta').value = item.meta;
      $('pm-index').value = item.index || '';
      $('pm-image').value = item.imageUrl || '';
      $('pm-video').value = item.videoUrl || '';
      $('pm-preview-img').src = thumbSrc(item);
    }
  } else {
    title.innerText = 'Tambah Karya Baru';
    $('pm-id').value = '';
    $('pm-title').value = '';
    $('pm-category').value = 'graphic';
    $('pm-meta').value = 'KIAN Company — 2026';
    $('pm-index').value = String(CMS_STATE.portfolio.length + 1).padStart(2, '0');
    $('pm-image').value = '';
    $('pm-video').value = '';
    $('pm-preview-img').src = PLACEHOLDER_IMG;
  }
  $('modal-portfolio').classList.remove('hidden');
  refreshIcons();
}

function editPortfolioItem(id) { openPortfolioModal(id); }

function duplicatePortfolioItem(id) {
  const item = CMS_STATE.portfolio.find((p) => p.id === id);
  if (!item) return;
  const copy = clone(item);
  copy.id = uid('pf');
  copy.title += ' (Salinan)';
  CMS_STATE.portfolio.unshift(copy);
  saveStateToStorage();
  renderPortfolioGrid();
  updateMetricCounts();
  showToast('Karya berhasil diduplikasi!', 'info');
}

function deletePortfolioItem(id) {
  if (!confirm('Yakin ingin menghapus karya ini dari portofolio?')) return;
  CMS_STATE.portfolio = CMS_STATE.portfolio.filter((p) => p.id !== id);
  saveStateToStorage();
  renderPortfolioGrid();
  updateMetricCounts();
  showToast('Karya dihapus!', 'warning');
}

function savePortfolioItem() {
  const id = $('pm-id').value;
  const title = $('pm-title').value.trim();
  const category = $('pm-category').value;
  const meta = $('pm-meta').value.trim();
  const index = $('pm-index').value.trim();
  const imageUrl = $('pm-image').value.trim();
  const videoUrl = $('pm-video').value.trim();

  if (!title) { alert('Mohon isi judul karya!'); return; }
  if (imageUrl && !safeUrl(imageUrl)) { alert('URL gambar harus diawali http:// atau https://'); return; }
  if (videoUrl && !extractYtId(videoUrl)) { alert('Tautan YouTube tidak valid (youtu.be / youtube.com/watch / shorts).'); return; }
  if (category === 'graphic' && !imageUrl) { alert('Karya Graphic Design wajib punya URL gambar.'); return; }
  if (category === 'motion' && !videoUrl) { alert('Karya Motion Graphic wajib punya tautan YouTube.'); return; }

  if (id) {
    const i = CMS_STATE.portfolio.findIndex((p) => p.id === id);
    if (i !== -1) CMS_STATE.portfolio[i] = { ...CMS_STATE.portfolio[i], title, category, meta, index, imageUrl, videoUrl };
  } else {
    CMS_STATE.portfolio.unshift({ id: uid('pf'), title, category, meta, index, imageUrl, videoUrl });
  }

  saveStateToStorage();
  closeModal('modal-portfolio');
  renderPortfolioGrid();
  updateMetricCounts();
  showToast('Karya berhasil disimpan!', 'success');
}

/* =============================================================
   6. PROYEK KIAN
   ============================================================= */
function renderExperienceProjects() {
  const container = $('experience-projects-list');
  if (!container) return;

  const items = CMS_STATE.experienceProjects;
  $('exp-project-total-label').innerText = `${items.length} Proyek Terdaftar`;

  container.innerHTML = items.map((item, idx) => `
    <div class="glass-card p-4 rounded-xl border-brand-border hover:border-brand-borderStrong transition flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="space-y-1.5 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-xs font-mono font-bold text-brand-gold">#${String(idx + 1).padStart(2, '0')}</span>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-white/5 text-brand-dim">${esc(item.category)}</span>
          <span class="text-xs text-brand-dim">• ${esc(item.date)}</span>
        </div>
        <h5 class="text-sm font-semibold text-white">${esc(item.title)}</h5>
        <p class="text-xs text-brand-dim line-clamp-2">${esc(item.desc)}</p>
        <p class="text-[11px] text-brand-gold/90 font-mono"><strong>Output:</strong> ${esc(item.output)}</p>
      </div>
      <div class="flex items-center gap-1 shrink-0 self-end md:self-center">
        <button data-action="edit-ep" data-id="${esc(item.id)}" aria-label="Edit proyek" class="p-2 text-brand-dim hover:text-white rounded-lg hover:bg-white/5 transition" title="Edit">
          <i data-lucide="edit-2" class="w-4 h-4"></i>
        </button>
        <button data-action="del-ep" data-id="${esc(item.id)}" aria-label="Hapus proyek" class="p-2 text-brand-dim hover:text-red-400 rounded-lg hover:bg-red-500/10 transition" title="Hapus">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>`).join('');

  refreshIcons();
}

function openExperienceProjectModal(itemId = null) {
  const title = $('exp-modal-title');
  if (itemId) {
    title.innerText = 'Edit Proyek KIAN';
    const item = CMS_STATE.experienceProjects.find((e) => e.id === itemId);
    if (item) {
      $('exp-id').value = item.id;
      $('exp-title').value = item.title;
      $('exp-category').value = item.category;
      $('exp-date').value = item.date;
      $('exp-role').value = item.role;
      $('exp-desc').value = item.desc;
      $('exp-output').value = item.output;
    }
  } else {
    title.innerText = 'Tambah Proyek Produksi KIAN';
    $('exp-id').value = '';
    $('exp-title').value = '';
    $('exp-category').value = 'event & broadcast';
    $('exp-date').value = '2026';
    $('exp-role').value = 'Motion Graphic Designer';
    $('exp-desc').value = '';
    $('exp-output').value = '';
  }
  $('modal-experience').classList.remove('hidden');
  refreshIcons();
}

function editExperienceItem(id) { openExperienceProjectModal(id); }

function deleteExperienceItem(id) {
  if (!confirm('Hapus proyek ini dari riwayat KIAN?')) return;
  CMS_STATE.experienceProjects = CMS_STATE.experienceProjects.filter((e) => e.id !== id);
  saveStateToStorage();
  renderExperienceProjects();
  updateMetricCounts();
  showToast('Proyek dihapus!', 'warning');
}

function saveExperienceItem() {
  const id = $('exp-id').value;
  const rec = {
    title: $('exp-title').value.trim(),
    category: $('exp-category').value,
    date: $('exp-date').value.trim(),
    role: $('exp-role').value.trim(),
    desc: $('exp-desc').value.trim(),
    output: $('exp-output').value.trim()
  };
  if (!rec.title) { alert('Mohon isi nama acara / proyek!'); return; }

  if (id) {
    const i = CMS_STATE.experienceProjects.findIndex((e) => e.id === id);
    if (i !== -1) CMS_STATE.experienceProjects[i] = { ...CMS_STATE.experienceProjects[i], ...rec };
  } else {
    CMS_STATE.experienceProjects.unshift({ id: uid('ep'), ...rec });
  }

  saveStateToStorage();
  closeModal('modal-experience');
  renderExperienceProjects();
  updateMetricCounts();
  showToast('Proyek berhasil disimpan!', 'success');
}

/* =============================================================
   7. KEAHLIAN
   ============================================================= */
function renderSkills() {
  const container = $('skills-pill-container');
  if (!container) return;
  container.innerHTML = CMS_STATE.skills.map((skill, index) => `
    <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-brand-border text-xs text-white hover:border-brand-gold transition group">
      <span>${esc(skill)}</span>
      <button data-action="rm-skill" data-id="${index}" aria-label="Hapus keahlian ${esc(skill)}" class="text-brand-dim group-hover:text-red-400 p-0.5 rounded transition">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    </div>`).join('');
  refreshIcons();
}

function openSkillModal() {
  $('skill-name-input').value = '';
  $('modal-skill').classList.remove('hidden');
}

function addNewSkill() {
  const name = $('skill-name-input').value.trim();
  if (!name) return;
  if (CMS_STATE.skills.some((s) => s.toLowerCase() === name.toLowerCase())) {
    alert('Keahlian tersebut sudah ada.');
    return;
  }
  CMS_STATE.skills.push(name);
  saveStateToStorage();
  renderSkills();
  updateMetricCounts();
  closeModal('modal-skill');
  showToast('Keahlian baru ditambahkan!', 'success');
}

function removeSkill(index) {
  if (!Number.isInteger(index) || index < 0 || index >= CMS_STATE.skills.length) return;
  CMS_STATE.skills.splice(index, 1);
  saveStateToStorage();
  renderSkills();
  updateMetricCounts();
}

/* =============================================================
   8. ARTIKEL
   ============================================================= */
function renderArticles() {
  const container = $('articles-list');
  if (!container) return;
  container.innerHTML = CMS_STATE.articles.map((art) => `
    <div class="glass-card glass-card-hover rounded-2xl overflow-hidden border-brand-border flex flex-col justify-between">
      <div class="aspect-video bg-black/40 overflow-hidden relative">
        <img src="${esc(safeUrl(art.coverUrl) || PLACEHOLDER_IMG)}" alt="${esc(art.title)}" loading="lazy" class="w-full h-full object-cover">
        <span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/70 text-brand-gold border border-brand-gold/30">${esc(art.category)}</span>
      </div>
      <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          <span class="text-[11px] text-brand-dim font-mono">${esc(art.date)}</span>
          <h5 class="text-base font-semibold text-white mt-1 hover:text-brand-gold transition line-clamp-2">${esc(art.title)}</h5>
          <p class="text-xs text-brand-dim mt-2 line-clamp-3 leading-relaxed">${esc(art.excerpt)}</p>
        </div>
        <div class="flex items-center justify-between pt-3 border-t border-white/5">
          <span class="text-[11px] font-mono text-emerald-400">Published</span>
          <div class="flex items-center gap-1">
            <button data-action="edit-art" data-id="${esc(art.id)}" aria-label="Edit artikel" class="p-1.5 text-brand-dim hover:text-white rounded-lg hover:bg-white/5 transition" title="Edit Artikel">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button data-action="del-art" data-id="${esc(art.id)}" aria-label="Hapus artikel" class="p-1.5 text-brand-dim hover:text-red-400 rounded-lg hover:bg-red-500/10 transition" title="Hapus Artikel">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`).join('');
  refreshIcons();
}

function openArticleEditor(artId = null) {
  const title = $('article-modal-title');
  if (artId) {
    title.innerText = 'Edit Artikel Blog';
    const art = CMS_STATE.articles.find((a) => a.id === artId);
    if (art) {
      $('art-id').value = art.id;
      $('art-title').value = art.title;
      $('art-category').value = art.category;
      $('art-cover').value = art.coverUrl;
      $('art-excerpt').value = art.excerpt;
      $('art-body').value = art.body;
      renderArticlePreview(art.body);
    }
  } else {
    const starter = '## Judul Bagian\n\nTulis konten menarik Anda di sini...';
    title.innerText = 'Tulis Artikel Baru';
    $('art-id').value = '';
    $('art-title').value = '';
    $('art-category').value = 'Motion Design';
    $('art-cover').value = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80';
    $('art-excerpt').value = '';
    $('art-body').value = starter;
    renderArticlePreview(starter);
  }
  $('modal-article').classList.remove('hidden');
  refreshIcons();
}

function editArticle(id) { openArticleEditor(id); }

function deleteArticle(id) {
  if (!confirm('Hapus artikel ini?')) return;
  CMS_STATE.articles = CMS_STATE.articles.filter((a) => a.id !== id);
  saveStateToStorage();
  renderArticles();
  updateMetricCounts();
  showToast('Artikel dihapus!', 'warning');
}

function insertMd(prefix, suffix = '') {
  const ta = $('art-body');
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  ta.value = text.substring(0, start) + prefix + text.substring(start, end) + suffix + text.substring(end);
  ta.focus();
  ta.selectionStart = start + prefix.length;
  ta.selectionEnd = end + prefix.length;
  renderArticlePreview(ta.value);
}

/** Markdown -> HTML lengkap (daftar, tabel, dsb) lalu disanitasi. Tanpa marked: tampil sebagai teks. */
function renderMarkdownToHtml(md) {
  if (window.marked && window.DOMPurify) {
    return sanitizeHTML(marked.parse(String(md ?? ''), { gfm: true, breaks: true }), ARTICLE_TAGS);
  }
  return '<p>' + esc(md).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
}

function renderArticlePreview(markdown) {
  const preview = $('art-preview');
  if (preview) preview.innerHTML = renderMarkdownToHtml(markdown);
}

function saveArticleItem() {
  const id = $('art-id').value;
  const title = $('art-title').value.trim();
  const category = $('art-category').value.trim();
  const coverUrl = $('art-cover').value.trim();
  const excerpt = $('art-excerpt').value.trim();
  const body = $('art-body').value;

  if (!title) { alert('Judul artikel wajib diisi!'); return; }
  if (coverUrl && !safeUrl(coverUrl)) { alert('URL cover harus diawali http:// atau https://'); return; }

  const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  if (id) {
    const i = CMS_STATE.articles.findIndex((a) => a.id === id);
    if (i !== -1) {
      CMS_STATE.articles[i] = { id, title, category, coverUrl, excerpt, body, date: CMS_STATE.articles[i].date || today };
    }
  } else {
    CMS_STATE.articles.unshift({ id: uid('art'), title, category, coverUrl, excerpt, body, date: today });
  }

  saveStateToStorage();
  closeModal('modal-article');
  renderArticles();
  updateMetricCounts();
  showToast('Artikel berhasil disimpan!', 'success');
}

function downloadArticleAsMarkdown() {
  const title = $('art-title').value.trim() || 'artikel';
  const q = (s) => JSON.stringify(String(s)); // string YAML aman (tanda kutip di-escape)
  const content =
`---
title: ${q(title)}
category: ${q($('art-category').value.trim())}
cover: ${q($('art-cover').value.trim())}
date: ${q(new Date().toISOString())}
---

${$('art-body').value}`;
  downloadBlob(content, 'text/markdown', `${slugify(title) || 'artikel'}.md`);
}

/* =============================================================
   9. LIVE SIMULATOR
   ============================================================= */
function setPreviewDevice(device) {
  const wrapper = $('iframe-wrapper');
  ['desktop', 'tablet', 'mobile'].forEach((d) => {
    $(`btn-device-${d}`).className = 'p-1.5 rounded-lg text-brand-dim hover:text-white';
  });
  $(`btn-device-${device}`).className = 'p-1.5 rounded-lg text-brand-gold bg-brand-gold/15';
  wrapper.style.maxWidth = device === 'mobile' ? '390px' : device === 'tablet' ? '768px' : '100%';
}

function reloadPreviewFrame() {
  const frame = $('preview-iframe');
  if (frame) {
    frame.src = frame.src;
    showToast('Memuat ulang pratinjau...', 'info');
  }
}

/* =============================================================
   10. GITHUB
   ============================================================= */
const GH_TOKEN_KEY = 'gh_pat_token';
const PERSIST_GH_TOKEN = false;      // true = token tetap tersimpan di localStorage (kurang aman)
const CLEAR_TOKEN_ON_LOCK = true;    // hapus token saat logout / auto-lock

function getGitHubToken() {
  let t = sessionStorage.getItem(GH_TOKEN_KEY) || '';
  if (!t) {
    const legacy = localStorage.getItem(GH_TOKEN_KEY) || '';
    if (legacy) {
      t = legacy;
      if (!PERSIST_GH_TOKEN) { // migrasi token lama keluar dari localStorage
        sessionStorage.setItem(GH_TOKEN_KEY, legacy);
        localStorage.removeItem(GH_TOKEN_KEY);
      }
    }
  }
  return t;
}

function setGitHubToken(token) {
  sessionStorage.removeItem(GH_TOKEN_KEY);
  localStorage.removeItem(GH_TOKEN_KEY);
  (PERSIST_GH_TOKEN ? localStorage : sessionStorage).setItem(GH_TOKEN_KEY, token);
}

function clearGitHubToken() {
  if (!CLEAR_TOKEN_ON_LOCK && adminActive) return;
  sessionStorage.removeItem(GH_TOKEN_KEY);
  localStorage.removeItem(GH_TOKEN_KEY);
  const input = $('input-github-token');
  if (input) input.value = '';
  updateGitHubStatusBadge();
}

function toggleTokenVisibility() {
  const input = $('input-github-token');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function updateGitHubStatusBadge() {
  const has = !!getGitHubToken();
  const badge = $('github-status-badge');
  const label = $('status-token-label');
  if (badge) {
    badge.className = has
      ? 'px-2 py-0.5 rounded-full text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
      : 'px-2 py-0.5 rounded-full text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20';
    badge.innerText = has ? 'Token Terpasang' : 'Menunggu Token';
  }
  if (label) {
    label.className = has ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium';
    label.innerText = has ? 'Tersimpan (Siap Sinkron)' : 'Belum Diatur';
  }
}

function validateGitHubSettings(s) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(s.githubOwner)) return 'Owner GitHub tidak valid.';
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(s.githubRepo)) return 'Nama repository tidak valid.';
  if (!/^[\w./-]{1,100}$/.test(s.branch) || s.branch.includes('..')) return 'Nama branch tidak valid.';
  if (!/^[\w./-]{1,200}$/.test(s.targetFile) || s.targetFile.includes('..') || s.targetFile.startsWith('/')) return 'Path file target tidak valid.';
  return '';
}

function saveGitHubSettings() {
  const token = $('input-github-token').value.trim();
  const settings = {
    githubOwner: $('input-github-owner').value.trim() || 'bprodrive',
    githubRepo: $('input-github-repo').value.trim() || 'bprodrive.github.io',
    branch: $('input-github-branch').value.trim() || 'main',
    targetFile: $('input-github-file').value.trim() || 'index.html'
  };
  const err = validateGitHubSettings(settings);
  if (err) { alert(err); return; }
  if (token && !/^[A-Za-z0-9_-]{20,255}$/.test(token)) { alert('Format token tidak dikenali. Salin ulang token dari GitHub.'); return; }

  if (token) setGitHubToken(token);
  else { sessionStorage.removeItem(GH_TOKEN_KEY); localStorage.removeItem(GH_TOKEN_KEY); } // kosongkan = hapus token

  CMS_STATE.settings = settings;
  saveStateToStorage();
  updateGitHubStatusBadge();
  showToast(token ? 'Pengaturan GitHub berhasil disimpan!' : 'Pengaturan disimpan. Token dihapus.', 'success');
}

/* ----- Helper API GitHub ----- */
const GH_API = 'https://api.github.com';

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}
const ghFileUrl = (o, r, path) =>
  `${GH_API}/repos/${o}/${r}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;

async function ghError(res) {
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch (e) { /* body kosong */ }
  const map = {
    401: 'Token tidak valid atau kedaluwarsa.',
    403: "Token tidak punya izin 'Contents: Read and write', atau terkena rate limit.",
    404: 'Repo/file/branch tidak ditemukan, atau token tidak punya akses ke repo ini.',
    409: 'Konflik versi file (ada commit baru).',
    422: 'Permintaan ditolak (sha salah atau branch tidak ada).'
  };
  const err = new Error(`${map[res.status] || 'Permintaan GitHub gagal.'} (HTTP ${res.status})${detail ? ' — ' + detail : ''}`);
  err.status = res.status;
  return err;
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function testGitHubConnection() {
  const token = $('input-github-token').value.trim() || getGitHubToken(); // pakai isi form dulu
  const owner = $('input-github-owner').value.trim() || 'bprodrive';
  const repo = $('input-github-repo').value.trim() || 'bprodrive.github.io';

  showToast('Menghubungi GitHub API...', 'info');
  try {
    const res = await fetch(`${GH_API}/repos/${owner}/${repo}`, { headers: token ? ghHeaders(token) : { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw await ghError(res);
    const data = await res.json();
    if (!token) {
      showToast(`Repo ${data.full_name} terbaca, tetapi token belum diisi.`, 'warning');
    } else if (!data.permissions || !data.permissions.push) {
      showToast(`Terhubung ke ${data.full_name}, tetapi token TIDAK punya izin push.`, 'warning');
    } else {
      showToast(`Koneksi Berhasil! ${data.full_name} (${data.visibility}) — izin push OK.`, 'success');
    }
    updateGitHubStatusBadge();
  } catch (err) {
    showToast('Koneksi Gagal: ' + err.message, 'warning');
  }
}

function openGitHubCommitModal() {
  if (!getGitHubToken()) {
    alert('Silakan atur GitHub Personal Access Token (PAT) terlebih dahulu pada tab Pengaturan.');
    switchTab('settings');
    return;
  }
  const s = CMS_STATE.settings;
  $('gc-repo-label').innerText = `${s.githubOwner}/${s.githubRepo}`;
  const spans = $('modal-github-commit').querySelectorAll('.font-mono span.text-white');
  if (spans[1]) spans[1].textContent = s.branch;
  if (spans[2]) spans[2].textContent = s.targetFile;
  $('modal-github-commit').classList.remove('hidden');
}

/** Hasil regenerasi harus masuk akal sebelum menimpa file produksi. */
function sanityCheckHtml(oldHtml, newHtml) {
  if (!/<\/body>/i.test(newHtml) || !/<\/html>\s*$/i.test(newHtml.trim())) {
    throw new Error('Hasil HTML tidak lengkap. Push dibatalkan agar situs tidak rusak.');
  }
  if (newHtml.length < oldHtml.length * 0.6) {
    throw new Error('Hasil HTML jauh lebih kecil dari file asli. Push dibatalkan agar situs tidak rusak.');
  }
}

async function executeGitHubPush() {
  const token = getGitHubToken();
  const { githubOwner: owner, githubRepo: repo, branch, targetFile: file } = CMS_STATE.settings;
  const message = $('gc-commit-message').value.trim() || 'Update website via Studio CMS';
  const progressBox = $('gc-progress-box');
  const progressText = $('gc-progress-text');
  const submitBtn = $('gc-submit-btn');

  progressBox.classList.remove('hidden');
  submitBtn.disabled = true;

  try {
    for (let attempt = 0; ; attempt++) {
      progressText.innerText = 'Mengambil status file terkini (SHA)...';
      const getRes = await fetch(`${ghFileUrl(owner, repo, file)}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders(token) });
      if (!getRes.ok) throw await ghError(getRes);
      const fileData = await getRes.json();
      if (fileData.encoding !== 'base64' || !fileData.content) {
        throw new Error('File terlalu besar untuk Contents API (>1 MB) atau bukan file teks.');
      }

      progressText.innerText = 'Mengintegrasikan data ke dalam halaman...';
      const originalHtml = base64ToUtf8(fileData.content);
      const updatedHtml = applyCmsStateToHtml(originalHtml);
      sanityCheckHtml(originalHtml, updatedHtml);

      progressText.innerText = `Melakukan commit ke branch ${branch}...`;
      const putRes = await fetch(ghFileUrl(owner, repo, file), {
        method: 'PUT',
        headers: ghHeaders(token),
        body: JSON.stringify({ message, content: utf8ToBase64(updatedHtml), sha: fileData.sha, branch })
      });

      if (putRes.ok) break;
      // ada commit baru di antara GET dan PUT: ambil ulang & regenerasi dari versi terbaru
      if ((putRes.status === 409 || putRes.status === 422) && attempt < 2) continue;
      throw await ghError(putRes);
    }

    closeModal('modal-github-commit');
    showToast('Berhasil di-push ke GitHub Pages! Perubahan aktif dalam 1-2 menit.', 'success');
  } catch (err) {
    alert('Gagal melakukan commit: ' + err.message);
  } finally {
    progressBox.classList.add('hidden');
    submitBtn.disabled = false;
  }
}

/* =============================================================
   11. MENYUNTIKKAN DATA KE index.html (semua nilai di-escape / disanitasi)
   ============================================================= */
function applyCmsStateToHtml(fullHtml) {
  const doc = new DOMParser().parseFromString(fullHtml, 'text/html');
  const P = CMS_STATE.profile || {};

  // 1. Eyebrow
  const eyebrow = doc.querySelector('.eyebrow');
  if (eyebrow && P.eyebrow) eyebrow.innerHTML = sanitizeHTML(P.eyebrow, INLINE_TAGS);

  // 2. Nama (dibangun lewat DOM, bukan string)
  const nameEl = doc.querySelector('.name');
  if (nameEl && P.name) {
    nameEl.textContent = '';
    nameEl.append(doc.createTextNode(P.name), doc.createElement('br'));
    const em = doc.createElement('em');
    em.textContent = P.italicName || '';
    nameEl.append(em);
  }

  // 3. Deskripsi hero
  const heroDesc = doc.querySelector('.hero-desc');
  if (heroDesc && P.heroDesc) heroDesc.innerHTML = sanitizeHTML(P.heroDesc, INLINE_TAGS);

  // 4. Foto
  const portraitImg = doc.querySelector('.portrait img');
  if (portraitImg && safeUrl(P.photoUrl)) {
    portraitImg.setAttribute('src', safeUrl(P.photoUrl));
    portraitImg.setAttribute('alt', `${P.name || ''} ${P.italicName || ''}`.trim());
  }

  // 5. Tentang + fakta
  const aboutText = doc.querySelector('.about-text');
  if (aboutText && Array.isArray(P.aboutParagraphs) && P.aboutParagraphs.length) {
    const factsEl = aboutText.querySelector('.facts');
    if (factsEl) {
      const fv = factsEl.querySelectorAll('.fact-value');
      if (fv.length >= 4 && P.facts) {
        if (P.facts.location) fv[0].textContent = P.facts.location;
        if (P.facts.experience) fv[1].textContent = P.facts.experience;
        if (P.facts.discipline) fv[2].textContent = P.facts.discipline;
        if (P.facts.availability) fv[3].textContent = P.facts.availability;
      }
      const paragraphsHtml = P.aboutParagraphs.map((t) => `<p>${sanitizeHTML(t, INLINE_TAGS)}</p>`).join('\n          ');
      aboutText.innerHTML = paragraphsHtml + '\n          ' + factsEl.outerHTML;
    }
  }

  // 6. Kontak & sosial media
  if (P.social) {
    const contactBig = doc.querySelector('.contact-big');
    if (contactBig && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(P.social.email || '')) {
      contactBig.setAttribute('href', `mailto:${P.social.email}`);
      contactBig.textContent = P.social.email;
    }
    const socialsEl = doc.querySelector('.socials');
    if (socialsEl) {
      const links = [['Instagram', P.social.instagram], ['LinkedIn', P.social.linkedin], ['WhatsApp', P.social.whatsapp]]
        .filter(([, url]) => safeUrl(url));
      if (links.length) {
        socialsEl.textContent = '';
        links.forEach(([label, url]) => {
          const a = doc.createElement('a');
          a.setAttribute('href', safeUrl(url));
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          a.textContent = label;
          socialsEl.append(a);
        });
      }
    }
  }

  // 7. Portofolio
  if (Array.isArray(CMS_STATE.portfolio)) {
    const graphicItems = CMS_STATE.portfolio.filter((p) => p.category === 'graphic');
    const motionItems = CMS_STATE.portfolio.filter((p) => p.category === 'motion');

    const graphicBtn = doc.querySelector('.portfolio-filter-btn[data-portfolio-target="portfolioModalGraphic"] .pf-count');
    if (graphicBtn) graphicBtn.textContent = `${String(graphicItems.length).padStart(2, '0')} Karya`;
    const motionBtn = doc.querySelector('.portfolio-filter-btn[data-portfolio-target="portfolioModalMotion"] .pf-count');
    if (motionBtn) motionBtn.textContent = `${String(motionItems.length).padStart(2, '0')} Karya`;

    const graphicGallery = doc.getElementById('pmGraphicGallery') || doc.querySelector('#portfolioModalGraphic .work-grid');
    if (graphicGallery) {
      graphicGallery.innerHTML = graphicItems.map((item, idx) => `
        <div class="work-card">
          <span class="work-index">${String(idx + 1).padStart(2, '0')} / Graphic Design</span>
          <div class="work-visual work-visual--natural"><img src="${esc(thumbSrc(item))}" alt="${esc(item.title)}" loading="lazy"></div>
          <div class="work-title">${esc(item.title)}</div>
          <div class="work-meta">${esc(item.meta)}</div>
        </div>`).join('');
    }

    const motionGallery = doc.getElementById('pmMotionGallery') || doc.querySelector('#portfolioModalMotion .work-grid');
    if (motionGallery) {
      motionGallery.innerHTML = motionItems.map((item, idx) => {
        const videoId = extractYtId(item.videoUrl);
        const video = safeUrl(item.videoUrl);
        return `
        <div class="work-card">
          <span class="work-index">${String(idx + 1).padStart(2, '0')} / Motion Graphic</span>
          <div class="work-visual youtube-card" data-video-id="${esc(videoId)}" data-url="${esc(video)}">
            <img src="${esc(thumbSrc(item))}" alt="${esc(item.title)}" loading="lazy">
            <button class="play-btn" aria-label="Putar Video">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>
          </div>
          <div class="work-title">${esc(item.title)}</div>
          <div class="work-meta">${esc(item.meta)}</div>
          ${video ? `
          <div class="work-action">
            <a href="${esc(video)}" target="_blank" rel="noopener noreferrer" class="youtube-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              Tonton di YouTube
            </a>
          </div>` : ''}
        </div>`;
      }).join('');
    }
  }

  // 8. Keahlian
  const skillContainer = doc.getElementById('skillTagsContainer') || doc.querySelector('#keahlian .skill-tags');
  if (skillContainer && Array.isArray(CMS_STATE.skills)) {
    skillContainer.innerHTML = CMS_STATE.skills.map((sk) =>
      `<button class="skill-tag" type="button" data-skill="${esc(slugify(sk))}">${esc(sk)}</button>`).join('\n        ');
  }

  // 9. Artikel
  const articlesGrid = doc.getElementById('articlesGrid');
  if (articlesGrid && Array.isArray(CMS_STATE.articles)) {
    articlesGrid.innerHTML = CMS_STATE.articles.map((art) => `
      <div class="article-card" data-article-id="${esc(art.id)}">
        <div class="article-cover">
          <img src="${esc(safeUrl(art.coverUrl) || PLACEHOLDER_IMG)}" alt="${esc(art.title)}" loading="lazy">
          <span class="article-badge">${esc(art.category)}</span>
        </div>
        <div class="article-info">
          <span class="article-date">${esc(art.date)}</span>
          <h3 class="article-title">${esc(art.title)}</h3>
          <p class="article-excerpt">${esc(art.excerpt)}</p>
          <button class="article-read-btn" type="button" data-article-id="${esc(art.id)}">
            Baca Artikel <span class="arrow">&rarr;</span>
          </button>
        </div>
      </div>`).join('\n        ');
  }

  // 10. State awal untuk halaman publik. "<" di-escape agar "</script>" di dalam data
  //     tidak bisa memutus tag <script>. Pengaturan GitHub tidak ikut dipublikasikan.
  let embedded = doc.getElementById('cms-embedded-state');
  if (!embedded) {
    embedded = doc.createElement('script');
    embedded.id = 'cms-embedded-state';
    doc.body.appendChild(embedded);
  }
  const { settings, ...publicState } = CMS_STATE;
  embedded.textContent = 'window.__INITIAL_CMS_STATE__ = ' +
    JSON.stringify(publicState).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';';

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

/* =============================================================
   12. EKSPOR / IMPOR / RESET
   ============================================================= */
function exportDataJSON() {
  downloadBlob(JSON.stringify(CMS_STATE, null, 2), 'application/json', `bayu_cms_backup_${Date.now()}.json`);
  showToast('Cadangan data JSON berhasil diunduh!', 'success');
}

function importDataJSON(event) {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('File terlalu besar (maks. 5 MB).');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported || typeof imported !== 'object' || !imported.profile || !Array.isArray(imported.portfolio)) {
        alert('Format JSON tidak sesuai dengan skema Studio CMS!');
        return;
      }
      if (!confirm('Impor akan MENIMPA seluruh data CMS saat ini. Lanjutkan?')) return;
      const keepSettings = CMS_STATE.settings;
      CMS_STATE = normalizeState(imported);
      CMS_STATE.settings = keepSettings; // pengaturan repo tidak diubah oleh file impor
      saveStateToStorage();
      renderAllViews();
      showToast('Data berhasil diimpor dari JSON!', 'success');
    } catch (err) {
      alert('Gagal membaca file JSON: ' + err.message);
    } finally {
      input.value = ''; // izinkan memilih file yang sama lagi
    }
  };
  reader.readAsText(file);
}

async function downloadCleanHtml() {
  try {
    const res = await fetch('../index.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Tidak dapat membaca index.html');
    const text = await res.text();
    downloadBlob(applyCmsStateToHtml(text), 'text/html', 'index.html');
    showToast('File index.html terupdate berhasil diunduh!', 'success');
  } catch (e) {
    alert('Gagal mendownload index.html: ' + e.message);
  }
}

function resetDataToDefault() {
  if (!confirm('PERINGATAN: Ini akan mengembalikan seluruh data CMS ke setelan awal default web. Lanjutkan?')) return;
  const keepSettings = CMS_STATE.settings;
  CMS_STATE = normalizeState(clone(DEFAULT_CMS_DATA));
  CMS_STATE.settings = keepSettings;
  saveStateToStorage();
  renderAllViews();
  showToast('Data berhasil direset ke default!', 'info');
}

/* =============================================================
   13. MODAL, TOAST, EVENT
   ============================================================= */
function closeModal(modalId) {
  const m = $(modalId);
  if (m) m.classList.add('hidden');
}

function showToast(message, type = 'info') {
  const container = $('toast-container');
  if (!container) return;

  const colors = {
    success: 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30',
    warning: 'bg-amber-950/90 text-amber-200 border-amber-500/30',
    info: 'bg-brand-surface/95 text-brand-text border-brand-border'
  };
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-medium transition-all duration-300 transform translate-y-4 opacity-0 ${colors[type] || colors.info}`;

  const dot = document.createElement('span');
  dot.className = `w-2 h-2 rounded-full shrink-0 ${type === 'success' ? 'bg-emerald-400' : type === 'warning' ? 'bg-amber-400' : 'bg-brand-gold'}`;
  const txt = document.createElement('span');
  txt.textContent = message; // textContent: pesan error dari luar tidak bisa menyisipkan HTML
  toast.append(dot, txt);

  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('translate-y-4', 'opacity-0'), 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Delegasi klik: menggantikan onclick="fn('${id}')" yang rawan injeksi lewat id/judul
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'edit-pf': editPortfolioItem(id); break;
    case 'dup-pf': duplicatePortfolioItem(id); break;
    case 'del-pf': deletePortfolioItem(id); break;
    case 'edit-ep': editExperienceItem(id); break;
    case 'del-ep': deleteExperienceItem(id); break;
    case 'rm-skill': removeSkill(parseInt(id, 10)); break;
    case 'edit-art': editArticle(id); break;
    case 'del-art': deleteArticle(id); break;
  }
});

// Escape hanya menutup modal (sebelumnya ikut menyembunyikan layar login)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('[id^="modal-"]:not(.hidden)').forEach((m) => m.classList.add('hidden'));
  }
});

/* =============================================================
   14. BOOTSTRAP
   ============================================================= */
window.addEventListener('DOMContentLoaded', () => {
  // Modal lama yang menampilkan password default: hapus dari DOM apa pun isi HTML-nya
  const legacyModal = $('modal-forgot-creds');
  if (legacyModal) legacyModal.remove();

  refreshIcons();
  if (isSessionValid()) showAdminApp();
  else showAuthGateway();
});
