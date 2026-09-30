/** Live smoke: neurology clinical domain via the dashboard. Needs :3722 up. */
import { totp } from '../src/dashboard/server/totp';

const BASE = 'http://127.0.0.1:3722';
const cookies: Record<string, string> = {};
const ch = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
function store(r: Response) { for (const c of (r.headers as any).getSetCookie?.() ?? []) { const kv = c.split(';')[0]; const i = kv.indexOf('='); cookies[kv.slice(0, i)] = kv.slice(i + 1); } }
async function jp(p: string, b: unknown) { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ch() }, body: JSON.stringify(b) }); store(r); return { status: r.status, body: await r.json().catch(() => ({})) as any }; }
async function jg(p: string) { const r = await fetch(BASE + p, { headers: { cookie: ch() } }); store(r); return { status: r.status, body: await r.json().catch(() => ({})) as any }; }

const list = (status = 'confirmed_none') => ({ status, items: [] as unknown[] });
const neuro = (regimen: string[], factors: Record<string, string>, organ: Record<string, number> = {}) => ({
  domain: 'neurology-combination',
  query: { indication: regimen.includes('valproate') ? 'generalized tonic-clonic seizures' : 'focal-onset seizures', line: 1, candidate_regimen: regimen },
  context: { factors, organ_function: organ, allergies: list(), current_medications: list(), conditions: list() },
});

(async () => {
  await jp('/auth/login', { email: 'admin@amgi.io', password: 'admin123' });
  const setup = await jp('/api/elab-engine/mfa/setup', {});
  await jp('/api/elab-engine/mfa/verify', { code: totp(setup.body.secret) });

  console.log('domains:', JSON.stringify((await jg('/api/elab-engine/clinical/domains')).body.domains));

  const rec = await jp('/api/elab-engine/clinical/drug-combination', neuro(['lamotrigine'], {}));
  console.log('neuro lamotrigine        :', rec.status, '→', rec.body.verdict?.decision, rec.body.verdict?.reason_code);

  const blk = await jp('/api/elab-engine/clinical/drug-combination', neuro(['valproate'], { pregnancy_status: 'childbearing_potential' }));
  console.log('neuro valproate+preg     :', blk.status, '→', blk.body.verdict?.decision, '| blocks', blk.body.verdict?.blocks?.length);

  const ca = await jp('/api/elab-engine/clinical/drug-combination', neuro(['valproate'], {}));
  console.log('neuro valproate (no preg):', ca.status, '→', ca.body.verdict?.decision, ca.body.verdict?.reason_code);

  const warn = await jp('/api/elab-engine/clinical/drug-combination', neuro(['levetiracetam'], {}, { renal_egfr: 20 }));
  console.log('neuro levetiracetam eGFR20:', warn.status, '→', warn.body.verdict?.decision, '| warnings', warn.body.verdict?.warnings?.length);

  process.exit(0);
})().catch((e) => { console.error('smoke error:', e); process.exit(1); });
