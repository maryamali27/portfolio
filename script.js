// script.js (updated)
// - Loads projects.json if present (supports { projects: [...] } or [...] shape).
// - If projects.json is absent or unavailable, automatically fetches public repos for
//   the username 'maryamali27' from the GitHub API and adapts the data.
// - Renders projects, languages chart, filters, search, modal, lightbox, and animations.
// - Shows friendly notice if both methods fail and suggests next steps.
//
// Note: If you open index.html via file:// some browsers block fetch requests to local files.
// Run a simple local server (python -m http.server 8000 or npx serve .) or deploy to GitHub Pages.

const PROJECTS_JSON = 'projects.json';
const FALLBACK_USERNAME = 'maryamali27';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function dom(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k.startsWith('data-')) el.setAttribute(k, v);
    else if (k === 'html') el.innerHTML = v;
    else el[k] = v;
  });
  children.flat().forEach(c => { if (c == null) return; el.append(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let projectsCache = [];
let langChart = null;

// UI notice helper
function showNotice(msg, kind = 'info') {
  // replace or create #notice element inside header
  let notice = $('#__notice');
  if (!notice) {
    notice = dom('div', { id: '__notice', class: 'card', style: 'margin:12px 0;padding:10px;border-left:4px solid #f59e0b' });
    const header = document.querySelector('.top') || document.body;
    header.insertAdjacentElement('afterend', notice);
  }
  notice.textContent = msg;
  if (kind === 'error') notice.style.borderLeft = '4px solid #ef4444';
  else if (kind === 'success') notice.style.borderLeft = '4px solid #10b981';
  else notice.style.borderLeft = '4px solid #f59e0b';
}

// Reveal utilities (kept simple)
function setupReveal() {
  const reveals = Array.from(document.querySelectorAll('.reveal'));
  if (reduceMotion) { reveals.forEach(r => r.classList.add('active')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const delay = parseInt(el.dataset.revealDelay || 0, 10);
        setTimeout(() => el.classList.add('active'), delay);
        io.unobserve(el);
      }
    });
  }, { threshold: 0.06 });
  reveals.forEach(r => io.observe(r));
}

// Animated counters (used for stats)
function animateCounter(el, to, duration = 900) {
  if (!el) return;
  const end = Number(to) || 0;
  if (reduceMotion || end === 0) { el.textContent = end; return; }
  const startTime = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    el.textContent = Math.round(end * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function setupStatsWatcher() {
  const statEls = Array.from(document.querySelectorAll('.stat-num'));
  if (!statEls.length) return;
  if (reduceMotion) { statEls.forEach(e => e.textContent = e.dataset.target || '—'); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const val = el.dataset.target;
        animateCounter(el, val === '—' ? 0 : Number(val), 900);
        io.unobserve(el);
      }
    });
  }, { threshold: 0.3 });
  statEls.forEach(e => io.observe(e));
}

