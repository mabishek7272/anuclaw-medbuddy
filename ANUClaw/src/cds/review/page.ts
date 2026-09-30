/**
 * Clinician review console — server-rendered, self-contained (no build step).
 *
 * A light-theme, tabbed single-page console for the CDS endpoints:
 *   • Review  — run a new evaluation (builds a CDS Hooks request from a form),
 *               see result tiles, and record Accept / Modify / Reject sign-offs.
 *   • Audit   — verify the hash chain and export the signed audit bundle.
 *   • Service — view the CDS Hooks discovery descriptor.
 *
 * All buttons call the real routes via fetch and send the SMART access token
 * (entered in the header) as a Bearer header when auth is enabled. Initial cards
 * are rendered server-side (HTML-escaped); new results render client-side.
 */

import { ReviewItem } from './review-service';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDetail(detail: string | undefined): string {
  if (!detail) return '';
  return esc(detail)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

const PILL: Record<string, string> = {
  info: 'pill-info',
  warning: 'pill-warning',
  critical: 'pill-critical',
};

function cardHtml(item: ReviewItem): string {
  const ind = item.indicator;
  const links = (item.card.links ?? [])
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
    .join(' · ');
  const escalated = item.escalated
    ? '<span class="badge-escalated">explanation escalated — human review</span>'
    : '';

  return `
  <section class="card ind-${esc(ind)}" data-verdict="${esc(item.verdict_hash)}">
    <div class="card-head">
      <span class="pill ${PILL[ind] ?? 'pill-info'}">${esc(ind.toUpperCase())}</span>
      <h3>${esc(item.card.summary)}</h3>
    </div>
    <div class="detail">${renderDetail(item.card.detail)}</div>
    <div class="meta">Source: ${esc(item.card.source.label)}${links ? ' · ' + links : ''}</div>
    ${escalated}
    <form class="signoff" data-verdict="${esc(item.verdict_hash)}">
      <div class="row">
        <label class="field">Decision
          <select name="action">
            <option value="accept">Accept</option>
            <option value="accept_with_modification">Accept with modification</option>
            <option value="reject">Reject (override)</option>
          </select>
        </label>
        <label class="field grow">Override / modification reason
          <input name="reason" type="text" placeholder="Required to modify or reject…">
        </label>
      </div>
      <div class="row actions">
        <button class="btn btn-primary" type="submit">Sign &amp; record</button>
        <span class="result" aria-live="polite"></span>
      </div>
    </form>
  </section>`;
}

const EMPTY_CARDS =
  '<div class="empty">No evaluation yet. Use <strong>New evaluation</strong> to run an order, or <strong>Load demo scenario</strong>.</div>';

/** Embed JSON safely inside a &lt;script&gt; (no raw `<`). */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export interface ReviewPageOptions {
  /** Base path for evaluate/signoff/audit calls (default '/cds/review'). */
  apiBase?: string;
  /** Path for the discovery descriptor (default '/cds-services'). */
  servicePath?: string;
  /** Show the SMART Bearer-token field (default true). Set false under cookie auth. */
  showToken?: boolean;
}

export function renderReviewPage(
  items: ReviewItem[],
  clinicianId = 'demo-clinician',
  opts: ReviewPageOptions = {},
): string {
  const apiBase = opts.apiBase ?? '/cds/review';
  const servicePath = opts.servicePath ?? '/cds-services';
  const showToken = opts.showToken !== false;
  const cards = items.length ? items.map(cardHtml).join('\n') : EMPTY_CARDS;
  const tokenField = showToken
    ? '<div class="token"><label class="field" style="flex-direction:row;align-items:center;gap:6px;">Access token' +
      '<input id="token" type="password" placeholder="SMART Bearer (optional in dev)"></label></div>'
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ANUClaw v3 — CDS Console</title>
<style>
  :root {
    --bg:#f5f7fa; --surface:#ffffff; --surface-2:#f8fafc; --border:#e2e8f0;
    --ink:#0f172a; --muted:#64748b; --primary:#0d9488; --primary-d:#0f766e;
    --indigo:#4f46e5; --shadow:0 1px 2px rgba(15,23,42,.06),0 4px 12px rgba(15,23,42,.05);
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:15px/1.55 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  a { color:var(--primary-d); }
  .topbar { background:var(--surface); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:10; }
  .topbar-in { max-width:980px; margin:0 auto; padding:14px 24px; display:flex; align-items:center; gap:16px; }
  .brand { display:flex; flex-direction:column; }
  .brand b { font-size:17px; letter-spacing:-.2px; }
  .brand span { font-size:12px; color:var(--muted); }
  .spacer { flex:1; }
  .token { display:flex; align-items:center; gap:8px; }
  .token input { width:200px; }
  .who { font-size:12px; color:var(--muted); background:var(--surface-2);
    border:1px solid var(--border); border-radius:999px; padding:4px 10px; }
  nav.tabs { max-width:980px; margin:16px auto 0; padding:0 24px; display:flex; gap:8px; }
  nav.tabs button { background:transparent; border:1px solid transparent; color:var(--muted);
    padding:8px 14px; border-radius:8px 8px 0 0; font:inherit; font-weight:600; cursor:pointer; }
  nav.tabs button.active { color:var(--ink); background:var(--surface);
    border-color:var(--border); border-bottom-color:var(--surface); }
  main { max-width:980px; margin:0 auto; padding:0 24px 48px; }
  .panel { background:var(--surface); border:1px solid var(--border); border-radius:0 12px 12px 12px;
    box-shadow:var(--shadow); padding:22px; }
  .tab { display:none; } .tab.active { display:block; }
  h2 { font-size:15px; margin:0 0 14px; text-transform:uppercase; letter-spacing:.4px; color:var(--muted); }
  .tile { background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:16px; margin-bottom:18px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .field { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); font-weight:600; }
  .field.grow { flex:1; }
  label.field input, label.field select, .token input {
    background:#fff; color:var(--ink); border:1px solid var(--border); border-radius:8px;
    padding:9px 10px; font:inherit; font-weight:400; }
  .geno-row { display:flex; gap:8px; align-items:end; margin-bottom:8px; }
  .geno-row .field { flex:1; }
  .row { display:flex; gap:10px; align-items:end; flex-wrap:wrap; }
  .row.actions { margin-top:12px; align-items:center; }
  .btn { border:1px solid var(--border); background:#fff; color:var(--ink); border-radius:8px;
    padding:9px 16px; font:inherit; font-weight:600; cursor:pointer; }
  .btn:hover { background:var(--surface-2); }
  .btn-primary { background:var(--primary); border-color:var(--primary); color:#fff; }
  .btn-primary:hover { background:var(--primary-d); }
  .btn-ghost { background:transparent; }
  .btn:disabled { opacity:.5; cursor:default; }
  .card { background:#fff; border:1px solid var(--border); border-left-width:5px; border-radius:10px;
    padding:16px; margin-bottom:14px; box-shadow:var(--shadow); }
  .card.ind-info { border-left-color:var(--primary); }
  .card.ind-warning { border-left-color:#d97706; }
  .card.ind-critical { border-left-color:#dc2626; }
  .card-head { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .card-head h3 { font-size:15px; margin:0; }
  .pill { font-size:11px; font-weight:700; letter-spacing:.4px; padding:2px 9px; border-radius:999px; }
  .pill-info { background:#ccfbf1; color:#0f766e; }
  .pill-warning { background:#fef3c7; color:#92400e; }
  .pill-critical { background:#fee2e2; color:#991b1b; }
  .detail { background:var(--surface-2); border:1px solid var(--border); border-radius:8px; padding:12px; font-size:14px; }
  .meta { color:var(--muted); font-size:12px; margin:10px 0; }
  .badge-escalated { display:inline-block; background:#fef3c7; color:#92400e; font-size:12px;
    padding:3px 10px; border-radius:999px; margin:4px 0; }
  .signoff { border-top:1px solid var(--border); padding-top:12px; margin-top:8px; }
  .result { font-size:13px; }
  .result.ok { color:#15803d; } .result.err { color:#b91c1c; }
  .empty { color:var(--muted); padding:18px; text-align:center; }
  .statusline { font-size:13px; margin:10px 0; }
  .statusline.ok { color:#15803d; } .statusline.err { color:#b91c1c; }
  table.audit { width:100%; border-collapse:collapse; font-size:12.5px; margin-top:10px; }
  table.audit th, table.audit td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--border); }
  table.audit th { color:var(--muted); font-weight:600; }
  table.audit td.hash { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:var(--muted); }
  pre.json { background:var(--surface-2); border:1px solid var(--border); border-radius:8px;
    padding:12px; overflow:auto; font-size:12px; max-height:340px; }
  footer { max-width:980px; margin:0 auto; padding:18px 24px; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<div class="topbar"><div class="topbar-in">
  <div class="brand"><b>ANUClaw v3 — CDS Console</b><span>Deterministic pharmacogenomic decision support · Clinician Review</span></div>
  <div class="spacer"></div>
  ${tokenField}
  <span class="who" id="who"></span>
</div></div>

<nav class="tabs">
  <button data-tab="review" class="active">Review</button>
  <button data-tab="audit">Audit log</button>
  <button data-tab="service">Service</button>
</nav>

<main>
  <section id="tab-review" class="tab active"><div class="panel">
    <div class="tile">
      <h2>New evaluation</h2>
      <div class="grid">
        <label class="field">Patient ID <input id="f-patient" value="demo-patient-001"></label>
        <label class="field">Prescribed drug(s) <input id="f-drug" value="codeine" placeholder="e.g. codeine, clopidogrel"></label>
      </div>
      <div id="geno-rows" style="margin-top:12px;"></div>
      <button class="btn btn-ghost" id="add-geno" type="button">+ add genotype</button>
      <div class="grid" style="margin-top:12px;">
        <label class="field">Allergies (comma) <input id="f-allergy" placeholder="leave blank = none known"></label>
        <label class="field">Active medications (comma) <input id="f-meds" placeholder="leave blank = none known"></label>
      </div>
      <label class="field" style="margin-top:12px;">Conditions (comma) <input id="f-cond" placeholder="e.g. active pathological bleeding"></label>
      <div class="row actions">
        <button class="btn btn-primary" id="btn-eval" type="button">Evaluate order</button>
        <button class="btn" id="btn-demo" type="button">Load demo scenario</button>
        <span class="result" id="eval-status"></span>
      </div>
    </div>
    <h2>Decision cards</h2>
    <div id="review-results">${cards}</div>
  </div></section>

  <section id="tab-audit" class="tab"><div class="panel">
    <h2>Audit log (append-only · hash-chained)</h2>
    <div class="row">
      <button class="btn btn-primary" id="btn-verify" type="button">Verify chain</button>
      <button class="btn" id="btn-export" type="button">Export bundle</button>
      <button class="btn btn-ghost" id="btn-download" type="button" disabled>Download JSON</button>
    </div>
    <div class="statusline" id="audit-status"></div>
    <div id="audit-table"></div>
  </div></section>

  <section id="tab-service" class="tab"><div class="panel">
    <h2>CDS Hooks service descriptor</h2>
    <div class="row"><button class="btn btn-primary" id="btn-service" type="button">Load /cds-services</button></div>
    <pre class="json" id="service-info" style="margin-top:12px;display:none;"></pre>
  </div></section>
</main>

<footer>The recommendation is advisory — the clinician holds final authority. Every evaluation and sign-off is recorded to an append-only, hash-chained audit log.</footer>

<script>
window.__CDS__ = ${safeJson({ clinicianId, apiBase, servicePath, showToken })};
(function(){
  var CFG = window.__CDS__ || {};
  var CLINICIAN = CFG.clinicianId || 'demo-clinician';
  var API = CFG.apiBase || '/cds/review';
  var SVC = CFG.servicePath || '/cds-services';
  var lastBundle = null;
  function $(s, r){ return (r||document).querySelector(s); }
  function all(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }
  function val(s){ var e=$(s); return e ? e.value.trim() : ''; }
  function token(){ var e=$('#token'); return e ? e.value.trim() : ''; }
  function headers(json){ var h = json ? { 'content-type':'application/json' } : {}; if(CFG.showToken){ var t=token(); if(t) h['Authorization']='Bearer '+t; } return h; }
  function opts(o){ o = o || {}; o.credentials='include'; return o; }
  function escapeHtml(s){ return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function boldify(s){ var p = escapeHtml(s||'').split('**'); var o=''; for(var i=0;i<p.length;i++){ o += (i%2===1)?('<strong>'+p[i]+'</strong>'):p[i]; } return o.split('\\n').join('<br>'); }

  // ── Tabs ───────────────────────────────────────────────────────────────
  all('nav.tabs button').forEach(function(b){
    b.addEventListener('click', function(){
      all('nav.tabs button').forEach(function(x){ x.classList.remove('active'); });
      all('.tab').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      $('#tab-'+b.getAttribute('data-tab')).classList.add('active');
    });
  });

  // ── Genotype rows ──────────────────────────────────────────────────────
  function genoRow(gene, dip){
    var row = document.createElement('div'); row.className='geno-row';
    row.innerHTML =
      '<label class="field">Gene <select class="geno-gene">'
      + '<option value="CYP2D6">CYP2D6</option><option value="CYP2C19">CYP2C19</option></select></label>'
      + '<label class="field grow">Diplotype <input class="geno-dip" placeholder="e.g. *1/*4"></label>'
      + '<button class="btn btn-ghost geno-del" type="button">remove</button>';
    if (gene) $('.geno-gene', row).value = gene;
    if (dip) $('.geno-dip', row).value = dip;
    $('.geno-del', row).addEventListener('click', function(){ row.remove(); });
    return row;
  }
  $('#add-geno').addEventListener('click', function(){ $('#geno-rows').appendChild(genoRow('CYP2D6','')); });

  // ── Card rendering + sign-off ──────────────────────────────────────────
  function pillClass(ind){ return ind==='critical'?'pill-critical':ind==='warning'?'pill-warning':'pill-info'; }
  function cardHtml(item){
    var c = item.card;
    var links = (c.links||[]).map(function(l){ return '<a href="'+escapeHtml(l.url)+'" target="_blank" rel="noopener">'+escapeHtml(l.label)+'</a>'; }).join(' · ');
    var esc = item.escalated ? '<span class="badge-escalated">explanation escalated — human review</span>' : '';
    return '<section class="card ind-'+escapeHtml(item.indicator)+'" data-verdict="'+escapeHtml(item.verdict_hash)+'">'
      + '<div class="card-head"><span class="pill '+pillClass(item.indicator)+'">'+escapeHtml(item.indicator.toUpperCase())+'</span><h3>'+escapeHtml(c.summary)+'</h3></div>'
      + '<div class="detail">'+boldify(c.detail)+'</div>'
      + '<div class="meta">Source: '+escapeHtml(c.source.label)+(links?' · '+links:'')+'</div>'
      + esc
      + '<form class="signoff" data-verdict="'+escapeHtml(item.verdict_hash)+'">'
      + '<div class="row"><label class="field">Decision <select name="action">'
      + '<option value="accept">Accept</option><option value="accept_with_modification">Accept with modification</option><option value="reject">Reject (override)</option>'
      + '</select></label><label class="field grow">Override / modification reason <input name="reason" type="text" placeholder="Required to modify or reject…"></label></div>'
      + '<div class="row actions"><button class="btn btn-primary" type="submit">Sign &amp; record</button><span class="result"></span></div>'
      + '</form></section>';
  }
  function renderCards(items){
    var box = $('#review-results');
    if (!items || !items.length){ box.innerHTML = '<div class="empty">No pharmacogenomic guidance for this order.</div>'; return; }
    box.innerHTML = items.map(cardHtml).join('');
    all('.signoff', box).forEach(wireSignoff);
  }
  function wireSignoff(form){
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      var action = $('[name=action]', form).value;
      var reason = $('[name=reason]', form).value.trim();
      var out = $('.result', form);
      if (action !== 'accept' && !reason){ out.textContent='A reason is required to modify or reject.'; out.className='result err'; return; }
      out.textContent='Recording…'; out.className='result';
      fetch(API+'/signoff', opts({ method:'POST', headers:headers(true),
        body: JSON.stringify({ verdict_hash: form.getAttribute('data-verdict'), clinician:{ id: CLINICIAN }, action: action, override_reason: reason||undefined }) }))
      .then(function(r){ return r.json().then(function(d){ return { ok:r.ok, d:d }; }); })
      .then(function(res){
        if(!res.ok) throw new Error(res.d.error||'sign-off failed');
        out.textContent='Signed — audit #'+res.d.entry.seq+' ('+action+').'; out.className='result ok';
        $('button', form).disabled = true;
      })
      .catch(function(e){ out.textContent=e.message; out.className='result err'; });
    });
  }

  // ── Evaluate ───────────────────────────────────────────────────────────
  function listBundle(csv, mapFn){
    var items = (csv||'').split(',').map(function(s){ return s.trim(); }).filter(Boolean).map(function(s){ return { resource: mapFn(s) }; });
    return { resourceType:'Bundle', entry: items };
  }
  function buildRequest(){
    var orders = (val('#f-drug')||'').split(',').map(function(s){ return s.trim(); }).filter(Boolean)
      .map(function(d){ return { resource:{ resourceType:'MedicationRequest', medicationCodeableConcept:{ text:d } } }; });
    var genos = all('.geno-row').map(function(row){
      var g=$('.geno-gene',row).value, dp=$('.geno-dip',row).value.trim();
      return dp ? { resource:{ resourceType:'Observation', code:{ text:g+' genotype' }, valueString:dp } } : null;
    }).filter(Boolean);
    return { hook:'order-sign',
      context:{ patientId: val('#f-patient')||'patient-001', draftOrders:{ resourceType:'Bundle', entry: orders } },
      prefetch:{
        genotypes:{ resourceType:'Bundle', entry: genos },
        allergies: listBundle(val('#f-allergy'), function(s){ return { resourceType:'AllergyIntolerance', code:{ text:s } }; }),
        medications: listBundle(val('#f-meds'), function(s){ return { resourceType:'MedicationStatement', medicationCodeableConcept:{ text:s } }; }),
        conditions: listBundle(val('#f-cond'), function(s){ return { resourceType:'Condition', code:{ text:s } }; })
      } };
  }
  function evaluate(body){
    var st = $('#eval-status'); st.textContent='Evaluating…'; st.className='result';
    fetch(API+'/evaluate', opts({ method:'POST', headers:headers(true), body: JSON.stringify(body) }))
    .then(function(r){ return r.json().then(function(d){ return { ok:r.ok, d:d }; }); })
    .then(function(res){
      if(!res.ok) throw new Error(res.d.error||'evaluation failed');
      renderCards(res.d.items);
      st.textContent = res.d.items.length + ' card(s) for ' + res.d.patientId + '.'; st.className='result ok';
    })
    .catch(function(e){ st.textContent=e.message; st.className='result err'; });
  }
  $('#btn-eval').addEventListener('click', function(){ evaluate(buildRequest()); });
  $('#btn-demo').addEventListener('click', function(){
    $('#f-patient').value='demo-patient-001'; $('#f-drug').value='clopidogrel, codeine';
    $('#f-allergy').value='codeine'; $('#f-meds').value=''; $('#f-cond').value='';
    $('#geno-rows').innerHTML=''; $('#geno-rows').appendChild(genoRow('CYP2C19','*2/*2')); $('#geno-rows').appendChild(genoRow('CYP2D6','*1x2/*1'));
    evaluate(buildRequest());
  });

  // ── Audit ──────────────────────────────────────────────────────────────
  $('#btn-verify').addEventListener('click', function(){
    var st=$('#audit-status'); st.textContent='Verifying…'; st.className='statusline';
    fetch(API+'/audit/verify', opts({ headers:headers(false) })).then(function(r){ return r.json(); })
    .then(function(d){ st.textContent = d.valid ? 'Chain valid ✓' : ('Chain BROKEN at #'+d.brokenAt+' — '+d.reason); st.className='statusline '+(d.valid?'ok':'err'); })
    .catch(function(e){ st.textContent=e.message; st.className='statusline err'; });
  });
  $('#btn-export').addEventListener('click', function(){
    var st=$('#audit-status'); st.textContent='Exporting…'; st.className='statusline';
    fetch(API+'/audit/export', opts({ headers:headers(false) })).then(function(r){ return r.json(); })
    .then(function(b){
      lastBundle = b; $('#btn-download').disabled = false;
      st.textContent = b.entry_count + ' entries · head '+String(b.head_hash).slice(0,12)+'… · chain '+(b.chain_valid?'valid':'BROKEN')+' · retain '+b.retention_years+'y'; st.className='statusline '+(b.chain_valid?'ok':'err');
      var rows = (b.entries||[]).map(function(e){
        return '<tr><td>'+e.seq+'</td><td>'+escapeHtml(e.actor)+'</td><td>'+escapeHtml(e.event_type)+'</td><td class="hash">'+String(e.entry_hash).slice(0,16)+'…</td></tr>';
      }).join('');
      $('#audit-table').innerHTML = '<table class="audit"><thead><tr><th>#</th><th>Actor</th><th>Event</th><th>Entry hash</th></tr></thead><tbody>'+rows+'</tbody></table>';
    })
    .catch(function(e){ st.textContent=e.message; st.className='statusline err'; });
  });
  $('#btn-download').addEventListener('click', function(){
    if(!lastBundle) return;
    var blob = new Blob([JSON.stringify(lastBundle,null,2)], { type:'application/json' });
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='cds-audit-bundle.json'; a.click();
  });

  // ── Service ────────────────────────────────────────────────────────────
  $('#btn-service').addEventListener('click', function(){
    fetch(SVC, opts({ headers:headers(false) })).then(function(r){ return r.json(); })
    .then(function(d){ var p=$('#service-info'); p.style.display='block'; p.textContent=JSON.stringify(d,null,2); })
    .catch(function(e){ var p=$('#service-info'); p.style.display='block'; p.textContent=e.message; });
  });

  // ── Init ───────────────────────────────────────────────────────────────
  $('#who').textContent = 'Reviewer: ' + CLINICIAN;
  $('#geno-rows').appendChild(genoRow('CYP2D6','*1/*1'));
  all('.signoff').forEach(wireSignoff);
})();
</script>
</body>
</html>`;
}
