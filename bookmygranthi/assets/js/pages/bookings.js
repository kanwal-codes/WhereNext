(function () {
  const B = window.BMG;
  const { $, esc, icon, service, granthi, slot, fullName, fromISO } = B;
  const list = $('#list');

  function draw() {
    const all = B.store.get('bookings', []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!all.length) {
      list.innerHTML = `
        <div class="empty">
          <h3>No bookings yet.</h3>
          <p>When you send a request it will show up here, with its status and details.</p>
          <a class="btn btn-primary" href="find.html">Find a granthi</a>
        </div>`;
      return;
    }
    list.innerHTML = all.map((b) => {
      const g = granthi(b.granthiId), s = service(b.serviceId), sl = slot(b.slot);
      const d = fromISO(b.date);
      const cancelled = b.status === 'cancelled';
      return `
        <article class="booking-item">
          <div class="booking-date" aria-hidden="true"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-GB', { month: 'short' })}</span></div>
          <div class="stack" style="--gap:4px">
            <div class="row wrap" style="--gap:10px"><strong>${esc(s.name)}</strong>
              <span class="chip ${cancelled ? '' : 'ok'}">${cancelled ? 'Cancelled' : 'Requested'}</span></div>
            <div class="small muted">with ${esc(fullName(g))} · ${esc(B.fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${esc(sl.label)}</div>
            <div class="xs muted">Ref ${esc(b.ref)}</div>
          </div>
          <div class="acts row" style="--gap:8px">
            <a class="btn btn-ghost btn-sm" href="confirmation.html?ref=${esc(b.ref)}">View</a>
            ${cancelled ? '' : `<button class="btn btn-quiet btn-sm" type="button" data-cancel="${esc(b.ref)}">Cancel</button>`}
          </div>
        </article>`;
    }).join('');
  }

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    if (!confirm('Cancel this request? The granthi will no longer hold the date.')) return;
    const all = B.store.get('bookings', []);
    const b = all.find((x) => x.ref === btn.dataset.cancel);
    if (b) { b.status = 'cancelled'; B.store.set('bookings', all); }
    draw();
  });

  $('#lookup').addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = $('#l-msg');
    msg.textContent = '';
    if (!B.validateForm(e.target)) return;
    const ref = $('#l-ref').value.trim().toUpperCase();
    const email = $('#l-email').value.trim().toLowerCase();
    const found = B.store.get('bookings', []).find((x) => x.ref === ref && x.email.toLowerCase() === email);
    if (found) { location.href = 'confirmation.html?ref=' + found.ref; return; }
    msg.style.color = 'var(--danger)';
    msg.textContent = 'We couldn’t find a booking with those details on this device.';
  });

  draw();
})();
