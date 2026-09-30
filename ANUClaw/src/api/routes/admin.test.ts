import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { requireAdmin } from './admin';

function fakeReq(adminKey?: string): Request {
  return { header: (n: string) => (n.toLowerCase() === 'x-admin-key' ? adminKey : undefined) } as unknown as Request;
}
function fakeRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  } as unknown as Response & { statusCode: number; body: unknown };
}
function run(guard: ReturnType<typeof requireAdmin>, req: Request) {
  const res = fakeRes();
  let nexted = false;
  guard(req, res, () => { nexted = true; });
  return { res, nexted };
}

describe('requireAdmin (fail-closed admin gate)', () => {
  it('503s when no admin key is configured (disabled by default)', () => {
    const { res, nexted } = run(requireAdmin(undefined), fakeReq('anything'));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(503);
  });

  it('401s a missing or wrong key', () => {
    expect(run(requireAdmin('secret'), fakeReq(undefined)).res.statusCode).toBe(401);
    expect(run(requireAdmin('secret'), fakeReq('wrong')).res.statusCode).toBe(401);
  });

  it('allows a correct key', () => {
    const { res, nexted } = run(requireAdmin('secret'), fakeReq('secret'));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });
});
