/* BOSH Ads Optimizer dashboard (section 13, D-ADS-07, D-ADS-26).
   Views and styling from the approved mockup v1.2. Every number shown here is published nightly by
   bosh_ads.pipeline.dashboard into ads.dash_*; this page reads and formats, it never computes a figure.
   Sign-in is Supabase Auth; Row Level Security on the server decides what a session may read.
   All text from the data is escaped before it touches the page (search terms are shopper input). */
'use strict';

const CFG = window.BOSH_ADS;
const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  db: { schema: 'ads' },
});

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const na = (why) => `<span class="na"${why ? ` title="${esc(why)}"` : ''}>N/A</span>`;
const num = v => v == null ? null : Number(v);
const money = (v, dec = 0, why) => v == null ? na(why) : (num(v) < 0 ? '−' : '') + '$' + Math.abs(num(v)).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pct = (v, why) => v == null ? na(why) : num(v).toFixed(1) + '%';
const int = v => v == null ? na() : Number(v).toLocaleString('en-US');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = iso => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${MONTHS[m - 1]} ${d}`; };
const range = (s, e) => `${day(s)} – ${day(e)}, ${e.slice(0, 4)}`;
const when = iso => { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const STRATEGY = { LEGACY_FOR_SALES: 'Dynamic bids – down only', AUTO_FOR_SALES: 'Dynamic bids – up and down', MANUAL: 'Fixed bids', RULE_BASED: 'Rule-based bidding' };
const strategy = s => s == null ? '—' : (STRATEGY[s] || s);
const days = p => { const d = String(p || '').match(/\d{4}-\d{2}-\d{2}/g) || []; return !d.length ? (p || '—') : d.length === 1 || d[0] === d[1] ? day(d[0]) : `${day(d[0])} – ${day(d[1])}`; };
/* a recorded settings change in plain words: Amazon's field names and values become what Bo sees in the console */
const CHANGE = {
  daily_budget: ['Daily budget', v => v == null ? '—' : money(v, num(v) % 1 ? 2 : 0)],
  bidding_strategy: ['Bidding', strategy],
  state: ['Status', v => v == null ? '—' : String(v).toLowerCase()],
  name: ['Name', v => v == null ? '—' : v],
};
const change = lc => { const [label, f] = CHANGE[lc.field] || [lc.field.replace(/_/g, ' '), v => v == null ? '—' : v]; return `${day(lc.seen)} · ${label}: ${f(lc.from)} → ${f(lc.to)}`; };
const isPhone = () => window.matchMedia('(max-width:760px)').matches;

const ICONS = {
  grid: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.6"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.6"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.6"/>',
  check: '<circle cx="12" cy="12" r="8.6"/><path d="m8.3 12.4 2.6 2.6 5-5.2"/>',
  ads: '<path d="M4 20V11M9.5 20V5M15 20v-6.5M20.5 20V9"/>',
  box: '<path d="M20.5 7.8 12 3.3 3.5 7.8v8.4l8.5 4.5 8.5-4.5z"/><path d="M3.5 7.8 12 12.3l8.5-4.5M12 12.3v8.4"/>',
  bell: '<path d="M6 15.5V11a6 6 0 1 1 12 0v4.5l1.8 2H4.2z"/><path d="M10 20.3a2.2 2.2 0 0 0 4 0"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  search: '<circle cx="11" cy="11" r="6.8"/><path d="m20 20-4.2-4.2"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.1 2"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5"/><path d="M12 7.9h.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
};
const icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const note = html => `<div class="note">${icon('info', 16)}<div>${html}</div></div>`;

/* ------------------------------------------------------------------------------------- data */
const D = { ov: {}, camps: {}, health: {}, alerts: [], action: {}, products: [], dropins: [], loadedAt: null };
let period = 'd30';

async function load() {
  const p = CFG.profileId;
  const [ov, cm, he, al, ac, pp, di] = await Promise.all([
    sb.from('dash_overview').select('card,period_label,coverage_start,coverage_end,maturity,data,published_at').eq('profile_id', p),
    sb.from('dash_campaign_monitor').select('campaign_id,period_label,data').eq('profile_id', p),
    sb.from('dash_health').select('item,status,data,published_at'),
    sb.from('alert').select('alert_id,severity,type,entity_type,entity_id,trigger,period_start,period_end,next_step,state,opened_at,updated_at').order('opened_at', { ascending: false }),
    sb.from('dash_action').select('item,data,published_at').eq('profile_id', p),
    sb.from('dash_product_profit').select('product_id,data,coverage_start,coverage_end').eq('profile_id', p),
    sb.from('dropin').select('dropin_id,kind,filename,interval_start,interval_end,uploaded_at,status,result,processed_at').eq('profile_id', p).order('uploaded_at', { ascending: false }).limit(20),
  ]);
  for (const r of [ov, cm, he, al, ac, pp, di]) if (r.error) throw r.error;
  D.products = (pp.data || []).map(r => r.data); D.dropins = di.data || [];
  D.ov = {}; D.camps = {}; D.health = {}; D.action = {};
  for (const r of (ac.data || [])) D.action[r.item] = r.data;
  for (const r of ov.data) { (D.ov[r.period_label] ||= {})[r.card] = r.data; D.publishedAt = r.published_at; }
  for (const r of cm.data) (D.camps[r.period_label] ||= []).push(r.data);
  for (const r of he.data) D.health[r.item] = r;
  D.alerts = al.data;
  D.loadedAt = new Date();
}

/* ------------------------------------------------------------------------------------- navigation */
const PAGES = [
  { id: 'overview', t: 'Overview', ic: 'grid', sub: 'US marketplace · Sponsored Products · account time zone' },
  { id: 'action', t: 'Action Center', ic: 'check', sub: 'Suggestions waiting for your decision · nothing changes on Amazon until you upload the file yourself' },
  { id: 'campaigns', t: 'Campaign Monitor', ic: 'ads', sub: 'Every campaign with spend in the period, paused ones included · sorted by spend' },
  { id: 'products', t: 'Product Profitability', ic: 'box', sub: 'Total sales from Seller Central, all ad spend, and what is left after ads' },
  { id: 'alerts', t: 'Alerts', ic: 'bell', sub: 'Things that need a look · acknowledging is not the same as resolving' },
  { id: 'health', t: 'Health & Settings', ic: 'pulse', sub: 'Is the data fresh, did every job run, are backups working' },
  { id: 'discovery', t: 'Discovery & Keywords', ic: 'search', sub: 'Second release', later: true },
  { id: 'history', t: 'Change History & Results', ic: 'clock', sub: 'Second release', later: true },
];
let current = 'overview';

function renderNav() {
  const open = D.alerts.filter(a => a.state === 'open').length;
  const urgent = D.alerts.filter(a => a.severity === 'urgent' && a.state !== 'resolved').length;
  $('#nav').innerHTML = PAGES.map((p, i) => {
    const badge = p.id === 'alerts' && open ? `<span class="badge ${urgent ? 'crit' : 'fyi'}">${open}</span>` : '';
    const sep = i === 6 ? '<div class="sep"></div><div class="lbl">Second release</div>' : '';
    return `${sep}<a href="#${p.id}" data-p="${p.id}" class="${p.id === current ? 'active' : ''} ${p.later ? 'later' : ''}" ${p.id === current ? 'aria-current="page"' : ''}>${icon(p.ic)}<span>${p.t}</span>${p.later ? '<span class="tag">LATER</span>' : badge}</a>`;
  }).join('');
}

function renderStatus() {
  const meta = (D.ov.d30 || {}).meta;
  const col = D.health.collection;
  const ok = col && col.status === 'ok';
  $('#sbStatus').innerHTML = `<div class="h">Data</div>
    <div class="line ${ok ? '' : 'warn'}"><i></i><span>${col && col.data.last_run ? 'Collected ' + esc(when(col.data.last_run)) : 'Not collected yet'}</span></div>
    <div class="skv"><span>Data through</span><b>${meta ? esc(day(meta.data_through)) : '—'}</b></div>
    <div class="skv"><span>Mature through</span><b>${meta ? esc(day(meta.mature_through)) : '—'}</b></div>
    <div class="skv"><span>Mode</span><b>Shadow</b></div>`;
}

function go(id) {
  if (!PAGES.find(p => p.id === id)) id = 'overview';
  current = id;
  const p = PAGES.find(x => x.id === id);
  $('#pgTitle').textContent = p.t;
  $('#pgSub').textContent = p.sub;
  $('#tools').hidden = !['overview', 'campaigns', 'products'].includes(id);
  renderNav();
  ({ overview, action, campaigns, products, alerts, health, discovery: later, history: later })[id](p);
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------------------------- overview */
function weekChart(weeks) {
  if (!weeks.length) return '<p style="margin:0;color:var(--text-3)">No complete Monday–Sunday week of data yet.</p>';
  const W = 640, H = 230, L = 52, R = 12, T = 14, B = 34;
  const vals = weeks.flatMap(w => [num(w.spend) || 0, num(w.ad_sales) || 0]);
  const top = Math.max(1, ...vals);
  const step = Math.pow(10, Math.floor(Math.log10(top))) * (top / Math.pow(10, Math.floor(Math.log10(top))) > 5 ? 2 : 1);
  const max = Math.ceil(top / step) * step;
  const n = weeks.length, slot = (W - L - R) / n, bw = Math.min(16, slot * 0.32);
  const y = v => T + (H - T - B) * (1 - v / max);
  let g = '';
  for (let t = 0; t <= max; t += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--border)"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t >= 1000 ? '$' + (t / 1000) + 'K' : '$' + t}</text>`;
  weeks.forEach((w, i) => {
    const x = L + slot * i + slot / 2 - bw - 1;
    const s = num(w.spend) || 0, a = num(w.ad_sales) || 0, op = w.mature ? 1 : 0.55;
    g += `<rect x="${x}" y="${y(s)}" width="${bw}" height="${y(0) - y(s)}" rx="2" fill="var(--amber)" opacity="${op}"><title>Week ${esc(day(w.start))}–${esc(day(w.end))}: ad spend $${s.toLocaleString()}</title></rect>`;
    g += `<rect x="${x + bw + 2}" y="${y(a)}" width="${bw}" height="${y(0) - y(a)}" rx="2" fill="var(--green)" opacity="${op}"><title>Week ${esc(day(w.start))}–${esc(day(w.end))}: ad sales $${a.toLocaleString()}${w.mature ? '' : ' (still maturing)'}</title></rect>`;
    if (i % 2 === n % 2 || n <= 8) g += `<text x="${L + slot * i + slot / 2}" y="${H - B + 16}" text-anchor="middle">${esc(day(w.end))}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ad spend and ad sales by week">${g}</svg>`;
}

function overview() {
  const c = D.ov[period];
  if (!c) { $('#view').innerHTML = `<div class="page"><div class="empty"><h2>No data published yet</h2>The nightly job publishes this page after it collects Amazon's reports.</div></div>`; return; }
  const t = c.totals, m = c.meta, r30 = c.roll30, wk = c.weeks.weeks;
  const lbl = range(m.window.start, m.window.end);
  const col = D.health.collection, bk = D.health.backup;
  const openAlerts = D.alerts.filter(a => a.state !== 'resolved');
  $('#view').innerHTML = `<div class="page">
  <div class="kpis">
    <div class="kpi hero">
      <div class="kl">Contribution after ads · last full week</div>
      <div class="kv num">${na(t.contribution_reason)}</div>
      <div class="ks warn">Not shown yet: ${esc(t.contribution_reason)}</div>
      <div class="ks">This becomes your headline number the morning after your costs are in.</div>
      <div class="kd">What is left after product costs, Amazon fees and all ad spend · not accounting profit</div>
    </div>
    <div class="kpi"><div class="kl">Total ad spend</div><div class="kv num">${money(t.spend)}</div>
      <div class="ks">SP ${money(t.spend_by_type.SP)} · SB ${na(t.spend_by_type_reason)} · SD ${na(t.spend_by_type_reason)}</div><div class="kd">${esc(lbl)}</div></div>
    <div class="kpi"><div class="kl">Last 30 days ad spend</div><div class="kv num">${money(r30.spend)}</div>
      <div class="ks">Fixed window, ignores the date buttons</div><div class="kd">${esc(range(r30.start, r30.end))}</div></div>
    <div class="kpi"><div class="kl">Sales from ads</div><div class="kv num">${money(t.ad_sales)}</div>
      <div class="ks"><span class="chip warn">last 7 days still maturing</span></div><div class="kd">7-day click attribution · mature through ${esc(day(m.mature_through))}</div></div>
    <div class="kpi"><div class="kl">Total sales</div><div class="kv num">${t.total_sales != null ? money(t.total_sales) : na(t.total_sales_reason)}</div>
      <div class="ks">${t.total_sales != null ? esc(range(t.total_sales_interval.start, t.total_sales_interval.end)) + ' · latest Seller Central file' : esc(t.total_sales_reason)}</div><div class="kd">Seller Central, all sales on Amazon · the dates the file covers, never divided into days</div></div>
    <div class="kpi"><div class="kl">ACOS · TACOS</div><div class="kv num">${pct(t.acos)}<small>ACOS</small></div>
      <div class="ks">TACOS ${t.tacos != null ? pct(t.tacos) + (t.total_sales_interval ? ' (' + esc(range(t.total_sales_interval.start, t.total_sales_interval.end)) + ')' : '') : na(t.tacos_reason)} · weighted, not averaged</div><div class="kd">${esc(lbl)} · prior period ${pct(t.prior.acos)}</div></div>
    <div class="kpi"><div class="kl">Waiting for you</div><div class="kv num">${int(((D.action || {}).open || []).length + ((D.action || {}).missed || []).length)}<small>suggestions</small></div>
      <div class="ks">${openAlerts.length ? esc(openAlerts.length + ' open alert(s)') : 'No open alerts'}</div><div class="kd"><button class="link" data-go="action">Open the Action Center →</button></div></div>
  </div>
  <div class="grid">
    <section class="pn span2">
      <div class="ph"><h2>Ad spend and ad sales by week</h2><span class="sub">complete weeks, Mon–Sun · faded bars still maturing</span><span class="sp"></span>
        <div class="legend"><span><i style="background:var(--amber)"></i>Ad spend</span><span><i style="background:var(--green)"></i>Ad sales</span></div></div>
      ${weekChart(wk)}
      <div class="pf"><span>Contribution after ads replaces this chart once your product costs are in.</span><span>Sponsored Products only</span></div>
    </section>
    <section class="pn">
      <div class="ph"><h2>Biggest decisions</h2><span class="sp"></span><button class="link" data-go="action">Action Center →</button></div>
      ${(() => { const A = D.action || {}, top = (A.missed || []).concat(A.open || []).sort((a, b) => num(b.dollars_per_week) - num(a.dollars_per_week)).slice(0, 4);
        return top.length ? top.map(i => `<div class="lr"><div class="lt"><b>${esc(i.campaign)}: ${esc(i.what)}</b><span>${money(i.dollars_per_week)}/week · ${i.status === 'missed' ? 'MISSED since ' + esc(day(i.since)) : 'open since ' + esc(day(i.since))}</span></div></div>`).join('')
          : '<div class="lr"><div class="lt"><b>No open suggestions</b><span>The Monday Game Plan fills this. Every move is recorded and followed up nightly.</span></div></div>'; })()}
    </section>
    <section class="pn">
      <div class="ph"><h2>Alerts</h2><span class="sp"></span><button class="link" data-go="alerts">All →</button></div>
      ${openAlerts.length ? openAlerts.slice(0, 4).map(a => `<div class="lr" style="grid-template-columns:4px minmax(0,1fr)"><span class="sev ${sevClass(a.severity)}"></span><div class="lt"><b>${esc(a.type)}</b><span>${esc(a.trigger)}</span></div></div>`).join('') : '<div class="lr"><div class="lt"><b>Nothing open</b><span>Alerts appear here when something needs a look.</span></div></div>'}
    </section>
    <section class="pn">
      <div class="ph"><h2>Spend by ad type</h2><span class="sub">${esc(lbl)}</span></div>
      <div class="mix" role="img" aria-label="Spend split"><span style="width:100%;background:var(--green)"></span></div>
      <div style="margin-top:12px">
        <div class="lr"><div class="lt"><b>Sponsored Products</b><span>Collected nightly</span></div><div class="lm">${money(t.spend_by_type.SP)}</div></div>
        <div class="lr"><div class="lt"><b>Sponsored Brands</b><span>${esc(t.spend_by_type_reason)}</span></div><div class="lm">${na()}</div></div>
        <div class="lr"><div class="lt"><b>Sponsored Display</b><span>${esc(t.spend_by_type_reason)}</span></div><div class="lm">${na()}</div></div>
      </div>
    </section>
    <section class="pn">
      <div class="ph"><h2>Data health</h2><span class="sp"></span><button class="link" data-go="health">Details →</button></div>
      <div class="hrow"><span>Reports collected</span><b>${chipFor(col, col && col.data.last_run ? when(col.data.last_run) : 'not yet')}</b></div>
      <div class="hrow"><span>Data through</span><b>${esc(day(m.data_through))}</b></div>
      <div class="hrow"><span>Last backup</span><b>${bk && bk.data.last_run ? esc(when(bk.data.last_run)) : 'not recorded yet'}</b></div>
      <div class="hrow"><span>Amazon access renews</span><b>by ${esc(day((D.health.amazon_access || { data: {} }).data.renew_by))}</b></div>
    </section>
  </div></div>`;
  $('#view').querySelectorAll('[data-go]').forEach(b => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.go); go(b.dataset.go); });
}

