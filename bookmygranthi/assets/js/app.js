/* ==========================================================================
   BookMyGranthi — shared runtime (header, footer, helpers, components)
   ========================================================================== */
(function () {
  const D = window.BMG_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Icons ---------- */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6l-7-3z"/><path d="m9 12 2.2 2.2L15 10.4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    left: '<path d="m14.5 6-6 6 6 6"/>',
    right: '<path d="m9.5 6 6 6-6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z"/>',
    book: '<path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16V4.5z"/><path d="M5 16a3.5 3.5 0 0 1 3.5-3.5H19"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6M18 14.8c1.9.6 3 2.2 3.4 4.7"/>',
    phone: '<path d="M5 4.5h3.5l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A14.5 14.5 0 0 1 3 6.5a2 2 0 0 1 2-2z"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    home: '<path d="M4 11 12 4l8 7v8.5a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1V11z"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
    print: '<path d="M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>'
  };
  const icon = (n, s = 20) =>
    `<svg class="icon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  /* ---------- Lookups ---------- */
  const service = (id) => D.SERVICES.find((s) => s.id === id);
  const group = (id) => D.GROUPS.find((g) => g.id === id);
  const granthi = (id) => D.GRANTHIS.find((g) => g.id === id);
  const slot = (id) => D.SLOTS.find((s) => s.id === id);
  const venue = (id) => D.VENUES.find((v) => v.id === id);
  const fullName = (g) => `${g.honorific} ${g.name}`;
  const initials = (g) => g.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const where = (g) => `${g.city}, ${g.region === g.city ? g.country : g.region}`;

  /* ---------- Hash / dates ---------- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmtDate = (iso, opts) => fromISO(iso).toLocaleDateString('en-GB', opts || { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtShort = (iso) => fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });

  /* ---------- Pricing ---------- */
  function priceFor(g, sid) {
    const s = service(sid);
    const raw = s.base * g.tier * (D.FX[g.currency] || 1);
    return Math.round(raw / 5) * 5;
  }
  const money = (g, n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: g.currency, maximumFractionDigits: 0 }).format(n);
  const fromPrice = (g, sid) => {
    const ids = sid ? [sid] : g.services;
    return Math.min(...ids.map((id) => priceFor(g, id)));
  };

  /* ---------- Availability (sample logic) ----------
     Deterministic so the demo is stable. Replace with real calendar data
     (see README → "Going live"). */
  function isDayAvailable(g, iso) {
    const diff = Math.round((fromISO(iso) - today()) / 864e5);
    if (diff < 0 || diff > 365) return false;
    if (diff < 2 && !g.shortNotice) return false;
    return hash(g.id + iso) % 100 >= 24;
  }
  function slotsFor(g, iso) {
    if (!isDayAvailable(g, iso)) return [];
    const open = D.SLOTS.filter((s) => hash(g.id + iso + s.id) % 100 >= 20);
    return open.length ? open : [D.SLOTS[1]];
  }
  function nextAvailable(g, from) {
    let d = from ? fromISO(from) : today();
    for (let i = 0; i < 120; i++) { const iso = toISO(d); if (isDayAvailable(g, iso)) return iso; d = addDays(d, 1); }
    return null;
  }
  const relativeDay = (iso) => {
    const diff = Math.round((fromISO(iso) - today()) / 864e5);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    return fmtShort(iso);
  };

  /* ---------- Storage ---------- */
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem('bmg.' + k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem('bmg.' + k, JSON.stringify(v)); return true; } catch { return false; } },
    sGet(k, fallback) { try { const v = sessionStorage.getItem('bmg.' + k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    sSet(k, v) { try { sessionStorage.setItem('bmg.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
    sDel(k) { try { sessionStorage.removeItem('bmg.' + k); } catch { /* ignore */ } }
  };

  /* Saves locally and, if CONFIG.endpoint is set, also POSTs the JSON. */
  async function submit(kind, payload) {
    const list = store.get(kind, []);
    list.push(payload);
    store.set(kind, list);
    if (D.CONFIG.endpoint) {
      try {
        await fetch(D.CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ kind, ...payload }) });
      } catch (e) { console.warn('Could not reach endpoint; saved locally only.', e); }
    }
    return payload;
  }

  const refCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return 'BMG-' + s;
  };

  /* ---------- URL helpers ---------- */
  const qs = () => new URLSearchParams(location.search);

  /* ---------- Components ---------- */
  const avatarTint = ['#f6efe4', '#e8eef4', '#edf1e6', '#f4e9ee', '#ece8f3', '#f1ece4'];
  function avatar(g, size) {
    const bg = avatarTint[hash(g.id) % avatarTint.length];
    return `<span class="avatar${size === 'lg' ? ' lg' : ''}" style="background:${bg}" aria-hidden="true">${esc(initials(g))}</span>`;
  }
  const ratingEl = (g, showCount = true) =>
    `<span class="rating">${icon('star', 15)}${g.rating.toFixed(1)}${showCount ? `<small>(${g.ratingCount})</small>` : ''}</span>`;

  function granthiCard(g, opts = {}) {
    const sid = opts.service && g.services.includes(opts.service) ? opts.service : null;
    const price = fromPrice(g, sid);
    const nxt = nextAvailable(g, opts.date);
    const shown = g.services.slice(0, 3).map((id) => `<span class="chip">${esc(service(id).name)}</span>`).join('');
    const more = g.services.length > 3 ? `<span class="chip outline">+${g.services.length - 3}</span>` : '';
    const params = new URLSearchParams({ id: g.id });
    if (sid) params.set('service', sid);
    if (opts.date) params.set('date', opts.date);
    return `
      <article class="gcard">
        <div class="gcard-top">
          ${avatar(g)}
          <div style="min-width:0">
            <h3><a href="granthi.html?${params}">${esc(fullName(g))}</a></h3>
            <div class="gmeta">${icon('pin', 14)}<span>${esc(where(g))}</span></div>
          </div>
        </div>
        <div class="gcard-mid">
          <div class="row wrap" style="--gap:12px">
            ${ratingEl(g)}
            ${g.verified ? `<span class="verified">${icon('shield', 15)}Verified</span>` : ''}
            ${g.shortNotice ? `<span class="chip accent">${icon('bolt', 13)}Short notice</span>` : ''}
          </div>
          <div class="small muted">${g.years} years of Sewa · ${esc(g.langs.join(', '))}</div>
          <div class="tags">${shown}${more}</div>
        </div>
        <div class="gcard-foot">
          <div class="price">${sid ? esc(service(sid).name) + ' from' : 'From'}<strong>${money(g, price)}</strong></div>
          ${nxt ? `<div class="next">${icon('calendar', 14)}Next: ${esc(relativeDay(nxt))}</div>` : '<div class="next muted">No dates soon</div>'}
        </div>
      </article>`;
  }

  /* Month calendar. opts: { granthi, selected (iso), onSelect(iso), min (iso) } */
  function calendar(root, opts = {}) {
    const g = opts.granthi || null;
    let selected = opts.selected || null;
    const start = selected ? fromISO(selected) : (g && nextAvailable(g) ? fromISO(nextAvailable(g)) : today());
    let view = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthStart = new Date(today().getFullYear(), today().getMonth(), 1);

    function ok(iso) {
      if (g) return isDayAvailable(g, iso);
      return fromISO(iso) >= today();
    }
    function render() {
      const y = view.getFullYear(), m = view.getMonth();
      const first = new Date(y, m, 1);
      const lead = (first.getDay() + 6) % 7; // Monday first
      const days = new Date(y, m + 1, 0).getDate();
      const t = toISO(today());
      let cells = '';
      for (let i = 0; i < lead; i++) cells += '<span class="cal-empty"></span>';
      for (let d = 1; d <= days; d++) {
        const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
        const can = ok(iso);
        cells += `<button type="button" class="cal-day${iso === t ? ' today' : ''}${iso === selected ? ' sel' : ''}${can && g ? ' avail' : ''}" data-iso="${iso}" ${can ? '' : 'disabled'} aria-label="${esc(fmtDate(iso))}${can ? '' : ', unavailable'}" aria-pressed="${iso === selected}">${d}</button>`;
      }
      const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<span class="cal-dow">${x}</span>`).join('');
      root.innerHTML = `
        <div class="cal">
          <div class="cal-head">
            <span class="cal-title">${view.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
            <span class="cal-nav">
              <button type="button" data-nav="-1" aria-label="Previous month" ${view <= monthStart ? 'disabled' : ''}>${icon('left', 16)}</button>
              <button type="button" data-nav="1" aria-label="Next month">${icon('right', 16)}</button>
            </span>
          </div>
          <div class="cal-grid">${dows}${cells}</div>
          ${g ? `<div class="cal-legend"><span><i></i>Available</span></div>` : ''}
        </div>`;
    }
    root.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { view = new Date(view.getFullYear(), view.getMonth() + Number(nav.dataset.nav), 1); render(); return; }
      const day = e.target.closest('.cal-day');
      if (day && !day.disabled) { selected = day.dataset.iso; render(); opts.onSelect && opts.onSelect(selected); }
    });
    render();
    return { set(iso) { selected = iso; if (iso) { const d = fromISO(iso); view = new Date(d.getFullYear(), d.getMonth(), 1); } render(); }, get: () => selected };
  }

  /* Slot picker */
  function slotPicker(root, g, iso, selected, onChange, name = 'slot') {
    const slots = iso ? slotsFor(g, iso) : [];
    const ids = slots.map((s) => s.id);
    root.innerHTML = `<div class="slots" role="radiogroup" aria-label="Time of day">${D.SLOTS.map((s) => `
      <label class="slot"><input type="radio" name="${name}" value="${s.id}" ${ids.includes(s.id) ? '' : 'disabled'} ${s.id === selected ? 'checked' : ''}>
      <span class="box">${esc(s.label)}<span>${esc(s.time)}</span></span></label>`).join('')}</div>`;
    root.addEventListener('change', (e) => { if (e.target.name === name) onChange(e.target.value); });
  }

  /* ---------- Chrome: header + footer ---------- */
  function renderChrome() {
    const page = document.body.dataset.page || '';
    const cur = (p) => (page === p ? ' aria-current="page"' : '');
    const nav = [
      ['find', 'find.html', 'Find a granthi'],
      ['ceremonies', 'ceremonies.html', 'Ceremonies'],
      ['how', 'index.html#how', 'How it works'],
      ['join', 'join.html', 'For granthis']
    ];
    const header = $('#site-header');
    if (header) {
      header.outerHTML = `
        ${D.CONFIG.demo ? `<div class="notice">Preview build: listings are sample data and requests are not sent to real granthis yet.</div>` : ''}
        <header class="site-header" id="top">
          <div class="container bar">
            <a class="logo" href="index.html" aria-label="${D.CONFIG.brand} home"><span class="logo-mark" aria-hidden="true">ੴ</span><span>${D.CONFIG.brand}</span></a>
            <nav class="nav" aria-label="Main">
              ${nav.map(([id, href, label]) => `<a href="${href}"${cur(id)}>${label}</a>`).join('')}
            </nav>
            <div class="header-actions">
              <a class="btn btn-quiet" href="bookings.html"${cur('bookings')}>My bookings</a>
              <a class="btn btn-primary" href="find.html">Book a granthi</a>
            </div>
            <button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav">${icon('menu', 22)}</button>
          </div>
          <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile">
            ${nav.map(([, href, label]) => `<a href="${href}">${label}</a>`).join('')}
            <a href="bookings.html">My bookings</a>
            <a class="btn btn-primary btn-lg" href="find.html">Book a granthi</a>
          </nav>
        </header>`;
      const hdr = $('.site-header');
      const btn = $('.menu-btn', hdr);
      btn.addEventListener('click', () => {
        const open = hdr.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
        btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        btn.innerHTML = icon(open ? 'x' : 'menu', 22);
      });
    }

    const footer = $('#site-footer');
    if (footer) {
      footer.outerHTML = `
        <footer class="site-footer">
          <div class="container">
            <div class="footer-grid">
              <div class="stack" style="--gap:14px">
                <a class="logo" href="index.html"><span class="logo-mark" aria-hidden="true">ੴ</span><span>${D.CONFIG.brand}</span></a>
                <p class="muted small" style="max-width:34ch">Find and book trusted Sikh granthis for Anand Karaj, Akhand Path, Sehaj Path, Naamkaran, Antam Sanskar and every occasion in between.</p>
              </div>
              <div><h4>Explore</h4><ul>
                <li><a href="find.html">Find a granthi</a></li>
                <li><a href="ceremonies.html">Ceremonies guide</a></li>
                <li><a href="bookings.html">My bookings</a></li>
                <li><a href="index.html#faq">FAQ</a></li></ul></div>
              <div><h4>Ceremonies</h4><ul>
                <li><a href="ceremonies.html#anand-karaj">Anand Karaj</a></li>
                <li><a href="ceremonies.html#akhand-path">Akhand Path</a></li>
                <li><a href="ceremonies.html#sehaj-path">Sehaj Path</a></li>
                <li><a href="ceremonies.html#naamkaran">Naamkaran</a></li>
                <li><a href="ceremonies.html#antam-sanskar">Antam Sanskar</a></li></ul></div>
              <div><h4>Company</h4><ul>
                <li><a href="about.html">About us</a></li>
                <li><a href="join.html">For granthis</a></li>
                <li><a href="contact.html">Contact</a></li>
                <li><a href="privacy.html">Privacy</a></li>
                <li><a href="terms.html">Terms</a></li></ul></div>
            </div>
            <div class="footer-bottom">
              <span>© ${D.CONFIG.year} ${D.CONFIG.brand}. All rights reserved.</span>
              <span>Made with respect for the Sangat.</span>
            </div>
          </div>
        </footer>`;
    }
  }

  /* ---------- Misc behaviours ---------- */
  function reveal() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
  }

  /* Generic validation helper for forms using .field wrappers */
  function validateForm(form) {
    let firstBad = null;
    $$('[data-req]', form).forEach((input) => {
      const wrap = input.closest('.field') || input.closest('.check');
      const val = input.type === 'checkbox' ? input.checked : String(input.value || '').trim();
      let bad = !val;
      if (!bad && input.type === 'email') bad = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
      if (!bad && input.type === 'tel') bad = String(val).replace(/\D/g, '').length < 7;
      wrap && wrap.classList.toggle('invalid', bad);
      if (bad && !firstBad) firstBad = input;
    });
    if (firstBad) firstBad.focus({ preventScroll: false });
    return !firstBad;
  }
  document.addEventListener('input', (e) => {
    const wrap = e.target.closest && (e.target.closest('.field') || e.target.closest('.check'));
    if (wrap && wrap.classList.contains('invalid')) wrap.classList.remove('invalid');
  });

  /* ICS calendar file */
  function downloadICS(b) {
    const g = granthi(b.granthiId), s = service(b.serviceId), sl = slot(b.slot);
    const startHour = { early: 5, morning: 8, afternoon: 12, evening: 16 }[b.slot] || 9;
    const d = b.date.replace(/-/g, '');
    const dt = (h) => `${d}T${pad(h)}0000`;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BookMyGranthi//EN', 'BEGIN:VEVENT',
      `UID:${b.ref}@bookmygranthi`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${dt(startHour)}`, `DTEND:${dt(startHour + 3)}`,
      `SUMMARY:${s.name} with ${fullName(g)}`,
      `LOCATION:${(b.address || '').replace(/[,;\n]/g, ' ')}`,
      `DESCRIPTION:Booking ${b.ref} (${sl ? sl.label : ''}). Requested via BookMyGranthi.`,
      'END:VEVENT', 'END:VCALENDAR'
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${b.ref}.ics`; document.body.appendChild(a); a.click(); a.remove();
  }

  /* Populate a <select> with grouped ceremonies */
  function serviceOptions(selected, placeholder = 'Any ceremony') {
    return `<option value="">${esc(placeholder)}</option>` + D.GROUPS.map((gr) =>
      `<optgroup label="${esc(gr.label)}">${D.SERVICES.filter((s) => s.group === gr.id).map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>`
    ).join('');
  }

  const BMG = {
    D, $, $$, esc, icon, qs, store, submit, refCode,
    service, group, granthi, slot, venue, fullName, initials, where,
    hash, toISO, fromISO, today, addDays, fmtDate, fmtShort, relativeDay,
    priceFor, money, fromPrice, isDayAvailable, slotsFor, nextAvailable,
    avatar, ratingEl, granthiCard, calendar, slotPicker, validateForm, downloadICS, serviceOptions
  };
  window.BMG = BMG;

  document.documentElement.classList.remove('no-js');
  renderChrome();
  reveal();
})();
