(function () {
  const B = window.BMG;
  const { D, $, $$, esc, icon } = B;

  $('#benefits').innerHTML = [
    ['users', 'Reach more families', 'Be found by families in your area looking for exactly what you offer.'],
    ['calendar', 'Your calendar, your call', 'Mark the dates you’re free. Accept or decline every request.'],
    ['heart', 'Your seva, your way', 'Set your own suggested seva per ceremony. No commission, no listing fee.']
  ].map(([i, t, d]) => `<div class="value"><div class="ico">${icon(i, 22)}</div><h3>${t}</h3><p>${d}</p></div>`).join('');

  $('#a-services').innerHTML = D.SERVICES.map((s) =>
    `<label class="choice"><input type="checkbox" name="services" value="${s.id}"><span class="box">${esc(s.name)}</span></label>`).join('');

  const form = $('#apply-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!B.validateForm(form)) return;
    const f = new FormData(form);
    const app = {
      id: 'APP-' + Date.now().toString(36).toUpperCase(),
      name: f.get('name'), title: f.get('title'), email: f.get('email'), phone: f.get('phone'),
      city: f.get('city'), years: f.get('years'), reference: f.get('reference'), about: f.get('about'),
      services: f.getAll('services'), langs: f.getAll('langs'), createdAt: new Date().toISOString()
    };
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending…';
    await B.submit('applications', app);
    form.classList.add('hide');
    const done = $('#apply-done');
    done.classList.remove('hide');
    $('.tick', done).innerHTML = icon('check', 30);
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
    done.focus({ preventScroll: true });
  });
})();
