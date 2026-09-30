/**
 * E-LAB platform console (WS-F) — self-contained light-theme UI, no build step.
 *
 * The reference consumer of the tiered engine API:
 *   • Drug Combination (Clinical) — posts to the public demo endpoint
 *     /v1/elab/demo/clinical (seed data, stub tenant) so it works out of the box;
 *     production uses POST /v1/clinical/drug-combination with a tenant token.
 *   • Engines (RUO) — advanced: posts to /v1/ruo/:engineId with an API key.
 *
 * All dynamic content is escaped client-side. No server-injected values, so the
 * whole document is static.
 */

export function renderElabConsole(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ANUClaw E-LAB — Engine Console</title>
<style>
  :root{--bg:#f5f7fa;--surface:#fff;--surface2:#f8fafc;--border:#e2e8f0;--ink:#0f172a;--muted:#64748b;--primary:#0d9488;--primary-d:#0f766e;--shadow:0 1px 2px rgba(15,23,42,.06),0 4px 12px rgba(15,23,42,.05);}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,Segoe UI,Roboto,sans-serif;}
  a{color:var(--primary-d);}
  .topbar{background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:10;}
  .topbar-in{max-width:1000px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;gap:16px;}
  .brand b{font-size:17px;} .brand span{display:block;font-size:12px;color:var(--muted);}
  .spacer{flex:1;}
  .token input{width:240px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font:inherit;}
  nav.tabs{max-width:1000px;margin:16px auto 0;padding:0 24px;display:flex;gap:8px;}
  nav.tabs button{background:transparent;border:1px solid transparent;color:var(--muted);padding:8px 14px;border-radius:8px 8px 0 0;font:inherit;font-weight:600;cursor:pointer;}
  nav.tabs button.active{color:var(--ink);background:var(--surface);border-color:var(--border);border-bottom-color:var(--surface);}
  main{max-width:1000px;margin:0 auto;padding:0 24px 48px;}
  .panel{background:var(--surface);border:1px solid var(--border);border-radius:0 12px 12px 12px;box-shadow:var(--shadow);padding:22px;}
  .tab{display:none;} .tab.active{display:block;}
  h2{font-size:14px;margin:0 0 14px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);}
  .tile{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:18px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  label.field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);font-weight:600;margin-bottom:10px;}
  label.field input,label.field select,textarea{background:#fff;color:var(--ink);border:1px solid var(--border);border-radius:8px;padding:9px 10px;font:inherit;font-weight:400;}
  textarea{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;min-height:120px;}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;}
  .btn{border:1px solid var(--border);background:#fff;color:var(--ink);border-radius:8px;padding:9px 16px;font:inherit;font-weight:600;cursor:pointer;}
  .btn:hover{background:var(--surface2);}
  .btn-primary{background:var(--primary);border-color:var(--primary);color:#fff;} .btn-primary:hover{background:var(--primary-d);}
  .pill{font-size:11px;font-weight:700;letter-spacing:.4px;padding:2px 9px;border-radius:999px;}
  .pill-recommend{background:#ccfbf1;color:#0f766e;} .pill-block{background:#fee2e2;color:#991b1b;} .pill-warn{background:#fef3c7;color:#92400e;}
  .verdict{background:#fff;border:1px solid var(--border);border-left-width:5px;border-radius:10px;padding:16px;margin-top:14px;box-shadow:var(--shadow);}
  .verdict.d-recommend{border-left-color:var(--primary);} .verdict.d-block{border-left-color:#dc2626;} .verdict.d-other{border-left-color:#d97706;}
  .vhead{display:flex;align-items:center;gap:10px;margin-bottom:8px;} .vhead h3{font-size:15px;margin:0;}
  .kv{font-size:13px;margin:6px 0;} .kv b{color:var(--muted);font-weight:600;}
  .chip{display:inline-block;background:var(--surface2);border:1px solid var(--border);border-radius:999px;padding:2px 9px;font-size:12px;margin:2px 4px 2px 0;}
  pre.json{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;overflow:auto;font-size:12px;max-height:320px;}
  .result{font-size:13px;margin-left:6px;} .result.err{color:#b91c1c;} .result.ok{color:#15803d;}
  .note{color:var(--muted);font-size:12px;margin-top:8px;}
  table.modes{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:8px;}
  table.modes th,table.modes td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);}
  table.modes th{color:var(--muted);font-weight:600;}
  footer{max-width:1000px;margin:0 auto;padding:18px 24px;color:var(--muted);font-size:12px;}
</style>
</head>
<body>
<div class="topbar"><div class="topbar-in">
  <div class="brand"><b>ANUClaw E-LAB — Engine Console</b><span>Tiered clinical engine API · reference consumer</span></div>
  <div class="spacer"></div>
  <label class="token" style="margin:0;">API key (X-API-Key) for RUO tier
    <input id="apikey" type="password" placeholder="amgi_live_… (optional in demo)">
  </label>
</div></div>

<nav class="tabs">
  <button data-tab="clinical" class="active">Drug Combination (Clinical)</button>
  <button data-tab="ruo">Engines (RUO)</button>
</nav>

<main>
  <section id="tab-clinical" class="tab active"><div class="panel">
    <div class="tile">
      <h2>New oncology combination evaluation</h2>
      <div class="grid">
        <label class="field">Tumour type
          <select id="c-tumor"><option value="breast">breast</option><option value="colorectal">colorectal</option><option value="other">other</option></select></label>
        <label class="field">Stage <input id="c-stage" value="II"></label>
        <label class="field">Biomarker <input id="c-biomarker" value="HER2+"></label>
        <label class="field">Line of therapy <input id="c-line" type="number" value="1"></label>
      </div>
      <label class="field">Candidate regimen (comma) <input id="c-regimen" value="trastuzumab, pertuzumab, docetaxel"></label>
      <div class="grid">
        <label class="field">LVEF (%) <input id="c-lvef" type="number" value="60"></label>
        <label class="field">Allergies (comma) <input id="c-allergy" placeholder="blank = none known"></label>
      </div>
      <label class="field">Current medications (comma) <input id="c-meds" placeholder="blank = none known"></label>
      <div class="row">
        <button class="btn btn-primary" id="c-run" type="button">Evaluate</button>
        <button class="btn" id="c-ex-block" type="button">Load low-LVEF (block) example</button>
        <span class="result" id="c-status"></span>
      </div>
      <div class="note">Demo endpoint (seed/illustrative content, stub tenant — not for clinical use). Production: POST /v1/clinical/drug-combination with a clinical-scoped token + BAA.</div>
    </div>
    <div id="c-results"></div>
  </div></section>

  <section id="tab-ruo" class="tab"><div class="panel">
    <div class="tile">
      <h2>Dock a molecule (real AutoDock Vina)</h2>
      <div class="grid">
        <label class="field">Ligand SMILES <input id="d-ligand" value="CC(=O)Oc1ccccc1C(=O)O"></label>
        <label class="field">Receptor SMILES (demo) <input id="d-receptor" value="CN1C=NC2=C1C(=O)N(C(=O)N2C)C"></label>
      </div>
      <div class="row"><button class="btn btn-primary" id="d-run" type="button">Dock</button><span class="result" id="d-status"></span></div>
      <div id="d-results"></div>
      <div class="note">Real AutoDock Vina in the anuclaw-vina container — Open Babel prepares PDBQT from SMILES. Demo molecules (aspirin → caffeine): a genuine engine run, not a biological target. Needs Docker running.</div>
    </div>
    <div class="tile">
      <h2>Run an RUO engine</h2>
      <label class="field">Engine id <input id="r-engine" value="docking-vina"></label>
      <label class="field">Input (JSON)
        <textarea id="r-input">{
  "receptor_pdbqt": "…prepared PDBQT…",
  "ligand_pdbqt": "…prepared PDBQT…",
  "box": { "center_x": 0, "center_y": 0, "center_z": 0, "size_x": 25, "size_y": 25, "size_z": 25 },
  "seed": 42
}</textarea></label>
      <div class="row">
        <button class="btn btn-primary" id="r-run" type="button">Run (RUO)</button>
        <span class="result" id="r-status"></span>
      </div>
      <div class="note">RUO tier — non-diagnostic. Requires an API key (X-API-Key above). Patient-identifiable / genomic input is rejected (use the Clinical tier under a BAA). Docking needs prepared PDBQT (e.g. via Open Babel).</div>
    </div>
    <pre class="json" id="r-results" style="display:none;"></pre>
  </div></section>
</main>

<footer>Engines inform; deterministic rules + a clinician decide; every evaluation is audited. Clinical content is seed/unvalidated pending SME sign-off.</footer>

<script>
(function(){
  function $(s){return document.querySelector(s);}
  function all(s){return Array.prototype.slice.call(document.querySelectorAll(s));}
  function val(s){var e=$(s);return e?e.value.trim():'';}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function csv(s){return (s||'').split(',').map(function(x){return x.trim();}).filter(Boolean);}
  function knownList(items){return items.length?{status:'provided',items:items}:{status:'confirmed_none',items:[]};}

  all('nav.tabs button').forEach(function(b){
    b.addEventListener('click',function(){
      all('nav.tabs button').forEach(function(x){x.classList.remove('active');});
      all('.tab').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active'); $('#tab-'+b.getAttribute('data-tab')).classList.add('active');
    });
  });

  function pill(decision){
    if(decision==='recommend')return '<span class="pill pill-recommend">RECOMMEND</span>';
    if(decision==='block')return '<span class="pill pill-block">BLOCK</span>';
    return '<span class="pill pill-warn">'+esc(String(decision).toUpperCase())+'</span>';
  }
  function dcls(decision){return decision==='recommend'?'d-recommend':decision==='block'?'d-block':'d-other';}
  function renderVerdict(v){
    var rec = v.recommendation ? ('<div class="kv"><b>Recommendation:</b> '+esc(v.recommendation.recommendation)+' <em>('+esc(v.recommendation.strength)+')</em></div>') : '';
    var cites = (v.citations||[]).map(function(c){return '<span class="chip">'+esc(c.source)+(c.section?' · '+esc(c.section):'')+'</span>';}).join('');
    var blocks = (v.blocks||[]).map(function(b){return '<div class="kv" style="color:#991b1b;">⛔ '+esc(b.message)+'</div>';}).join('');
    var supp = (v.supporting_evidence||[]).map(function(s){return '<span class="chip">'+esc(s.kind)+(s.confidence!=null?' '+s.confidence:'')+' · '+esc(s.engine_id)+'</span>';}).join('');
    return '<div class="verdict '+dcls(v.decision)+'">'
      +'<div class="vhead">'+pill(v.decision)+'<h3>'+esc(v.domain||'')+' · '+esc(v.reason_code||'')+'</h3></div>'
      +rec
      +(cites?'<div class="kv"><b>Evidence:</b> '+cites+'</div>':'')
      +(blocks||'')
      +(supp?'<div class="kv"><b>Supporting (non-deciding):</b> '+supp+'</div>':'')
      +'<div class="kv"><b>Confidence:</b> '+esc(v.confidence)+' · <b>verdict</b> '+esc(String(v.verdict_hash).slice(0,16))+'…</div>'
      +'</div>';
  }
  function buildClinical(){
    return { query:{ tumor_type:val('#c-tumor'), stage:val('#c-stage'), biomarker:val('#c-biomarker'), line:parseInt(val('#c-line')||'1',10), candidate_regimen:csv(val('#c-regimen')) },
      context:{ organ_function:{ lvef: val('#c-lvef')!==''?parseFloat(val('#c-lvef')):undefined }, allergies:knownList(csv(val('#c-allergy'))), current_medications:knownList(csv(val('#c-meds'))), conditions:{status:'confirmed_none',items:[]} } };
  }
  function runClinical(){
    var st=$('#c-status'); st.textContent='Evaluating…'; st.className='result';
    fetch('/v1/elab/demo/clinical',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(buildClinical())})
      .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
      .then(function(res){ if(!res.ok)throw new Error(res.d.error||'failed');
        $('#c-results').innerHTML=renderVerdict(res.d.verdict); st.textContent='decision: '+res.d.verdict.decision; st.className='result ok'; })
      .catch(function(e){ st.textContent=e.message; st.className='result err'; });
  }
  $('#c-run').addEventListener('click',runClinical);
  $('#c-ex-block').addEventListener('click',function(){ $('#c-lvef').value='40'; runClinical(); });

  function runRuo(){
    var st=$('#r-status'); st.textContent='Running…'; st.className='result';
    var headers={'content-type':'application/json'}; var key=val('#apikey'); if(key)headers['X-API-Key']=key;
    var input; try{ input=JSON.parse(val('#r-input')); }catch(e){ st.textContent='input is not valid JSON'; st.className='result err'; return; }
    fetch('/v1/ruo/'+encodeURIComponent(val('#r-engine')),{method:'POST',headers:headers,body:JSON.stringify({input:input})})
      .then(function(r){return r.json().then(function(d){return {status:r.status,d:d};});})
      .then(function(res){ var p=$('#r-results'); p.style.display='block'; p.textContent='HTTP '+res.status+'\\n'+JSON.stringify(res.d,null,2);
        st.textContent='HTTP '+res.status; st.className='result '+(res.status<300?'ok':'err'); })
      .catch(function(e){ st.textContent=e.message; st.className='result err'; });
  }
  $('#r-run').addEventListener('click',runRuo);

  function renderDock(result){
    var o=result.output||{};
    var rows=(o.modes||[]).map(function(m){return '<tr><td>'+m.mode+'</td><td>'+m.affinity_kcal_mol+'</td><td>'+m.rmsd_lb+'</td><td>'+m.rmsd_ub+'</td></tr>';}).join('');
    return '<div class="verdict d-recommend"><div class="vhead"><span class="pill pill-recommend">VINA</span><h3>best affinity '+esc(o.best_affinity_kcal_mol)+' kcal/mol</h3></div>'
      +'<table class="modes"><thead><tr><th>mode</th><th>affinity (kcal/mol)</th><th>rmsd l.b.</th><th>rmsd u.b.</th></tr></thead><tbody>'+rows+'</tbody></table>'
      +'<div class="kv"><b>engine</b> '+esc(result.engine_id)+'@'+esc(result.engine_version)+' · seed '+esc(result.seed)+' · '+esc(result.reproducibility_class)+'</div></div>';
  }
  function runDock(){
    var st=$('#d-status'); st.textContent='Docking (real Vina)…'; st.className='result';
    fetch('/v1/elab/demo/dock',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ligand_smiles:val('#d-ligand'),receptor_smiles:val('#d-receptor')})})
      .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d};});})
      .then(function(res){ if(!res.ok)throw new Error(res.d.detail||res.d.error||'failed'); $('#d-results').innerHTML=renderDock(res.d.result); st.textContent='done'; st.className='result ok'; })
      .catch(function(e){ st.textContent=e.message; st.className='result err'; });
  }
  $('#d-run').addEventListener('click',runDock);
})();
</script>
</body>
</html>`;
}
