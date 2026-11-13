(function () {
  const B = window.BMG;
  const { D, $, $$, esc, icon, service, granthi, slot: slotById, venue: venueById, fullName, where, money, priceFor, avatar, fmtDate } = B;
  const p = B.qs();
  const g = granthi(p.get('granthi'));
  if (!g) { location.replace('find.html'); return; }

  const STEPS = ['Ceremony', 'Date & place', 'Your details', 'Review'];
  const DRAFT_KEY = 'draft-' + g.id;

  // ---- state (URL params win, then saved draft) ----
  const saved = B.store.sGet(DRAFT_KEY, {});
  const state = Object.assign({
    serviceId: g.services[0], date: '', slot: '', venue: '', address: '', guests: '', urgent: false,
    name: '', email: '', phone: '', lang: '', notes: '', agree: false, step: 1
  }, saved);
  if (g.services.includes(p.get('service'))) state.serviceId = p.get('service');
  if (p.get('date') && B.isDayAvailable(g, p.get('date'))) { state.date = p.get('date'); if (p.get('slot') && B.slotsFor(g, state.date).some((s) => s.id === p.get('slot'))) state.slot = p.get('slot'); }
  // arrived with a service already chosen on the profile → skip to date step
  if ((p.get('service') || p.get('date')) && !saved.step) state.step = 2;
  if (!state.lang) state.lang = g.langs[0];

  const persist = () => B.store.sSet(DRAFT_KEY, state);
  const wizard = $('#wizard');
  const stepper = $('#stepper');
  const summary = $('#summary');
  const svc = () => service(state.serviceId);
  const isFuneral = () => svc().group === 'funeral';

  /* ---------- Chrome: stepper + summary ---------- */
  function drawStepper() {
    stepper.innerHTML = STEPS.map((label, i) => {
      const n = i + 1;
      const cls = n === state.step ? 'current' : n < state.step ? 'done' : '';
      return `<li class="${cls}" ${n === state.step ? 'aria-current="step"' : ''}><span class="n">${n < state.step ? icon('check', 13) : n}</span><span class="label">${label}</span></li>`;
    }).join('');
  }

  function drawSummary() {
    const price = priceFor(g, state.serviceId);
    const val = (v, ph = 'Not chosen yet') => v ? esc(v) : `<span class="empty-val">${ph}</span>`;
    const v = venueById(state.venue);
    const sl = slotById(state.slot);
    summary.innerHTML = `
      <div class="panel">
        <div class="summary-who">
          ${avatar(g)}
          <div style="min-width:0">
            <strong>${esc(fullName(g))}</strong>
            <div class="gmeta">${icon('pin', 14)}<span>${esc(where(g))}</span></div>
          </div>
        </div>
        <dl class="dl" style="padding-block:8px">
          <div><dt>Ceremony</dt><dd>${esc(svc().name)}</dd></div>
          <div><dt>Date</dt><dd>${val(state.date && fmtDate(state.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</dd></div>
          <div><dt>Time</dt><dd>${val(sl && sl.label)}</dd></div>
          <div><dt>Venue</dt><dd>${val(v && v.label)}</dd></div>
          <div class="total"><dt>Suggested seva</dt><dd>${money(g, price)}</dd></div>
          <div><dt>Booking fee</dt><dd>${money(g, 0)}</dd></div>
        </dl>
        <div style="padding:0 22px 20px"><p class="xs muted">You pay nothing now. Seva is settled directly with the granthi.</p></div>
      </div>`;
  }

  /* ---------- Steps ---------- */
  function step1() {
    wizard.innerHTML = `
      <section class="wizard-step" aria-labelledby="h">
        <h2 id="h" tabindex="-1">What would you like ${esc(g.honorific)} ${esc(g.name.split(' ')[0])} to lead?</h2>
        <p class="lead">Choose a ceremony. You can’t go wrong. Your granthi will help with the details.</p>
        <div class="choices" role="radiogroup" aria-label="Ceremony">
          ${g.services.map((id) => {
            const s = service(id);
            return `<label class="choice"><input type="radio" name="service" value="${id}" ${id === state.serviceId ? 'checked' : ''}>
              <span class="box"><span class="t"><strong>${esc(s.name)} <span class="pa" style="color:var(--accent);font-size:.95em">&nbsp;${esc(s.pa)}</span></strong><span>${esc(s.duration)}</span></span>
              <span class="p">${money(g, priceFor(g, id))}</span></span></label>`;
          }).join('')}
        </div>
        <p class="small muted" style="margin-top:16px">Not sure what to choose? <a class="link" href="ceremonies.html" target="_blank" rel="noopener">Read the ceremonies guide</a></p>
        ${nav(false)}
      </section>`;
    wizard.onchange = (e) => {
      if (e.target.name === 'service') {
        state.serviceId = e.target.value;
        if (!isFuneral()) state.urgent = false;
        persist(); drawSummary();
      }
    };
  }

  function step2() {
    wizard.innerHTML = `
      <section class="wizard-step" aria-labelledby="h">
        <h2 id="h" tabindex="-1">When and where?</h2>
        <p class="lead">Green dots mark days ${esc(g.honorific)} ${esc(g.name.split(' ')[0])} is free.</p>
        <div class="grid c2" style="--gap:28px;align-items:start">
          <div class="field"><span class="label">Date</span><div id="cal"></div><span class="error" id="e-date" role="alert">Please choose a date.</span></div>
          <div class="field" id="slot-field"><span class="label">Time of day</span><div id="slots"></div><span class="error" id="e-slot" role="alert">Please choose a time.</span></div>
        </div>
        <div class="stack" style="--gap:24px;margin-top:32px">
          <div class="field" id="f-venue">
            <span class="label">Venue</span>
            <div class="pill-choices" role="radiogroup" aria-label="Venue">
              ${D.VENUES.map((v) => `<label class="choice"><input type="radio" name="venue" value="${v.id}" ${v.id === state.venue ? 'checked' : ''}><span class="box">${esc(v.label)}</span></label>`).join('')}
            </div>
            <span class="error" role="alert">Please choose a venue.</span>
          </div>
          <div class="form-grid">
            <div class="field full" id="f-address">
              <label for="address">Address or venue name</label>
              <input class="input" id="address" name="address" type="text" value="${esc(state.address)}" placeholder="e.g. Guru Nanak Gurdwara, or 12 Park Road, ${esc(g.city)}" data-req autocomplete="street-address">
              <span class="error" role="alert">Please tell us where the ceremony will be.</span>
            </div>
            <div class="field">
              <label for="guests">Expected guests <span class="muted">(optional)</span></label>
              <input class="input" id="guests" name="guests" type="number" min="1" max="2000" inputmode="numeric" value="${esc(state.guests)}" placeholder="e.g. 120">
            </div>
          </div>
          ${isFuneral() ? `
            <div class="note warn">${icon('bolt', 18)}<div><label class="check"><input type="checkbox" id="urgent" ${state.urgent ? 'checked' : ''}><span><strong style="color:var(--ink)">This is urgent.</strong> ${g.shortNotice ? 'The granthi will be alerted straight away.' : 'This granthi may not be able to respond at very short notice, so we’ll suggest alternatives if needed.'}</span></label></div></div>` : ''}
        </div>
        ${nav(true)}
      </section>`;

    const calRoot = $('#cal');
    const drawSlots = () => {
      const old = $('#slots');
      const fresh = old.cloneNode(false); // fresh node drops old listeners
      old.replaceWith(fresh);
      B.slotPicker(fresh, g, state.date, state.slot, (v) => { state.slot = v; $('#slot-field').classList.remove('invalid'); persist(); drawSummary(); });
    };
    B.calendar(calRoot, {
      granthi: g, selected: state.date,
      onSelect: (iso) => {
        state.date = iso;
        if (!B.slotsFor(g, iso).some((s) => s.id === state.slot)) state.slot = '';
        calRoot.closest('.field').classList.remove('invalid');
        drawSlots(); persist(); drawSummary();
      }
    });
    drawSlots();

    wizard.onchange = (e) => {
      const n = e.target.name;
      if (n === 'venue') {
        state.venue = e.target.value; $('#f-venue').classList.remove('invalid');
        const hints = { gurdwara: 'Gurdwara name and town', home: 'Home address', hall: 'Hall name and address', funeral: 'Funeral home or crematorium', other: 'Address or venue name' };
        $('label[for="address"]').textContent = hints[state.venue] || 'Address or venue name';
      }
      if (n === 'guests') state.guests = e.target.value;
      if (e.target.id === 'urgent') state.urgent = e.target.checked;
      persist(); drawSummary();
    };
    wizard.oninput = (e) => { if (e.target.name === 'address') { state.address = e.target.value; persist(); } };
  }

  function step3() {
    wizard.innerHTML = `
      <section class="wizard-step" aria-labelledby="h">
        <h2 id="h" tabindex="-1">Your details</h2>
        <p class="lead">So ${esc(g.honorific)} ${esc(g.name.split(' ')[0])} can confirm and get in touch. We only share these with your granthi.</p>
        <div class="form-grid">
          <div class="field full"><label for="name">Full name</label><input class="input" id="name" name="name" value="${esc(state.name)}" data-req autocomplete="name"><span class="error" role="alert">Please enter your name.</span></div>
          <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" value="${esc(state.email)}" data-req autocomplete="email" inputmode="email"><span class="error" role="alert">Please enter a valid email address.</span></div>
          <div class="field"><label for="phone">Phone or WhatsApp</label><input class="input" id="phone" name="phone" type="tel" value="${esc(state.phone)}" data-req autocomplete="tel" inputmode="tel"><span class="error" role="alert">Please enter a phone number.</span></div>
          <div class="field full"><label for="lang">Preferred language for the ceremony</label>
            <select class="select" id="lang" name="lang">${g.langs.map((l) => `<option ${l === state.lang ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
          <div class="field full"><label for="notes">Anything your granthi should know? <span class="muted">(optional)</span></label>
            <textarea class="textarea" id="notes" name="notes" placeholder="${isFuneral() ? 'Names for Ardaas, timings from the funeral director, anything that would help.' : 'Names for the Ardaas, family traditions, whether guests may be new to Sikh ceremonies.'}">${esc(state.notes)}</textarea></div>
        </div>
        ${nav(true)}
      </section>`;
    wizard.oninput = wizard.onchange = (e) => { if (e.target.name in state) { state[e.target.name] = e.target.value; persist(); } };
  }

  function step4() {
    const v = venueById(state.venue), sl = slotById(state.slot);
    const row = (k, val) => `<div><dt>${k}</dt><dd>${val}</dd></div>`;
    wizard.innerHTML = `
      <section class="wizard-step" aria-labelledby="h">
        <h2 id="h" tabindex="-1">Review and send</h2>
        <p class="lead">Check everything below. You can change anything before sending.</p>
        <div class="panel" style="margin-bottom:20px">
          <dl class="dl" style="padding-block:8px">
            ${row('Granthi', esc(fullName(g)))}
            ${row('Ceremony', esc(svc().name))}
            ${row('Date', esc(fmtDate(state.date)))}
            ${row('Time', esc(sl.label) + ' · ' + esc(sl.time))}
            ${row('Venue', esc(v.label) + '<br><span class="muted small" style="font-weight:400">' + esc(state.address) + '</span>')}
            ${state.guests ? row('Guests', esc(state.guests)) : ''}
            ${state.urgent ? row('Priority', '<span class="chip accent">Urgent</span>') : ''}
            ${row('You', esc(state.name) + '<br><span class="muted small" style="font-weight:400">' + esc(state.email) + ' · ' + esc(state.phone) + '</span>')}
            ${row('Language', esc(state.lang))}
            ${state.notes ? row('Notes', '<span style="font-weight:400">' + esc(state.notes) + '</span>') : ''}
            <div class="total"><dt>Suggested seva</dt><dd>${money(g, priceFor(g, state.serviceId))}</dd></div>
          </dl>
        </div>
        <div class="note" style="margin-bottom:22px">${icon('info', 18)}<div>This is a request, not a confirmed booking. ${esc(g.honorific)} ${esc(g.name.split(' ')[0])} usually responds ${esc(g.responds)}. You pay nothing now.</div></div>
        <label class="check" id="agree-wrap"><input type="checkbox" id="agree" data-req ${state.agree ? 'checked' : ''}>
          <span>I agree to the <a href="terms.html" target="_blank" rel="noopener" style="text-decoration:underline">terms</a> and <a href="privacy.html" target="_blank" rel="noopener" style="text-decoration:underline">privacy policy</a>, and that my details may be shared with this granthi.</span></label>
        <div class="wizard-actions">
          <button class="btn btn-ghost" type="button" data-back>Back</button>
          <button class="btn btn-primary btn-lg" type="button" id="send">Send request ${icon('arrow', 16)}</button>
        </div>
      </section>`;
    wizard.onchange = (e) => { if (e.target.id === 'agree') { state.agree = e.target.checked; persist(); } };
    $('#send').addEventListener('click', async (e) => {
      if (!B.validateForm(wizard)) return;
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Sending…';
      const booking = {
        ref: B.refCode(), granthiId: g.id, serviceId: state.serviceId, date: state.date, slot: state.slot,
        venue: state.venue, address: state.address.trim(), guests: state.guests, urgent: !!state.urgent,
        name: state.name.trim(), email: state.email.trim(), phone: state.phone.trim(), lang: state.lang, notes: state.notes.trim(),
        seva: priceFor(g, state.serviceId), currency: g.currency, status: 'requested', createdAt: new Date().toISOString()
      };
      await B.submit('bookings', booking);
      B.store.sDel(DRAFT_KEY);
      location.href = 'confirmation.html?ref=' + booking.ref;
    });
  }

  /* ---------- Navigation ---------- */
  function nav(back) {
    return `<div class="wizard-actions">
      ${back ? '<button class="btn btn-ghost" type="button" data-back>Back</button>' : '<a class="btn btn-quiet" href="granthi.html?id=' + g.id + '">Cancel</a>'}
      <button class="btn btn-primary btn-lg" type="button" data-next>Continue ${icon('arrow', 16)}</button>
    </div>`;
  }

  function validate() {
    if (state.step === 2) {
      const flag = (el, bad) => { el.classList.toggle('invalid', bad); return bad; };
      const bad = [
        flag($('#cal').closest('.field'), !state.date),
        flag($('#slot-field'), !!state.date && !state.slot),
        flag($('#f-venue'), !state.venue),
        flag($('#f-address'), !$('#address').value.trim())
      ].some(Boolean);
      if (bad) { const first = $('.field.invalid'); first && first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return !bad;
    }
    if (state.step === 3) return B.validateForm(wizard);
    return true;
  }

  function go(n) {
    state.step = Math.max(1, Math.min(4, n));
    persist(); render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const h = $('#h'); h && h.focus({ preventScroll: true });
  }

  wizard.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) { if (validate()) go(state.step + 1); }
    else if (e.target.closest('[data-back]')) go(state.step - 1);
  });

  function render() {
    drawStepper(); drawSummary();
    if (state.step === 4 && (!state.date || !state.slot || !state.venue || !state.address || !state.name || !state.email || !state.phone)) state.step = !state.date || !state.slot || !state.venue || !state.address ? 2 : 3;
    ({ 1: step1, 2: step2, 3: step3, 4: step4 })[state.step]();
    drawStepper();
  }

  // Ensure date still valid for chosen granthi
  if (state.date && !B.isDayAvailable(g, state.date)) { state.date = ''; state.slot = ''; }
  render();
})();