const sevClass = s => ({ urgent: 'crit', action_needed: 'warn', informational: 'info' }[s] || 'info');
const chipFor = (h, label) => {
  const st = !h ? ['off', 'unknown'] : ({ ok: ['good', 'OK'], warning: ['warn', 'Check'], failed: ['crit', 'Failed'], unknown: ['off', 'Unknown'] }[h.status] || ['off', h.status]);
  return `<span class="chip ${st[0]}"><span class="dot"></span>${esc(label || st[1])}</span>`;
};

/* ------------------------------------------------------------------------------------- action center */
function action() {
  const A = D.action || {}, S = A.scoreboard || {}, open = A.open || [], missed = A.missed || [], done = A.done || [], weeks = A.weeks || [];
  if (!S.first_report) {
    $('#view').innerHTML = `<div class="page"><div class="empty"><h2>The first Game Plan arrives Monday</h2>
      Every Monday morning the Game Plan email lists the week's moves, campaign by campaign. Each one is recorded here with the money behind it.
      Every night the system checks Campaign Manager for your changes (it only reads) and this page then shows:
      <ul><li><b>Kept</b>: what the items you did were costing per week, minus what they cost after (measured, not estimated)</li>
      <li><b>Leaking</b>: what the open and missed items have cost since they were suggested</li>
      <li><b>Grown</b>: sales from the winners you scaled</li></ul></div></div>`;
    return;
  }
  const g = S.grown || {}, lw = S.last_week || {};
  const kpi = (l, v, s) => `<div class="kpi"><div class="kl">${l}</div><div class="kv num">${v}</div><div class="ks">${s}</div></div>`;
  const row = (i, cls) => `<section class="pn ${cls || ''}" style="gap:6px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="chip ${i.group === 'grow' ? 'good' : 'warn'}">${i.group === 'grow' ? 'GROW' : 'CUT'}</span>
        <b style="font-size:13.5px">${esc(i.campaign)}</b><span class="sp"></span><b class="num">${money(i.dollars_per_week)}/wk</b></div>
      <div style="font-size:13.5px">${esc(i.what)}</div>
      <dl class="kv-list"><dt>Why</dt><dd>${esc(i.why)}</dd><dt>Expected</dt><dd>${esc(i.expected)}</dd><dt>Where</dt><dd>${esc(i.where)}</dd>
        <dt>Since</dt><dd>${esc(day(i.since))}${i.spend_since != null ? ' · ' + money(i.spend_since) + ' spent on it since' : ''}${i.done_at ? ' · done ' + esc(day(i.done_at)) + (i.detected && i.detected.how ? ' (' + esc(i.detected.how) + ')' : '') : ''}${i.kept_per_week != null ? ' · kept ' + money(i.kept_per_week) + '/wk (measured)' : ''}${i.sales_since != null && i.group === 'grow' && i.status === 'done' ? ' · ' + money(i.sales_since) + ' in sales since' : ''}</dd></dl>
      ${i.status === 'open' || i.status === 'missed' ? (isPhone() ? '' : `<div><button class="btn ghost" data-dismiss="${esc(i.id)}">Not doing this one</button></div>`) : ''}
    </section>`;
  $('#view').innerHTML = `<div class="page">
  <div class="kpis">
    ${kpi('Kept per week', money(S.kept_per_week), 'measured on items you did · ' + money(S.kept_total) + ' since ' + esc(day(S.first_report)))}
    ${kpi('Still leaking per week', money(S.leaking_per_week), (S.open + missed.length) + ' open or missed · ' + money(S.leaked_since) + ' spent on them since suggested')}
    ${kpi('Last week', `${int(lw.done)}<small>of ${int(lw.suggested)}</small>`, 'moves done · streak ' + int(S.streak) + ' week(s)')}
    ${kpi('Grown', money(g.sales_since), `${int(g.count)} winners scaled · ACOS ${g.acos != null ? pct(num(g.acos) * 100) : 'n/a'}`)}
  </div>
  ${missed.length ? `<h2 style="margin:6px 0 4px;color:var(--red)">Missed: suggested, not seen on Amazon after 7 days (${missed.length})</h2>${missed.map(i => row(i, 'crit')).join('')}` : ''}
  <h2 style="margin:10px 0 4px">Open this week (${open.length})</h2>
  ${open.length ? open.map(i => row(i)).join('') : '<div class="pn" style="color:var(--text-3)">Nothing open. Monday brings the next plan.</div>'}
  <h2 style="margin:10px 0 4px">Done (${int(S.done_total)})</h2>
  ${done.length ? done.slice(0, 20).map(i => row(i, 'good')).join('') : '<div class="pn" style="color:var(--text-3)">Nothing done yet.</div>'}
  ${weeks.length ? `<h2 style="margin:10px 0 4px">Week by week</h2><div class="tw"><table><thead><tr><th>Monday</th><th class="r">Suggested</th><th class="r">Done</th><th class="r">Missed</th><th class="r">Open</th><th class="r">Kept/wk</th></tr></thead>
    <tbody>${weeks.map(w => `<tr><td>${esc(day(w.week))}</td><td class="r">${int(w.suggested)}</td><td class="r">${int(w.done)}</td><td class="r">${int(w.missed)}</td><td class="r">${int(w.open)}</td><td class="r">${money(w.kept_per_week)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="pf" style="margin-top:8px"><span>"Kept" is spend that was going out and stopped, measured on the same data after you acted. Not a promise of profit.</span></div>
  </div>`;
  $('#view').querySelectorAll('[data-dismiss]').forEach(b => b.onclick = async () => {
    const note = prompt('Why not? (one line, optional)') ?? null;
    if (note === null) return;
    b.disabled = true;
    const { error } = await sb.from('suggestion').update({ status: 'dismissed', dismissed_at: new Date().toISOString(), dismiss_note: note || null }).eq('suggestion_id', b.dataset.dismiss);
    if (error) { b.disabled = false; toast('Not saved: ' + error.message); return; }
    toast('Dismissed. It drops off at the next nightly update.'); b.closest('section').style.opacity = '0.5';
  });
}

/* ------------------------------------------------------------------------------------- campaigns */
let campFilter = 'all';
let showIdle = false;
/* paused or archived and nothing spent in the period: kept out of the way unless asked for */
const idle = c => !/enabled/i.test(c.status) && !(num(c.spend) > 0);
function campaigns() {
  const all = (D.camps[period] || []).slice();
  const m = (D.ov[period] || {}).meta;
  const yo = document.body.classList.contains('yoy-on');
  const list = all.filter(c => campFilter === 'all' || c.type === campFilter)
    .filter(c => c.type !== 'SP' || num(c.spend) > 0 || !/archived/i.test(c.status));
  const hidden = showIdle ? 0 : list.filter(idle).length;
  const shown = list.filter(c => showIdle || !idle(c))
    .sort((a, b) => (num(b.spend) || -1) - (num(a.spend) || -1));
  const rows = shown.map(c => {
    const delta = c.acos != null && c.prior_acos != null ? num(c.acos) - num(c.prior_acos) : null;
    const lc = c.last_change ? change(c.last_change) : 'none recorded';
    return `<tr data-c="${esc(c.id)}">
      <td class="nm"><b>${esc(c.name)}</b><span>${esc(c.type)} · ${esc(c.id)} · ${esc(c.status)}</span></td>
      <td class="r">${money(c.spend, 0, c.not_collected_reason)}</td><td class="r">${money(c.sales, 0, c.not_collected_reason)}</td><td class="r"><b>${pct(c.acos)}</b></td>
      <td class="r">${c.target_acos != null ? `<span title="${esc(c.target_reason)}">${pct(num(c.target_acos) * 100)}</span>` : `<span class="na" title="${esc(c.target_reason)}">Target not set</span>`}</td>
      <td class="r">${c.gap_pts == null ? '<span class="na">—</span>' : `<span class="${num(c.gap_pts) > 0 ? 'up' : 'down'}">${num(c.gap_pts) > 0 ? '+' : ''}${num(c.gap_pts).toFixed(1)} pts</span>`}</td>
      <td class="r">${c.orders == null ? na(c.not_collected_reason) : int(c.orders)}</td>
      <td class="r">${delta == null ? '<span class="na">—</span>' : `<span class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(1)} pts</span>`}</td>
      <td class="r yoy"><span class="na">No comparable history</span></td>
      <td>${c.alert ? `<span class="chip warn">${esc(c.alert)}</span>` : '<span class="na">—</span>'}</td>
      <td class="r"><span class="na">0</span></td>
      <td>${esc(c.method || '—')}</td>
      <td>${esc(c.purpose || 'not verified')}</td>
      <td>${esc(lc)}</td>
    </tr>`;
  }).join('');
  const tot = (D.ov[period] || {}).totals || {};
  $('#view').innerHTML = `<div class="page">
  <div class="filters">
    <select class="sel" id="cf" aria-label="Filter"><option value="all">All campaigns</option><option value="SP">Sponsored Products</option><option value="SB">Sponsored Brands</option><option value="SD">Sponsored Display</option></select>
    ${m ? `<span class="chip off">Data through ${esc(day(m.data_through))} · mature through ${esc(day(m.mature_through))}</span><span class="chip off">${esc(range(m.window.start, m.window.end))} vs ${esc(range(tot.prior_period.start, tot.prior_period.end))}</span>` : ''}
  </div>
  <div class="tw"><table>
    <thead><tr><th class="grp" colspan="1">Campaign</th><th class="grp" colspan="6">${m ? esc(range(m.window.start, m.window.end)) : ''}</th><th class="grp" colspan="${yo ? 2 : 1}">Trend</th><th class="grp" colspan="2">Status</th><th class="grp" colspan="3">Details</th></tr>
    <tr><th>Name · type · ID</th><th class="r">Spend</th><th class="r">Ad sales</th><th class="r">ACOS</th><th class="r">Target</th><th class="r">Gap</th><th class="r">Orders</th><th class="r">ACOS vs prior</th><th class="r yoy">ACOS last year</th><th>Alert</th><th class="r">Suggestions</th><th>Targeting</th><th>Purpose</th><th>Last change seen</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="14" class="na">No campaigns published for this period.</td></tr>'}</tbody>
    <tfoot><tr><td>${shown.length} campaigns · Sponsored Products totals${hidden ? ` · <button class="link" id="idle">show ${hidden} paused with no spend</button>` : showIdle ? ' · <button class="link" id="idle">hide paused with no spend</button>' : ''}</td><td class="r">${money(tot.spend)}</td><td class="r">${money(tot.ad_sales)}</td><td class="r">${pct(tot.acos)}</td><td colspan="${yo ? 10 : 9}"></td></tr></tfoot>
  </table></div></div>`;
  $('#cf').value = campFilter;
  $('#cf').onchange = e => { campFilter = e.target.value; campaigns(); };
  if ($('#idle')) $('#idle').onclick = () => { showIdle = !showIdle; campaigns(); };
  $('#view tbody').onclick = e => { const tr = e.target.closest('tr[data-c]'); if (tr) campDrawer(shown.find(c => c.id === tr.dataset.c)); };
}

let drawerTab = 'targets';
function campDrawer(c) {
  if (!c) return;
  const m = (D.ov[period] || {}).meta;
  const d = c.drill || {};
  const tabs = { ad_groups: 'Ad groups', targets: 'Keywords & targets', terms: 'Search terms', placements: 'Placements' };
  const list = d[drawerTab] || [];
  const totalRows = d[drawerTab + '_total'] || 0;
  const cpc = c.clicks ? null : null;
  $('#layer').innerHTML = `<div class="scrim" id="scrim"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dT">
    <button class="x" id="dX" aria-label="Close">${icon('x')}</button>
    <div><span class="chip ${c.type === 'SP' ? 'good' : 'info'}">${esc(c.type)}</span> <span class="chip off">${esc(c.purpose || 'purpose not verified')}</span> <span class="chip off">${esc(c.status)}</span></div>
    <h3 id="dT">${esc(c.name)}</h3><div style="color:var(--text-4);font-size:12px;margin-top:-8px">ID ${esc(c.id)} · ${esc(c.method || '')} · ${m ? esc(range(m.window.start, m.window.end)) : ''}</div>
    <div class="kgrid">
      <div class="kc"><span>Spend</span><b>${money(c.spend, 2, c.not_collected_reason)}</b></div><div class="kc"><span>Ad sales</span><b>${money(c.sales, 2, c.not_collected_reason)}</b></div><div class="kc"><span>ACOS · prior</span><b>${pct(c.acos)} · ${pct(c.prior_acos)}</b></div>
      <div class="kc"><span>Orders</span><b>${c.orders == null ? na() : int(c.orders)}</b></div><div class="kc"><span>Clicks</span><b>${c.clicks == null ? na() : int(c.clicks)}</b></div><div class="kc"><span>Impressions</span><b>${c.impressions == null ? na() : int(c.impressions)}</b></div>
    </div>
    <dl class="kv-list"><dt>Daily budget</dt><dd>${c.budget == null ? '—' : money(c.budget, 2) + '/day'}</dd><dt>Bidding</dt><dd>${esc(strategy(c.strategy))}</dd>
      <dt>Target</dt><dd>${c.target_acos != null ? pct(num(c.target_acos) * 100) + ' (' + esc(c.target_reason) + ')' : 'Not set: ' + esc(c.target_reason)}</dd>${c.not_collected_reason ? `<dt>Figures</dt><dd>${esc(c.not_collected_reason)}</dd>` : ''}</dl>
    <div class="tabs" role="tablist">${Object.entries(tabs).map(([k, l]) => `<button role="tab" aria-selected="${k === drawerTab}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="tw" style="border-radius:8px"><table><thead><tr><th>${esc(tabs[drawerTab])}</th><th class="r">Spend</th><th class="r">Ad sales</th><th class="r">ACOS</th><th class="r">Orders</th><th class="r">Clicks</th></tr></thead>
      <tbody>${list.length ? list.map(r => `<tr><td>${esc(r.label)}</td><td class="r">${money(r.spend, 2)}</td><td class="r">${money(r.sales, 2)}</td><td class="r">${pct(r.acos)}</td><td class="r">${int(r.orders)}</td><td class="r">${int(r.clicks)}</td></tr>`).join('') : '<tr><td colspan="6" class="na">Nothing in this period.</td></tr>'}</tbody></table></div>
    <p style="margin:0;font-size:12px;color:var(--text-4)">${totalRows > list.length ? `Top ${list.length} of ${totalRows} by spend.` : `${list.length} row(s).`} From Amazon's own reports, 7-day click attribution.</p>
  </aside>`;
  const close = () => { $('#layer').innerHTML = ''; document.onkeydown = null; };
  $('#dX').onclick = close; $('#scrim').onclick = close;
  $('#layer').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { drawerTab = b.dataset.tab; campDrawer(c); });
  document.onkeydown = e => { if (e.key === 'Escape') close(); };
  $('#dX').focus();
}

/* ------------------------------------------------------------------------------------- products */
function products() {
  const m = (D.ov[period] || {}).meta, sales = ((D.ov[period] || {}).sales || {}).intervals || [];
  const ro = isPhone();
  const dropRow = d => { const r = d.result || {}; const cls = d.status === 'loaded' ? 'good' : d.status === 'new' ? 'info' : d.status === 'duplicate' ? 'warn' : 'crit';
    const txt = d.status === 'new' ? 'waiting for the next load (nightly, or ask Claude to run it now)'
      : d.status === 'loaded' ? `${int(r.rows_published)} products loaded${r.rows_quarantined ? ', ' + int(r.rows_quarantined) + ' rows set aside' : ''}${(r.warnings || []).length ? ` <span class="na" title="${esc(r.warnings.join('\n'))}">(${r.warnings.length} note${r.warnings.length > 1 ? 's' : ''}, hover)</span>` : ''}`
      : esc(r.reason || r.import_status || d.status);
    return `<div class="hrow"><span><span class="chip ${cls}">${esc(d.status)}</span> ${esc(d.filename)} · ${d.interval_start ? esc(range(d.interval_start, d.interval_end)) : 'no dates'} · dropped ${esc(when(d.uploaded_at))}</span><b style="font-weight:500;max-width:60%;text-align:right">${txt}</b></div>`; };
  $('#view').innerHTML = `<div class="page">
  <section class="pn">
    <div class="ph"><h2>Drop in a Seller Central Business Report</h2><span class="sub">sales by child ASIN · the dates you chose in Seller Central · 2 minutes on Monday</span></div>
    ${ro ? '<div style="color:var(--text-3)">Drop files from a computer.</div>' : `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-3)">File (CSV)<input type="file" id="dfile" accept=".csv,.txt,.xlsx" class="sel"></label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-3)">First day the report covers<input type="date" id="dstart" class="sel"></label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-3)">Last day<input type="date" id="dend" class="sel"></label>
      <button class="btn go" id="dgo">Drop it in</button>
    </div>
    <div class="kd" style="margin-top:8px">Seller Central > Reports > Business Reports > Detail Page Sales and Traffic by Child Item > pick the dates (last Monday to Sunday) > Download CSV. The file does not say which dates it covers, so type them exactly as you chose them; the report is loaded for those dates and never divided into days. Loaded by the nightly job through the same checks as every file; ask Claude to load it now if you need the numbers today.</div>`}
    ${D.dropins.length ? `<div style="margin-top:10px">${D.dropins.map(dropRow).join('')}</div>` : ''}
  </section>
  ${sales.length ? `<section class="pn"><div class="ph"><h2>Total sales and TACOS by loaded interval</h2><span class="sub">ad spend over the same dates ÷ total sales</span></div>
    <div class="tw"><table><thead><tr><th>Interval</th><th class="r">Days</th><th class="r">Total sales</th><th class="r">Units</th><th class="r">Ad spend</th><th class="r">TACOS</th></tr></thead>
    <tbody>${sales.map(s => `<tr><td>${esc(range(s.start, s.end))}</td><td class="r">${int(s.days)}</td><td class="r">${money(s.total_sales)}</td><td class="r">${int(s.units)}</td><td class="r">${s.ad_spend != null ? money(s.ad_spend) : na(s.tacos_reason)}</td><td class="r"><b>${s.tacos != null ? pct(s.tacos) : na(s.tacos_reason)}</b></td></tr>`).join('')}</tbody></table></div></section>` : ''}
  ${D.products.length ? `<section class="pn"><div class="ph"><h2>Products · ${esc(range(D.products[0].interval.start, D.products[0].interval.end))}</h2><span class="sub">from the latest loaded file · conversion and Buy Box are the gates before any raise</span></div>
    <div class="tw"><table><thead><tr><th>Product</th><th>ASIN</th><th class="r">Total sales</th><th class="r">Units</th><th class="r">Sessions</th><th class="r">Conversion</th><th class="r">Buy Box</th><th class="r">Ad spend</th><th class="r">Left after ads</th></tr></thead>
    <tbody>${D.products.map(p => `<tr><td class="nm"><b>${esc((p.title || '').slice(0, 70))}</b></td><td>${esc(p.asin)}</td><td class="r">${money(p.total_sales)}</td><td class="r">${int(p.units)}</td><td class="r">${p.sessions == null ? na() : int(p.sessions)}</td>
      <td class="r">${p.conversion_pct == null ? na() : pct(p.conversion_pct)}</td><td class="r">${p.buy_box_pct == null ? na() : pct(p.buy_box_pct)}</td><td class="r">${na(p.ad_spend_reason)}</td><td class="r">${na(p.contribution_reason)}</td></tr>`).join('')}</tbody></table></div>
    <div class="pf"><span>Ad spend per product and what is left after ads need the product map and your product costs; nothing is estimated until then.</span></div></section>`
    : `<div class="empty"><h2>No Seller Central sales loaded yet</h2>Drop the Business Report above. Then this page shows, per product: total sales, units, sessions, conversion and Buy Box, and (with your costs) what is left after ads.</div>`}
  </div>`;
  if ($('#dgo')) $('#dgo').onclick = async () => {
    const f = $('#dfile').files[0], s = $('#dstart').value, e = $('#dend').value;
    if (!f) return toast('Choose the CSV first.');
    if (!s || !e) return toast('Type the first and last day the report covers.');
    if (e < s) return toast('The last day is before the first day.');
    if (f.size > 5000000) return toast('That file is over 5 MB; is it the right report?');
    $('#dgo').disabled = true;
    const buf = new Uint8Array(await f.arrayBuffer());
    const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await sb.from('dropin').insert({ profile_id: CFG.profileId, kind: 'seller_business_report', filename: f.name, content: '\\x' + hex, sha256: digest, interval_start: s, interval_end: e });
    if (error) { $('#dgo').disabled = false; toast('Not saved: ' + error.message); return; }
    toast('Dropped in. It loads on the next nightly run, or ask Claude to load it now.');
    await load(); products();
  };
}

/* ------------------------------------------------------------------------------------- alerts */
let alertTab = 'open';
function alerts() {
  const states = [['open', 'Open'], ['acknowledged', 'Acknowledged'], ['investigating', 'Investigating'], ['resolved', 'Resolved']];
  const list = D.alerts.filter(a => a.state === alertTab);
  const sevName = { urgent: 'Urgent', action_needed: 'Action needed', informational: 'Informational' };
  const ro = isPhone();
  $('#view').innerHTML = `<div class="page">
  <div class="tabs" role="tablist">${states.map(([k, l]) => `<button role="tab" aria-selected="${k === alertTab}" data-at="${k}">${l} (${D.alerts.filter(a => a.state === k).length})</button>`).join('')}</div>
  ${list.length ? list.map(a => `<section class="pn" style="flex-direction:row;gap:14px"><span class="sev ${sevClass(a.severity)}"></span><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="chip ${sevClass(a.severity)}">${sevName[a.severity] || esc(a.severity)}</span><b style="font-size:14px">${esc(a.type)}</b></div>
    <dl class="kv-list"><dt>Affected</dt><dd>${esc((a.entity_type || '') + ' ' + (a.entity_id || ''))}</dd><dt>Why</dt><dd>${esc(a.trigger)}</dd><dt>Period</dt><dd>${a.period_start ? esc(day(a.period_start) + ' – ' + day(a.period_end)) : '—'}</dd><dt>Next step</dt><dd>${esc(a.next_step || '—')}</dd><dt>Opened · updated</dt><dd>${esc(when(a.opened_at))} · ${esc(when(a.updated_at))}</dd></dl>
    ${a.state === 'resolved' || ro ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap">${a.state === 'open' ? `<button class="btn" data-mv="acknowledged" data-id="${esc(a.alert_id)}">Acknowledge</button>` : ''}${a.state !== 'investigating' ? `<button class="btn" data-mv="investigating" data-id="${esc(a.alert_id)}">I’m looking into it</button>` : ''}<button class="btn ghost" data-mv="resolved" data-id="${esc(a.alert_id)}">Resolve</button></div>`}
  </div></section>`).join('') : '<div class="pn" style="color:var(--text-3)">Nothing here.</div>'}
  </div>`;
  $('#view').querySelectorAll('[data-at]').forEach(b => b.onclick = () => { alertTab = b.dataset.at; alerts(); });
  $('#view').querySelectorAll('[data-mv]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const now = new Date().toISOString(), st = b.dataset.mv;
    const patch = { state: st, updated_at: now };
    if (st === 'acknowledged') patch.acknowledged_at = now;
    if (st === 'resolved') patch.resolved_at = now;
    const { error } = await sb.from('alert').update(patch).eq('alert_id', b.dataset.id);
    if (error) { b.disabled = false; toast('Not saved: ' + error.message); return; }
    await load(); renderNav(); alerts(); toast('Moved to ' + st);
  });
}

/* ------------------------------------------------------------------------------------- health */
function health() {
  const h = D.health;
  const card = (t, item, rows) => `<section class="pn hc"><div class="ph"><h2>${t}</h2><span class="sp"></span>${chipFor(item)}</div>${rows.map(r => `<div class="hrow"><span>${esc(r[0])}</span><b>${r[1]}</b></div>`).join('')}</section>`;
  const col = h.collection || { data: {} }, rec = h.reconciliation || { data: { checks: [] } }, bk = h.backup || { data: {} }, rt = h.restore_test || { data: {} }, aa = h.amazon_access || { data: {} }, inp = h.inputs || { data: {} };
  $('#view').innerHTML = `<div class="page">
  ${note('Each part reports on its own, so a good result in one place can never hide a failure in another. Figures are as of the last nightly publish' + (D.publishedAt ? ' (' + esc(when(D.publishedAt)) + ')' : '') + '.')}
  <div class="hgrid">
  ${card('Collection', h.collection, [['Last run', esc(when(col.data.last_run)) + (col.data.result ? ' · ' + esc(col.data.result) : '')], ['Data through', esc(day(col.data.data_through))], ['Sponsored Brands / Display', 'not collected yet'], ['Needs action', esc(col.data.needs_action || 'nothing')]])}
  ${card('Reconciliation with Amazon', h.reconciliation, rec.data.checks.map(c => [c.check.replace(/_/g, ' '), (c.ok ? 'passed' : 'out of tolerance') + ' · ' + esc(days(c.period))]))}
  ${card('Backup & recovery', h.backup, [['Last backup (Backblaze)', bk.data.last_run ? esc(when(bk.data.last_run)) + ' · ' + esc(bk.data.result) : 'not recorded yet'], ['Last restore test', rt.data.last_run ? esc(when(rt.data.last_run)) + ' · ' + esc(rt.data.result) : 'not recorded yet'], ['Encryption key', 'in your 1Password']])}
  ${card('Amazon access', h.amazon_access, [['Consent given', esc(day(aa.data.consented)) + ', ' + esc((aa.data.consented || '').slice(0, 4))], ['Renew by', esc(day(aa.data.renew_by)) + ', ' + esc((aa.data.renew_by || '').slice(0, 4))], ['Expires', esc(day(aa.data.expires)) + ', ' + esc((aa.data.expires || '').slice(0, 4))]])}
  ${card('Your inputs', h.inputs, [['Product costs', esc(inp.data.product_costs)], ['Seller Central sales', esc(inp.data.seller_central_sales)], ['Protected search terms', esc(inp.data.protected_terms)]])}
  ${card('Mode', { status: 'ok' }, [['Rules', 'shadow mode (none running yet)'], ['Changes on Amazon', 'only by you']])}
  </div></div>`;
}

function later(p) {
  const what = p.id === 'discovery'
    ? ['Each broad-match discovery test with its question, allowance, review date and results', 'New candidate terms, kept apart from proven winners', 'Negatives grouped by reason']
    : ['Everything you approved, with the value you chose', 'What Amazon accepted or rejected, row by row', 'Results after enough time has passed, labelled as observed, never as guaranteed savings'];
  $('#view').innerHTML = `<div class="page"><div class="later-pg"><h2>${esc(p.t)} comes in the second release</h2>The history it needs is recorded from day one, so nothing is lost while it waits. It will show:<ul>${what.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div></div>`;
}

let toastTimer;
function toast(msg) {
  clearTimeout(toastTimer);
  $('#layer').insertAdjacentHTML('beforeend', `<div class="toast" id="toast">${esc(msg)}</div>`);
  toastTimer = setTimeout(() => { const t = $('#toast'); if (t) t.remove(); }, 3500);
}

/* ------------------------------------------------------------------------------------- sign-in */
async function showApp(session) {
  $('#login').hidden = true; $('#app').hidden = false;
  const email = session.user.email || '';
  $('#who').textContent = email || 'Signed in';
  $('#av').textContent = (email[0] || 'B').toUpperCase() + (email.split('@')[0][1] || 'W').toUpperCase();
  try {
    await load();
  } catch (e) {
    $('#view').innerHTML = `<div class="page"><div class="empty"><h2>Could not load the data</h2>${esc(e.message || e)}. If this persists, the Health page and the morning email will say why.</div></div>`;
    return;
  }
  renderStatus();
  go(location.hash.slice(1) || 'overview');
}

function showLogin(msg) {
  $('#app').hidden = true; $('#login').hidden = false;
  $('#loginErr').textContent = msg || '';
  $('#email').focus();
}

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  $('#loginBtn').disabled = true; $('#loginErr').textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
  $('#password').value = '';
  $('#loginBtn').disabled = false;
  if (error) { showLogin('Sign-in failed: ' + error.message); return; }
  showApp(data.session);
};
if ($('#chgPw')) $('#chgPw').onclick = () => {
  $('#layer').innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="cpT"><form class="box" id="cpForm" autocomplete="on">
    <h3 id="cpT">Change your password</h3>
    <p style="margin:0;font-size:12.5px;color:var(--text-3)">At least 10 characters. A few words you will remember (for example three words and a number) are both easy and strong.</p>
    <input type="text" autocomplete="username" value="${esc($('#who').textContent)}" hidden readonly>
    <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-2)">New password<input id="np1" type="password" autocomplete="new-password" minlength="10" required style="padding:10px 12px;border:1px solid var(--border-2);border-radius:9px;background:var(--panel-2);color:var(--text)"></label>
    <label style="display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-2)">Type it again<input id="np2" type="password" autocomplete="new-password" minlength="10" required style="padding:10px 12px;border:1px solid var(--border-2);border-radius:9px;background:var(--panel-2);color:var(--text)"></label>
    <div class="err" id="cpErr" role="alert" style="font-size:12.5px;color:#f59b99;min-height:18px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" type="button" id="cpCancel">Cancel</button><button class="btn go" type="submit" id="cpGo">Save new password</button></div>
  </form></div>`;
  const close = () => { $('#layer').innerHTML = ''; };
  $('#cpCancel').onclick = close;
  $('#np1').focus();
  $('#cpForm').onsubmit = async e => {
    e.preventDefault();
    const a = $('#np1').value, b = $('#np2').value;
    if (a.length < 10) { $('#cpErr').textContent = 'Use at least 10 characters.'; return; }
    if (a !== b) { $('#cpErr').textContent = 'The two entries are different. Type them again.'; return; }
    $('#cpGo').disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    $('#np1').value = ''; $('#np2').value = '';
    if (error) { $('#cpGo').disabled = false; $('#cpErr').textContent = 'Not changed: ' + error.message; return; }
    close(); toast('Password changed. Use the new one next time you sign in.');
  };
};
$('#signOut').onclick = async () => { await sb.auth.signOut(); D.ov = {}; D.camps = {}; showLogin('Signed out.'); };
window.addEventListener('hashchange', () => go(location.hash.slice(1)));
$('#nav').addEventListener('click', e => { const a = e.target.closest('a[data-p]'); if (a) { e.preventDefault(); history.replaceState(null, '', '#' + a.dataset.p); go(a.dataset.p); } });
$('#yoy').onclick = () => { const on = !document.body.classList.contains('yoy-on'); document.body.classList.toggle('yoy-on', on); $('#yoy').setAttribute('aria-pressed', on); go(current); };
$('#range').onclick = e => { const b = e.target.closest('button'); if (!b) return; period = b.dataset.d; $('#range').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); go(current); };

(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) showApp(data.session); else showLogin();
})();
