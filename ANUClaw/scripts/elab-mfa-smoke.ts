/**
 * E2E smoke: dashboard login → E-LAB TOTP enrol/verify → gated engine calls.
 * Requires the dashboard running on :3722 (npm run start:dashboard).
 */
import { totp } from '../src/dashboard/server/totp';

const BASE = 'http://127.0.0.1:3722';
const cookies: Record<string, string> = {};
const cookieHeader = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

function store(res: Response) {
  const sc = (res.headers as any).getSetCookie?.() ?? [];
  for (const c of sc) {
    const kv = c.split(';')[0];
    const i = kv.indexOf('=');
    cookies[kv.slice(0, i)] = kv.slice(i + 1);
  }
}
async function jpost(path: string, body: unknown, withCookies = true) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(withCookies ? { cookie: cookieHeader() } : {}) },
    body: JSON.stringify(body),
  });
  store(r);
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}
async function jget(path: string) {
  const r = await fetch(BASE + path, { headers: { cookie: cookieHeader() } });
  store(r);
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}

const onc = (lvef: number) => ({
  query: { tumor_type: 'breast', stage: 'II', biomarker: 'HER2+', line: 1, candidate_regimen: ['trastuzumab', 'pertuzumab', 'docetaxel'] },
  context: { organ_function: { lvef }, allergies: { status: 'confirmed_none', items: [] }, current_medications: { status: 'confirmed_none', items: [] }, conditions: { status: 'confirmed_none', items: [] } },
});

(async () => {
  const login = await jpost('/auth/login', { email: 'admin@amgi.io', password: 'admin123' });
  console.log('1. login                :', login.status);

  // Gated route BEFORE 2FA must be blocked (403 mfa_required).
  const locked = await jpost('/api/elab-engine/clinical/drug-combination', onc(60));
  console.log('2. clinical w/o 2FA     :', locked.status, locked.body.code ?? '');

  console.log('3. mfa status (pre)     :', JSON.stringify((await jget('/api/elab-engine/mfa/status')).body));

  const setup = await jpost('/api/elab-engine/mfa/setup', {});
  console.log('4. mfa setup            :', setup.status, 'secret', String(setup.body.secret).slice(0, 8) + '…');

  const code = totp(setup.body.secret);
  const verify = await jpost('/api/elab-engine/mfa/verify', { code });
  console.log('5. mfa verify           :', verify.status, JSON.stringify(verify.body));

  console.log('6. mfa status (post)    :', JSON.stringify((await jget('/api/elab-engine/mfa/status')).body));

  const rec = await jpost('/api/elab-engine/clinical/drug-combination', onc(60));
  console.log('7. clinical LVEF 60     :', rec.status, '→', rec.body.verdict?.decision, rec.body.verdict?.reason_code);

  const blk = await jpost('/api/elab-engine/clinical/drug-combination', onc(40));
  console.log('8. clinical LVEF 40     :', blk.status, '→', blk.body.verdict?.decision, '| blocks:', blk.body.verdict?.blocks?.length);

  const bad = await jpost('/api/elab-engine/mfa/verify', { code: '000000' });
  console.log('9. wrong code rejected  :', bad.status);

  const sim = await jpost('/api/elab-engine/simulate', { route: 'oral', dose_mg: 500, clearance_l_h: 7, volume_l: 50, ka_per_h: 1, interval_h: 12, n_doses: 5 });
  console.log('10. PK/PD simulate      :', sim.status, '→ Cmax', sim.body.result?.cmax_mg_l, 'mg/L, t½', sim.body.result?.half_life_h, 'h, pts', sim.body.result?.series?.length);

  process.exit(0);
})().catch((e) => { console.error('smoke error:', e); process.exit(1); });
