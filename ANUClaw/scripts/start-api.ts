/**
 * Start ONLY the ANUClaw API server (no messaging channels).
 * Requires Postgres (the API migrates on boot). For an infra-free demo of the
 * E-LAB platform, use `npm run elab:demo` instead.
 */
import { startApiServer } from '../src/api/server';

startApiServer();
