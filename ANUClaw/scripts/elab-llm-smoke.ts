/** Live smoke for the Wave-2 assistive clinician tools (needs LLM provider + dashboard on :3722). */
import { totp } from '../src/dashboard/server/totp';

const BASE = 'http://127.0.0.1:3722';
const cookies: Record<string, string> = {};
const ch = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
function store(r: Response) { for (const c of (r.headers as any).getSetCookie?.() ?? []) { const kv = c.split(';')[0]; const i = kv.indexOf('='); cookies[kv.slice(0, i)] = kv.slice(i + 1); } }
async function jp(p: string, b: unknown) { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ch() }, body: JSON.stringify(b) }); store(r); return { status: r.status, body: await r.json().catch(() => ({})) as any }; }

(async () => {
  await jp('/auth/login', { email: 'admin@amgi.io', password: 'admin123' });
  const setup = await jp('/api/elab-engine/mfa/setup', {});
  await jp('/api/elab-engine/mfa/verify', { code: totp(setup.body.secret) });
  console.log('unlocked.\n');

  const note = 'Pt is a 58M with HTN on lisinopril 10mg daily. Allergic to penicillin (rash). BP 168/98, HR 92. Troponin 0.9 ng/mL (elevated). Reports crushing chest pain x2h.';
  const nlp = await jp('/api/elab-engine/nlp/extract', { text: note });
  console.log('NLP extract:', nlp.status);
  console.log('  meds:', JSON.stringify(nlp.body.result?.medications));
  console.log('  allergies:', JSON.stringify(nlp.body.result?.allergies));
  console.log('  red_flags:', JSON.stringify(nlp.body.result?.red_flags));
  console.log('  envelope:', nlp.body.assistive, nlp.body.not_diagnostic, '| model', nlp.body.provenance?.model, '\n');

  const so = await jp('/api/elab-engine/second-opinion', {
    case_summary: 'HER2+ stage II breast cancer, LVEF 40%.',
    proposed_plan: 'trastuzumab + pertuzumab + docetaxel',
    engine_verdict: { decision: 'block', reason_code: 'absolute_contraindication', blocks: [{ message: 'trastuzumab contraindicated: LVEF 40 below minimum 50' }] },
  });
  console.log('Second opinion:', so.status);
  console.log('  concordance:', so.body.result?.concordance_with_engine, '| defers_to_block:', so.body.result?.defers_to_block);
  console.log('  summary:', String(so.body.result?.summary).slice(0, 160));

  process.exit(0);
})().catch((e) => { console.error('smoke error:', e); process.exit(1); });
