(function () {
  const B = window.BMG;
  const { D, $, esc, icon, service, group, granthiCard, serviceOptions, toISO, today, fmtShort, priceFor } = B;

  const els = {
    service: $('#f-service'), where: $('#f-where'), date: $('#f-date'), lang: $('#f-lang'),
    sort: $('#f-sort'), verified: $('#f-verified'), urgent: $('#f-urgent'),
    count: $('#count'), chips: $('#chips'), results: $('#results'), empty: $('#empty'),
    filters: $('#filters'), toggle: $('#toggle')
  };

  // Static option lists
  els.service.innerHTML = serviceOptions('', 'Any ceremony');
  els.date.min = toISO(today());
  const places = [...new Set(D.GRANTHIS.flatMap((g) => [g.city, g.region, g.country]))].sort();
  $('#cities').innerHTML = places.map((p) => `<option value="${esc(p)}">`).join('');

  // Occasion (group) is held in state, not in a control; shown as a chip.
  const state = { occasion: '' };

  function readURL() {
    const p = B.qs();
    els.service.value = p.get('service') || '';
    els.where.value = p.get('where') || '';
    els.date.value = p.get('date') || '';
    els.lang.value = p.get('lang') || '';
    els.sort.value = p.get('sort') || 'recommended';
    els.verified.checked = p.get('verified') === '1';
    els.urgent.checked = p.get('urgent') === '1';
    state.occasion = p.get('occasion') || '';
  }
  function writeURL() {
    const p = new URLSearchParams();
    const set = (k, v) => v && p.set(k, v);
    set('service', els.service.value); set('occasion', state.occasion); set('where', els.where.value.trim());
    set('date', els.date.value); set('lang', els.lang.value);
    if (els.sort.value !== 'recommended') p.set('sort', els.sort.value);
    if (els.verified.checked) p.set('verified', '1');
    if (els.urgent.checked) p.set('urgent', '1');
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  const score = (g) => g.rating * Math.log(g.ratingCount + 2) + (g.verified ? 1.2 : 0);

  function filter() {
    const sid = els.service.value;
    const q = els.where.value.trim().toLowerCase();
    const date = els.date.value;
    return D.GRANTHIS.filter((g) => {
      if (sid && !g.services.includes(sid)) return false;
      if (state.occasion && !g.services.some((id) => service(id).group === state.occasion)) return false;
      if (q && ![g.city, g.region, g.country].some((x) => x.toLowerCase().includes(q))) return false;
      if (date && !B.isDayAvailable(g, date)) return false;
      if (els.lang.value && !g.langs.includes(els.lang.value)) return false;
      if (els.verified.checked && !g.verified) return false;
      if (els.urgent.checked && !g.shortNotice) return false;
      return true;
    });
  }

  function sort(list) {
    const sid = els.service.value;
    const by = els.sort.value;
    const price = (g) => B.fromPrice(g, sid && g.services.includes(sid) ? sid : null) / (D.FX[g.currency] || 1);
    const sorted = [...list];
    if (by === 'rating') sorted.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
    else if (by === 'price') sorted.sort((a, b) => price(a) - price(b));
    else if (by === 'experience') sorted.sort((a, b) => b.years - a.years);
    else sorted.sort((a, b) => score(b) - score(a));
    return sorted;
  }

  function chips() {
    const out = [];
    const add = (label, clear) => out.push({ label, clear });
    if (els.service.value) add(service(els.service.value).name, () => { els.service.value = ''; });
    if (state.occasion) add(group(state.occasion).label, () => { state.occasion = ''; });
    if (els.where.value.trim()) add(els.where.value.trim(), () => { els.where.value = ''; });
    if (els.date.value) add(fmtShort(els.date.value), () => { els.date.value = ''; });
    if (els.lang.value) add(els.lang.value, () => { els.lang.value = ''; });
    if (els.verified.checked) add('Verified', () => { els.verified.checked = false; });
    if (els.urgent.checked) add('Short notice', () => { els.urgent.checked = false; });
    els.chips.innerHTML = out.map((c, i) => `<span class="chip outline">${esc(c.label)}<button type="button" data-i="${i}" aria-label="Remove ${esc(c.label)}">${icon('x', 14)}</button></span>`).join('');
    els.chips.onclick = (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      out[Number(b.dataset.i)].clear(); update();
    };
  }

  function update() {
    const list = sort(filter());
    const cardOpts = { service: els.service.value, date: els.date.value };
    els.results.innerHTML = list.map((g) => granthiCard(g, cardOpts)).join('');
    els.results.classList.toggle('hide', !list.length);
    els.empty.classList.toggle('hide', !!list.length);
    els.count.textContent = list.length === 1 ? '1 granthi' : `${list.length} granthis`;
    chips();
    writeURL();
  }

  function reset() {
    els.service.value = ''; els.where.value = ''; els.date.value = ''; els.lang.value = '';
    els.sort.value = 'recommended'; els.verified.checked = false; els.urgent.checked = false; state.occasion = '';
    update();
  }

  // Selecting a specific ceremony supersedes the broader occasion.
  els.service.addEventListener('change', () => { if (els.service.value) state.occasion = ''; });
  ['change', 'input'].forEach((ev) => $('#filter-form').addEventListener(ev, update));
  $('#reset').addEventListener('click', reset);
  $('#clear').addEventListener('click', reset);
  els.toggle.addEventListener('click', () => {
    const open = els.filters.classList.toggle('open');
    els.toggle.setAttribute('aria-expanded', String(open));
    els.toggle.textContent = open ? 'Hide' : 'Show';
  });

  readURL();
  update();
})();