// Tilt / interactions (subtle)
function setupTilt() {
  if (reduceMotion) return;
  const cards = Array.from(document.querySelectorAll('.project-card'));
  cards.forEach(card => {
    let rect = null, raf = null;
    function onPointer(e) {
      if (!rect) rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rotY = (px - 0.5) * 10;
      const rotX = (0.5 - py) * 6;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => card.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(6px)`);
    }
    function onLeave() { if (raf) cancelAnimationFrame(raf); card.style.transform = ''; }
    card.addEventListener('pointermove', onPointer);
    card.addEventListener('pointerleave', onLeave);
    card.addEventListener('pointerdown', () => { card.style.transform += ' translateY(2px)'; });
    card.addEventListener('pointerup', onLeave);
  });
}

// Lightbox & modal
function openLightbox(src, caption = '') {
  $('#lbImage').src = src;
  $('#lbCaption').textContent = caption || '';
  $('#lightbox').setAttribute('aria-hidden', 'false');
}
function closeLightbox() { $('#lightbox').setAttribute('aria-hidden', 'true'); $('#lbImage').src = ''; }
function openModal() { $('#modal').setAttribute('aria-hidden', 'false'); }
function closeModal() { $('#modal').setAttribute('aria-hidden', 'true'); $('#modalBody').innerHTML = ''; }

// Load local projects.json; returns null if not found or parse error
async function tryLoadLocalJson() {
  try {
    const res = await fetch(PROJECTS_JSON, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    // support both shapes: { projects: [...] } or [...]
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.projects)) return json.projects;
    // maybe legacy shape
    return null;
  } catch (e) {
    return null;
  }
}

// Fetch GitHub repos for username (client-side). Returns mapped array.
async function fetchGitHubRepos(username) {
  try {
    // request topics by using Accept header (may be optional in many responses)
    const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`;
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.status === 403) throw new Error('GitHub API rate limit hit (client-side). Provide token or run generator locally.');
    if (res.status === 404) throw new Error('GitHub user not found: ' + username);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected GitHub response');
    // Map repos to project's format
    const mapped = data.map(r => ({
      name: r.name,
      repo: r.html_url,
      desc: r.description || '',
      tags: (r.topics && r.topics.length) ? r.topics : [],
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      featured: false,
      updated_at: r.updated_at,
      created_at: r.created_at,
      language: r.language || '',
      license: r.license ? (r.license.spdx_id || r.license.name) : '',
      thumbnail: `https://opengraph.githubassets.com/1/${r.full_name}`,
      screenshots: [],
      size: r.size || 0,
      open_issues_count: r.open_issues_count || 0,
      default_branch: r.default_branch || 'main',
      readme_excerpt: '' // omit heavy readme fetch here to avoid rate limit; you can run generator locally to include it
    }));
    // mark top 3 by stars as featured
    mapped.sort((a, b) => (b.stars || 0) - (a.stars || 0));
    mapped.slice(0, 3).forEach(p => p.featured = true);
    return mapped;
  } catch (err) {
    throw err;
  }
}

// Render helpers
function collectTags(list) {
  const s = new Set();
  list.forEach(p => (p.tags || []).forEach(t => s.add(t)));
  list.forEach(p => { if (p.language) s.add(p.language); });
  return Array.from(s).sort();
}
function renderFilters(tags) {
  const root = $('#filters');
  if (!root) return;
  root.innerHTML = '';
  root.append(dom('button', { class: 'filter active', 'data-tag': '__all__' }, 'All'));
  tags.forEach(t => root.append(dom('button', { class: 'filter', 'data-tag': t }, t)));
  root.addEventListener('click', e => {
    if (e.target.matches('.filter')) {
      [...root.querySelectorAll('.filter')].forEach(el => el.classList.remove('active'));
      e.target.classList.add('active');
      applyFilters();
    }
  });
}

function renderProjects(list) {
  const container = $('#projects');
  container.innerHTML = '';
  if (!list || !list.length) {
    container.append(dom('p', { class: 'muted' }, 'No projects found. Click "Import from GitHub" or run the provided generator script to populate projects.json.'));
    return;
  }
  list.forEach((p, i) => {
    const card = dom('div', { class: `card project-card reveal ${p.featured ? 'featured' : ''}`, tabindex: 0, 'data-repo': p.repo, 'data-reveal-delay': 100 + (i * 40) });
    const thumb = dom('img', { class: 'thumb', src: p.thumbnail || '', alt: `${p.name} screenshot` });
    thumb.onerror = () => thumb.style.display = 'none';
    const title = dom('h3', {}, p.name);
    const snippet = p.readme_excerpt ? (p.readme_excerpt.slice(0, 240) + (p.readme_excerpt.length > 240 ? '...' : '')) : (p.desc || '');
    const desc = dom('p', {}, snippet || '');
    const meta = dom('div', { class: 'meta' }, dom('div', {}, p.language || ''), dom('div', {}, `⭐ ${p.stars || 0} • ${p.forks || 0}`));
    const badges = dom('div', { class: 'badges' }, ...((p.tags || []).slice(0, 4).map(t => dom('span', { class: 'badge' }, t))));
    const actions = dom('div', {}, dom('a', { class: 'btn', href: p.repo, target: '_blank', rel: 'noopener' }, 'Code'), dom('button', { class: 'btn open' }, 'Details'));
    card.append(thumb, title, desc, meta, badges, actions);
    container.append(card);

    // open modal with details (lightweight)
    const openBtn = card.querySelector('.open');
    openBtn.addEventListener('click', () => {
      const body = $('#modalBody');
      body.innerHTML = '';
      body.append(dom('h2', {}, p.name, dom('div', { class: 'muted' }, ' · ', p.language || '')));
      body.append(dom('div', { class: 'muted' }, `⭐ ${p.stars || 0} • ${p.forks || 0} forks • ${p.license || ''}`));
      if (p.desc) body.append(dom('p', {}, p.desc));
      if (p.readme_excerpt) body.append(dom('div', { class: 'card' }, dom('pre', { style: 'white-space:pre-wrap;max-height:360px;overflow:auto' }, p.readme_excerpt)));
      if (p.screenshots && p.screenshots.length) {
        const thumbs = dom('div', { class: 'thumbs' });
        p.screenshots.forEach(s => {
          const img = dom('img', { src: s.src, alt: s.alt || p.name, tabindex: 0 });
          img.addEventListener('click', () => openLightbox(s.src, s.alt || p.name));
          thumbs.append(img);
        });
        body.append(thumbs);
      } else if (p.thumbnail) {
        const t = dom('img', { src: p.thumbnail, alt: p.name, class: 'thumb' });
        t.onerror = () => t.style.display = 'none';
        t.addEventListener('click', () => openLightbox(p.thumbnail, p.name));
        body.append(t);
      }
      openModal();
    });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openBtn.click(); });
  });

  // post-render hooks
  setupReveal();
  setupTilt();
}

