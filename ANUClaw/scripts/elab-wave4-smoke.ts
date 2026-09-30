/** Live smoke: Wave-4 RUO engines + BAA/de-id path. Needs dashboard on :3722. */
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

  const props = await jp('/api/elab-engine/properties', { smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' });
  console.log('Properties (aspirin):', props.status, '→', props.body.result?.formula, 'MW', props.body.result?.molecular_weight, '| Ro5 violations', props.body.result?.lipinski?.violations);

  const struct = await jp('/api/elab-engine/structure', { uniprot: 'P69905' });
  console.log('Structure (P69905) :', struct.status, '→', struct.body.result?.entry_id, '|', struct.body.result?.organism, '|', struct.body.code ?? 'ok');

  // BAA/de-id: NLP on text containing PHI. With LLM_BAA_COVERED unset (false),
  // the email/phone must be de-identified before egress and re-identified locally.
  const phiNote = 'Patient: John Smith, email john.smith@mail.com, phone 555-867-5309. On lisinopril 10mg daily.';
  const nlp = await jp('/api/elab-engine/nlp/extract', { text: phiNote });
  console.log('\nNLP + de-id        :', nlp.status);
  console.log('  phi:', JSON.stringify(nlp.body.phi));
  console.log('  meds:', JSON.stringify(nlp.body.result?.medications));
  const txt = JSON.stringify(nlp.body.result ?? {});
  console.log('  re-identified email present in output:', txt.includes('john.smith@mail.com'));

  process.exit(0);
})().catch((e) => { console.error('smoke error:', e); process.exit(1); });
