import { Hono } from 'hono';
import type { Env } from './env';

export interface SessionUser {
  id: string;
  username: string;
  designCount: number;
  sessionVersion: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser | undefined } };

export const createApp = () => new Hono<AppEnv>();