// filtering/sorting
function applyFilters() {
  const q = ($('#search') && $('#search').value.trim().toLowerCase()) || '';
  const active = document.querySelector('.filter.active')?.dataset.tag || '__all__';
  const sort = $('#sort') ? $('#sort').value : 'featured';
  let list = projectsCache.slice();
  if (active !== '__all__') list = list.filter(p => ((p.tags || []).includes(active) || p.language === active));
  if (q) list = list.filter(p => ((p.name || '') + ' ' + (p.desc || '') + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q));
  if (sort === 'recent') list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  else if (sort === 'stars') list.sort((a, b) => (b.stars || 0) - (a.stars || 0));
  else list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  renderProjects(list);
  updateTimeline(list);
  renderLanguageChart(list);
}

function updateTimeline(list) {
  const root = $('#timeline');
  if (!root) return;
  root.innerHTML = '';
  const sorted = list.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  sorted.forEach(p => root.append(dom('div', {}, dom('div', {}, dom('strong', {}, new Date(p.updated_at).getFullYear()), dom('div', {}, p.name)), dom('div', { style: 'color:var(--muted)' }, p.language || ''))));
}

function renderLanguageChart(list) {
  if (reduceMotion) return;
  const counts = {};
  list.forEach(p => { if (p.language) counts[p.language] = (counts[p.language] || 0) + 1; });
  const labels = Object.keys(counts);
  const data = Object.values(counts);
  const ctx = document.getElementById('langChart');
  if (!ctx) return;
  if (langChart) langChart.destroy();
  langChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: ['#7c3aed', '#06b6d4', '#f97316', '#ef4444', '#22c55e', '#eab308'] }] },
    options: { plugins: { legend: { position: 'bottom' } }, animation: { duration: 700 } }
  });
}

