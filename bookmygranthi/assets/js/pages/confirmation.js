(function () {
  const B = window.BMG;
  const { $, esc, icon, service, granthi, slot, venue, fullName, where, money, fmtDate } = B;
  const root = $('#confirm');
  const ref = (B.qs().get('ref') || '').toUpperCase();
  const b = B.store.get('bookings', []).find((x) => x.ref === ref);

  if (!b) {
    root.innerHTML = `
      <div class="stack" style="--gap:18px;justify-items:start;min-height:40vh;align-content:center">
        <h1 style="font-size:clamp(2.2rem,4.6vw,3.4rem)">We couldn’t find that booking.</h1>
        <p class="lead">Bookings are saved on the device you used to make them. Try “My bookings”, or start a new request.</p>
        <div class="row wrap"><a class="btn btn-primary btn-lg" href="bookings.html">My bookings</a><a class="btn btn-ghost btn-lg" href="find.html">Find a granthi</a></div>
      </div>`;
    return;
  }

  const g = granthi(b.granthiId), s = service(b.serviceId), sl = slot(b.slot), v = venue(b.venue);
  const first = g.name.split(' ')[0];
  const cancelled = b.status === 'cancelled';

  root.innerHTML = `
    <div class="stack" style="--gap:20px">
      <div class="tick" aria-hidden="true">${icon(cancelled ? 'x' : 'check', 30)}</div>
      <h1 style="font-size:clamp(2.4rem,5vw,3.6rem)" class="balance">${cancelled ? 'This request was cancelled.' : 'Your request is on its way.'}</h1>
      <p class="lead" style="max-width:56ch">${cancelled ? 'No further action is needed.' : `${esc(g.honorific)} ${esc(first)} will review it and usually responds ${esc(g.responds)}. We’ll email <strong>${esc(b.email)}</strong> as soon as there’s news.`}</p>
      <div class="row wrap" style="--gap:12px"><span class="muted small">Reference</span><span class="ref">${esc(b.ref)}</span></div>
    </div>

    <div class="grid c2" style="--gap:48px;margin-top:56px;align-items:start">
      <section>
        <h2 style="font-size:1.75rem;margin-bottom:20px">Your request</h2>
        <div class="panel">
          <dl class="dl" style="padding-block:8px">
            <div><dt>Granthi</dt><dd><a href="granthi.html?id=${g.id}" style="text-decoration:underline;text-underline-offset:3px">${esc(fullName(g))}</a><br><span class="muted small" style="font-weight:400">${esc(where(g))}</span></dd></div>
            <div><dt>Ceremony</dt><dd>${esc(s.name)}</dd></div>
            <div><dt>Date</dt><dd>${esc(fmtDate(b.date))}</dd></div>
            <div><dt>Time</dt><dd>${esc(sl.label)} · ${esc(sl.time)}</dd></div>
            <div><dt>Venue</dt><dd>${esc(v.label)}<br><span class="muted small" style="font-weight:400">${esc(b.address)}</span></dd></div>
            ${b.urgent ? '<div><dt>Priority</dt><dd><span class="chip accent">Urgent</span></dd></div>' : ''}
            <div class="total"><dt>Suggested seva</dt><dd>${money(g, b.seva)}</dd></div>
          </dl>
        </div>
        <div class="row wrap no-print" style="--gap:10px;margin-top:20px">
          ${cancelled ? '' : `<button class="btn btn-ghost" id="ics" type="button">${icon('calendar', 16)}Add to calendar</button>`}
          <button class="btn btn-ghost" id="print" type="button">${icon('print', 16)}Print</button>
          <a class="btn btn-quiet" href="bookings.html">Manage booking</a>
        </div>
      </section>

      <section>
        <h2 style="font-size:1.75rem;margin-bottom:20px">What happens next</h2>
        <ol class="timeline">
          <li class="${cancelled ? '' : 'now'}"><strong>Request sent</strong><span>Your details have been shared with ${esc(g.honorific)} ${esc(first)}.</span></li>
          <li><strong>The granthi confirms</strong><span>Usually ${esc(g.responds)}. They may call to check details.</span></li>
          <li><strong>You plan together</strong><span>Agree timings, who’s attending and anything for the Ardaas.</span></li>
          <li><strong>The day itself</strong><span>Settle seva directly with your granthi after the ceremony.</span></li>
        </ol>
        <div class="note no-print" style="margin-top:32px">${icon('info', 18)}<div>Need to change something, or it’s urgent? Reply to your confirmation email or <a href="contact.html" style="text-decoration:underline">contact us</a> with your reference.</div></div>
      </section>
    </div>`;

  const ics = $('#ics'); if (ics) ics.addEventListener('click', () => B.downloadICS(b));
  $('#print').addEventListener('click', () => window.print());
})();
