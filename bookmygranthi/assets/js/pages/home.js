(function () {
  const { D, $, esc, icon, service, granthiCard, serviceOptions, toISO, today } = window.BMG;

  // Search bar
  $('#s-service').innerHTML = serviceOptions('', 'Any ceremony');
  $('#s-date').min = toISO(today());
  const cities = [...new Set(D.GRANTHIS.map((g) => g.city))].sort();
  $('#cities').innerHTML = cities.map((c) => `<option value="${esc(c)}">`).join('');
  $('#search').addEventListener('submit', (e) => {
    // Drop empty params so the URL stays clean.
    e.preventDefault();
    const p = new URLSearchParams();
    new FormData(e.target).forEach((v, k) => { if (String(v).trim()) p.set(k, String(v).trim()); });
    location.href = 'find.html' + (p.toString() ? '?' + p : '');
  });

  // Trust row
  $('.trust').innerHTML = [
    ['shield', 'Verified granthis with references'],
    ['clock', 'Requests answered within hours'],
    ['heart', 'Free to request, no hidden fees']
  ].map(([i, t]) => `<li>${icon(i, 18)}${t}</li>`).join('');

  // Occasion tiles
  $('#tiles').innerHTML = D.GROUPS.map((g) => `
    <a class="tile" href="find.html?occasion=${g.id}" aria-label="${esc(g.label)}">
      <span class="pa">${esc(g.pa)}</span>
      <h3>${esc(g.label)}</h3>
      <p>${esc(g.blurb)}</p>
      <span class="go">Browse granthis ${icon('arrow', 16)}</span>
    </a>`).join('');

  // Featured: highest rated, verified, mix of regions
  const featured = [...D.GRANTHIS].filter((g) => g.verified)
    .sort((a, b) => b.rating * Math.log(b.ratingCount + 2) - a.rating * Math.log(a.ratingCount + 2))
    .slice(0, 6);
  $('#featured-cards').innerHTML = featured.map((g) => granthiCard(g)).join('');
  $('#count-arrow').innerHTML = icon('arrow', 16);

  // Values
  const values = [
    ['shield', 'Verified, with references', 'Verified granthis have had their identity checked and provided references from a gurdwara or community.'],
    ['book', 'Maryada respected', 'Every profile shows the ceremonies, languages and traditions the granthi offers, so you know what to expect.'],
    ['clock', 'Short-notice care', 'For funerals and urgent needs, look for granthis who respond quickly, sometimes the same day.'],
    ['globe', 'Speaks your language', 'Filter by Punjabi, English or Hindi, so every generation in the room understands.'],
    ['calendar', 'Real availability', 'See open dates and times before you ask, and skip the back-and-forth.'],
    ['heart', 'Clear, suggested seva', 'See what to expect upfront. Settle directly with your granthi, with no booking fees.']
  ];
  $('#values').innerHTML = values.map(([i, t, d]) => `
    <div class="value"><div class="ico">${icon(i, 22)}</div><h3>${t}</h3><p>${d}</p></div>`).join('');

  // Testimonials
  $('#quotes').innerHTML = D.TESTIMONIALS.map((t) => `
    <figure class="quote">
      <blockquote>“${esc(t.text)}”</blockquote>
      <figcaption><strong>${esc(t.name)}</strong>${esc(t.place)}</figcaption>
    </figure>`).join('');

  // FAQ
  $('#faq-list').innerHTML = D.FAQ.map((f, i) => `
    <details ${i === 0 ? 'open' : ''}><summary>${esc(f.q)}</summary><div class="answer">${esc(f.a)}</div></details>`).join('');
})();