// stats update with animation targets
function updateStats(list) {
  const totalRepos = list.length;
  const totalStars = list.reduce((s, p) => s + (p.stars || 0), 0);
  const totalForks = list.reduce((s, p) => s + (p.forks || 0), 0);
  const languages = Array.from(new Set(list.map(p => p.language).filter(Boolean))).length;
  const elRepos = $('#statRepos'); if (elRepos) elRepos.dataset.target = totalRepos;
  const elStars = $('#statStars'); if (elStars) elStars.dataset.target = totalStars;
  const elForks = $('#statForks'); if (elForks) elForks.dataset.target = totalForks;
  const elLangs = $('#statLangs'); if (elLangs) elLangs.dataset.target = languages;
  setupStatsWatcher();
}

// Primary init: try local JSON, else try GitHub API
async function init() {
  // wire email/contact (set earlier in HTML but ensure text)
  const email = 'm3ryamali27@gmail.com';
  if ($('#contactEmail')) { $('#contactEmail').href = `mailto:${email}`; $('#contactEmail').textContent = email; }

  // modal/lightbox handlers
  $('#modalClose')?.addEventListener('click', () => closeModal());
  $('#modal')?.addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  $('#lbClose')?.addEventListener('click', () => closeLightbox());
  $('#lightbox')?.addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });

  // buttons
  $('#downloadPDF')?.addEventListener('click', () => window.print());
  $('#exportJSON')?.addEventListener('click', () => {
    const data = JSON.stringify({ projects: projectsCache }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'projects.json'; a.click();
    URL.revokeObjectURL(url);
  });
  $('#importBtn')?.addEventListener('click', () => {
    showNotice('To auto-fill projects.json locally, run the provided generator script (see README) or allow the site to fetch your public repos.', 'info');
  });

  // search/sort hooks
  $('#search')?.addEventListener('input', () => applyFilters());
  $('#sort')?.addEventListener('change', () => applyFilters());

  // attempt loading local JSON first
  const local = await tryLoadLocalJson();
  if (local && local.length) {
    projectsCache = local;
    updateStats(projectsCache);
    renderFilters(collectTags(projectsCache));
    renderProjects(projectsCache);
    updateTimeline(projectsCache);
    renderLanguageChart(projectsCache);
    showNotice('Loaded projects.json locally.', 'success');
  } else {
    showNotice('projects.json not found locally. Attempting to fetch your public GitHub repos (maryamali27)…', 'info');
    try {
      const gh = await fetchGitHubRepos(FALLBACK_USERNAME);
      if (!gh || !gh.length) {
        throw new Error('No public repos returned for user: ' + FALLBACK_USERNAME);
      }
      projectsCache = gh;
      updateStats(projectsCache);
      renderFilters(collectTags(projectsCache));
      renderProjects(projectsCache);
      updateTimeline(projectsCache);
      renderLanguageChart(projectsCache);
      showNotice('Loaded public GitHub repos for ' + FALLBACK_USERNAME + '.', 'success');
    } catch (err) {
      console.error('Failed to load projects.json and failed GitHub fetch:', err);
      showNotice('No projects found. To populate the site: (1) run the provided generate_projects.js locally to create projects.json, or (2) deploy to GitHub Pages and click Import. See README for details.', 'error');
      // show empty state
      projectsCache = [];
      renderProjects(projectsCache);
      renderLanguageChart(projectsCache);
    }
  }

  // reveal & interactions
  setupReveal();
  setupTilt();

  // accessibility: ESC closes modal/lightbox
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if ($('#modal')?.getAttribute('aria-hidden') === 'false') closeModal(); if ($('#lightbox')?.getAttribute('aria-hidden') === 'false') closeLightbox(); }
  });

  // observe project container for added nodes (re-apply tilt / reveal)
  const container = $('#projects');
  if (container) {
    const mo = new MutationObserver(() => { setupTilt(); setupReveal(); });
    mo.observe(container, { childList: true, subtree: true });
  }
}

// Kick off
init();