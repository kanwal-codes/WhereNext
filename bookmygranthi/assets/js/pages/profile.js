(function () {
  const B = window.BMG;
  const { D, $, esc, icon, service, granthi, fullName, where, money, priceFor, fromPrice, avatar, ratingEl, fmtDate, nextAvailable } = B;
  const root = $('#profile');
  const p = B.qs();
  const g = granthi(p.get('id'));

  if (!g) {
    root.innerHTML = `
      <div class="page-head" style="min-height:50vh;align-content:center;justify-items:start">
        <h1 style="font-size:clamp(2.2rem,4.6vw,3.4rem)">We couldn’t find that granthi.</h1>
        <p class="lead">The profile may have moved. Browse everyone available to find who you’re looking for.</p>
        <a class="btn btn-primary btn-lg" href="find.html">Browse granthis</a>
      </div>`;
    return;
  }

  document.title = `${fullName(g)}, ${g.city} — BookMyGranthi`;
  const md = document.querySelector('meta[name="description"]');
  if (md) md.content = `${fullName(g)} offers ${g.services.slice(0, 3).map((id) => service(id).name).join(', ')} in ${g.city}. ${g.years} years of Sewa.`;

  // State from URL
  let sid = g.services.includes(p.get('service')) ? p.get('service') : g.services[0];
  let date = p.get('date') && B.isDayAvailable(g, p.get('date')) ? p.get('date') : null;
  let slot = null;

  const next = nextAvailable(g);
  const gender = g.honorific === 'Bibi' ? 'her' : 'his';

  const bioHtml = g.bio.split('\n\n').map((t) => `<p>${esc(t)}</p>`).join('');

  const svcRows = g.services.map((id) => {
    const s = service(id);
    return `
      <div class="svc-row">
        <div class="name"><strong>${esc(s.name)} <span class="pa" style="color:var(--accent)">&nbsp;${esc(s.pa)}</span></strong><span>${esc(s.duration)} · ${esc(s.short)}</span></div>
        <div class="right"><span class="price">${money(g, priceFor(g, id))}</span><button class="btn btn-ghost btn-sm" data-pick="${id}" type="button">Select</button></div>
      </div>`;
  }).join('');

  const reviews = g.reviews.map((r) => `
    <article class="review">
      <div class="rating">${icon('star', 15)}5.0</div>
      <p>${esc(r.text)}</p>
      <div class="who"><strong>${esc(r.name)}</strong><span>·</span><span>${esc(r.place)}</span><span>·</span><span>${esc(service(r.service).name)}, ${esc(r.when)}</span></div>
    </article>`).join('');

  root.innerHTML = `
    <header class="page-head">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><a href="find.html">Find a granthi</a><span>/</span><span>${esc(fullName(g))}</span></nav>
    </header>
    <div class="profile-layout">
      <div>
        <div class="profile-head">
          ${avatar(g, 'lg')}
          <div class="stack" style="--gap:10px">
            <h1>${esc(fullName(g))}</h1>
            <div class="row wrap" style="--gap:14px">
              <span class="gmeta">${icon('pin', 15)}${esc(where(g))}</span>
              ${ratingEl(g)}
              ${g.verified ? `<span class="verified">${icon('shield', 15)}Verified</span>` : '<span class="chip">Verification in progress</span>'}
              ${g.shortNotice ? `<span class="chip accent">${icon('bolt', 13)}Short notice</span>` : ''}
            </div>
          </div>
        </div>

        <dl class="facts">
          <div><dt>Experience</dt><dd>${g.years} years of Sewa</dd></div>
          <div><dt>Languages</dt><dd>${esc(g.langs.join(', '))}</dd></div>
          <div><dt>Travels</dt><dd>${esc(g.travel)}</dd></div>
          <div><dt>Responds</dt><dd>${esc(g.responds)}</dd></div>
        </dl>

        <section class="prose-block" style="margin-top:36px">
          <h2>About ${esc(g.honorific)} ${esc(g.name.split(' ')[0])}</h2>
          ${bioHtml}
          <div class="affil">${icon('home', 16)}<span>${esc(g.affiliation)}</span></div>
        </section>

        <section class="prose-block" id="services">
          <h2>Ceremonies &amp; suggested seva</h2>
          <div class="svc-list">${svcRows}</div>
          <p class="small muted" style="margin-top:14px">Suggested seva is ${esc(gender)} guideline. You settle it directly with ${esc(g.honorific)} ${esc(g.name.split(' ')[0])}; nothing is charged through BookMyGranthi. <a class="link" href="ceremonies.html" style="margin-left:4px">Learn about each ceremony</a></p>
        </section>

        <section class="prose-block">
          <h2>Reviews</h2>
          <div class="row" style="margin-bottom:22px;--gap:10px">${ratingEl(g, false)}<span class="muted small">${g.ratingCount} reviews from families</span></div>
          <div class="reviews">${reviews}</div>
        </section>
      </div>

      <aside id="book" aria-label="Request a booking">
        <div class="book-card">
          <div class="from"><span class="muted small">From</span><strong id="bc-price"></strong></div>
          <div class="field">
            <label for="bc-service">Ceremony</label>
            <select class="select" id="bc-service">${g.services.map((id) => `<option value="${id}">${esc(service(id).name)} · ${money(g, priceFor(g, id))}</option>`).join('')}</select>
          </div>
          <div class="field">
            <span class="label">Choose a date</span>
            <div id="bc-cal"></div>
          </div>
          <div class="field hide" id="bc-slot-wrap">
            <span class="label">Time of day</span>
            <div id="bc-slots"></div>
          </div>
          <a class="btn btn-primary btn-lg btn-block" id="bc-go" href="#">Request booking</a>
          <p class="xs muted center" style="margin-top:-6px">Free to request · Pay the granthi directly</p>
        </div>
      </aside>
    </div>

    <div class="mobile-bar" aria-hidden="false">
      <div class="p">From<strong>${money(g, fromPrice(g))}</strong></div>
      <a class="btn btn-primary" href="#book">Check availability</a>
    </div>`;

  /* ----- Booking card behaviour ----- */
  const sel = $('#bc-service');
  sel.value = sid;
  const goBtn = $('#bc-go');
  const slotWrap = $('#bc-slot-wrap');

  function updatePrice() { $('#bc-price').textContent = money(g, priceFor(g, sid)); }

  function drawSlots() {
    slotWrap.classList.toggle('hide', !date);
    if (!date) return;
    const old = $('#bc-slots');
    const fresh = old.cloneNode(false); // new node drops old listeners
    old.replaceWith(fresh);
    B.slotPicker(fresh, g, date, slot, (v) => { slot = v; updateLink(); }, 'bc-slot');
  }

  function updateLink() {
    const q = new URLSearchParams({ granthi: g.id, service: sid });
    if (date) q.set('date', date);
    if (date && slot) q.set('slot', slot);
    goBtn.href = 'book.html?' + q;
    goBtn.textContent = date ? 'Continue to request' : 'Request booking';
  }

  const cal = B.calendar($('#bc-cal'), {
    granthi: g, selected: date,
    onSelect: (iso) => { date = iso; slot = null; drawSlots(); updateLink(); }
  });

  sel.addEventListener('change', () => { sid = sel.value; updatePrice(); updateLink(); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    sid = b.dataset.pick; sel.value = sid; updatePrice(); updateLink();
    $('#book').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  updatePrice(); drawSlots(); updateLink();
})();
