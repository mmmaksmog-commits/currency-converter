// Конвертер валют. Курсы: open.er-api.com (бесплатно, без ключа), кэш в localStorage на 12 часов.
const API = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'fx_rates_v1';
const PREFS_KEY = 'fx_prefs_v1';
const CACHE_TTL = 12 * 3600 * 1000;

const CURRENCIES = ['RUB', 'USD', 'EUR', 'CNY', 'KZT', 'BYN', 'UAH', 'TRY', 'AED', 'GBP', 'JPY', 'CHF', 'GEL', 'AMD', 'UZS', 'KGS', 'AZN', 'THB', 'INR', 'KRW', 'CAD', 'AUD', 'PLN', 'CZK', 'SEK', 'NOK', 'ILS', 'EGP', 'VND', 'IDR', 'BRL', 'MXN', 'SGD', 'HKD', 'TJS', 'MDL'];
const PAIRS = [['USD', 'RUB'], ['EUR', 'RUB'], ['CNY', 'RUB'], ['RUB', 'KZT'], ['USD', 'EUR'], ['TRY', 'RUB'], ['AED', 'RUB']];

const $ = (s) => document.querySelector(s);
const names = (() => { try { return new Intl.DisplayNames(['ru'], { type: 'currency' }); } catch { return null; } })();
const nameOf = (c) => { const n = names?.of(c) ?? c; return n[0].toUpperCase() + n.slice(1); };
// Флаг из кода валюты: первые две буквы — код страны (EUR → 🇪🇺)
const flag = (c) => String.fromCodePoint(...[...c.slice(0, 2)].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const prefs = read(PREFS_KEY, { from: 'USD', to: 'RUB', amount: '1000', favs: ['EUR', 'CNY', 'KZT', 'TRY', 'AED', 'GBP'] });
let rates = null;

// ---------- Курсы ----------
async function loadRates() {
  const cached = read(CACHE_KEY, null);
  if (cached && Date.now() - cached.fetched < CACHE_TTL) { rates = cached; return; }
  try {
    const res = await fetch(API);
    const json = await res.json();
    if (json.result !== 'success') throw new Error('bad response');
    rates = { rates: json.rates, updated: json.time_last_update_unix * 1000, fetched: Date.now() };
    write(CACHE_KEY, rates);
  } catch {
    if (cached) { rates = { ...cached, stale: true }; return; }
    throw new Error('offline');
  }
}

const convert = (amount, from, to) => (amount / rates.rates[from]) * rates.rates[to];

// ---------- Форматирование ----------
function fmt(n, c) {
  const digits = n === 0 ? 0 : Math.abs(n) >= 100 ? 2 : Math.abs(n) >= 1 ? 2 : 4;
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: Math.abs(n) >= 1 && n % 1 ? 2 : 0 }).format(n) + (c ? ` ${c}` : '');
}
const parseAmount = (s) => { const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0; };

// ---------- Отрисовка ----------
function fillSelects() {
  const opts = CURRENCIES.filter((c) => rates.rates[c]).map((c) => `<option value="${c}" title="${nameOf(c)}">${flag(c)} ${c}</option>`).join('');
  $('#from').innerHTML = opts;
  $('#to').innerHTML = opts;
  $('#from').value = prefs.from;
  $('#to').value = prefs.to;
  $('#amount').value = prefs.amount;
}

function render(source = 'amount') {
  const { from, to } = prefs;
  if (source === 'amount') {
    const a = parseAmount($('#amount').value);
    $('#result').value = fmt(convert(a, from, to));
  } else {
    const r = parseAmount($('#result').value);
    const a = convert(r, to, from);
    $('#amount').value = fmt(a);
    prefs.amount = String(Math.round(a * 100) / 100);
  }
  $('#fromName').textContent = nameOf(from);
  $('#toName').textContent = nameOf(to);
  const one = convert(1, from, to);
  $('#rate').innerHTML = `1 ${from} = <b>${fmt(one, to)}</b> · 1 ${to} = ${fmt(1 / one, from)}`;

  $('#pairs').innerHTML = PAIRS.map(([a, b]) => `<button class="pair ${a === from && b === to ? 'is-active' : ''}" data-pair="${a}-${b}">${flag(a)} ${a} → ${b}</button>`).join('');

  const amount = parseAmount(prefs.amount);
  $('#others').innerHTML = prefs.favs.filter((c) => c !== from && rates.rates[c]).map((c) => `
    <li><button data-to="${c}"><span class="flag">${flag(c)}</span><span class="cur"><b>${c}</b><small>${nameOf(c)}</small></span><span class="val">${fmt(convert(amount, from, c))}</span></button></li>`).join('')
    || '<li class="muted">Добавьте валюты кнопкой «Изменить»</li>';

  const steps = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000];
  $('#table').innerHTML = `<thead><tr><th>${flag(from)} ${from}</th><th>${flag(to)} ${to}</th></tr></thead><tbody>${steps.map((s) => `<tr><td>${fmt(s)}</td><td>${fmt(convert(s, from, to))}</td></tr>`).join('')}</tbody>`;
  write(PREFS_KEY, prefs);
}

function renderUpdated() {
  const d = new Date(rates.updated);
  const when = d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  $('#updated').textContent = rates.stale ? `Нет сети · курсы от ${when}` : `Курсы обновлены ${when}`;
  $('#updated').classList.toggle('is-stale', Boolean(rates.stale));
}

// ---------- Избранные ----------
function renderFavList() {
  const q = $('#favSearch').value.trim().toLowerCase();
  $('#favList').innerHTML = CURRENCIES.filter((c) => rates.rates[c] && (`${c} ${nameOf(c)}`).toLowerCase().includes(q)).map((c) => `
    <label class="fav"><input type="checkbox" value="${c}" ${prefs.favs.includes(c) ? 'checked' : ''}><span>${flag(c)}</span><b>${c}</b><small>${nameOf(c)}</small></label>`).join('');
}

// ---------- События ----------
$('#amount').addEventListener('input', () => { prefs.amount = String(parseAmount($('#amount').value)); render('amount'); });
$('#result').addEventListener('input', () => render('result'));
$('#amount').addEventListener('focus', (e) => e.target.select());
$('#result').addEventListener('focus', (e) => e.target.select());
$('#from').addEventListener('change', (e) => { prefs.from = e.target.value; render(); });
$('#to').addEventListener('change', (e) => { prefs.to = e.target.value; render(); });
$('#swap').addEventListener('click', () => {
  [prefs.from, prefs.to] = [prefs.to, prefs.from];
  $('#from').value = prefs.from;
  $('#to').value = prefs.to;
  $('#swap').classList.remove('spin');
  void $('#swap').offsetWidth;
  $('#swap').classList.add('spin');
  render();
});
$('#pairs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pair]');
  if (!b) return;
  [prefs.from, prefs.to] = b.dataset.pair.split('-');
  $('#from').value = prefs.from;
  $('#to').value = prefs.to;
  render();
});
$('#others').addEventListener('click', (e) => {
  const b = e.target.closest('[data-to]');
  if (!b) return;
  prefs.to = b.dataset.to;
  $('#to').value = prefs.to;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#editFavs').onclick = () => { $('#favSearch').value = ''; renderFavList(); $('#sheet').hidden = false; };
$('#favSearch').addEventListener('input', renderFavList);
$('#favList').addEventListener('change', (e) => {
  const c = e.target.value;
  prefs.favs = e.target.checked ? [...prefs.favs, c] : prefs.favs.filter((x) => x !== c);
});
const closeSheet = () => { $('#sheet').hidden = true; render(); };
$('#favDone').onclick = closeSheet;
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

// ---------- Старт ----------
loadRates()
  .then(() => { fillSelects(); renderUpdated(); render(); })
  .catch(() => {
    $('#updated').textContent = 'Не удалось загрузить курсы. Проверьте интернет и обновите страницу.';
    $('#updated').classList.add('is-stale');
  });
