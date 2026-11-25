import type { NextFunction, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getAtlasDb } from './db.ts';
import { ROLE_PROFILES } from '../utils/accounting.ts';
import type { SystemState, UserRole } from '../types/system.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// The logged-in user, attached to every authenticated request as req.user
export interface AuthUser {
  username: string;
  role: UserRole;
  staffName: string;
  title: string;
}

// How a user is stored in the "users" collection (password is always hashed)
interface StoredUser {
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOKEN_LIFETIME = '12h';
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

// One starter account per role. Passwords come from the .env file.
const DEFAULT_ACCOUNTS: {
  username: string;
  role: UserRole;
  passwordEnvKey: string;
}[] = [
  { username: 'management', role: 'management', passwordEnvKey: 'MANAGEMENT_PASSWORD' },
  { username: 'accountant', role: 'accountant', passwordEnvKey: 'ACCOUNTANT_PASSWORD' },
  { username: 'followup', role: 'followup', passwordEnvKey: 'FOLLOWUP_PASSWORD' },
];

// Routes that can be used without a token
function isPublicRoute(req: Request): boolean {
  // req.path is relative to the "/api" mount point
  return (
    req.method === 'POST' &&
    (req.path === '/auth/login' || req.path === '/public/inquiry')
  );
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short (use at least 32 characters) in the backend .env file.'
    );
  }
  return secret;
}

// Call once at startup so the server refuses to run with a weak/missing secret
export function assertAuthConfig(): void {
  getJwtSecret();
}

// ---------------------------------------------------------------------------
// User storage (MongoDB "users" collection, in-memory fallback when no Atlas)
// ---------------------------------------------------------------------------

const memoryUsers = new Map<string, StoredUser>();

async function findUser(username: string): Promise<StoredUser | null> {
  const db = await getAtlasDb();
  if (!db) {
    return memoryUsers.get(username) ?? null;
  }
  return db.collection<StoredUser>('users').findOne({ username }, { projection: { _id: 0 } });
}

async function saveUser(user: StoredUser): Promise<void> {
  const db = await getAtlasDb();
  if (!db) {
    memoryUsers.set(user.username, user);
    return;
  }
  const users = db.collection<StoredUser>('users');
  await users.createIndex({ username: 1 }, { unique: true });
  await users.insertOne({ ...user });
}

// Creates the three starter accounts the first time the server runs.
// Existing accounts are never changed, so editing .env later will not reset passwords.
export async function ensureDefaultUsers(): Promise<void> {
  for (const account of DEFAULT_ACCOUNTS) {
    if (await findUser(account.username)) continue;

    const password = process.env[account.passwordEnvKey]?.trim();
    if (!password || password.length < 8) {
      console.warn(
        `[auth] Skipped "${account.username}": set ${account.passwordEnvKey} (min 8 characters) in .env to create this login.`
      );
      continue;
    }

    await saveUser({
      username: account.username,
      passwordHash: await bcrypt.hash(password, 10),
      role: account.role,
      createdAt: new Date().toISOString(),
    });
    console.log(`[auth] Created login "${account.username}" (${account.role}).`);
  }
}

// ---------------------------------------------------------------------------
// Login (with simple brute-force protection)
// ---------------------------------------------------------------------------

const failedLogins = new Map<string, { count: number; resetAt: number }>();

// Used so a wrong username takes as long to reject as a wrong password
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function toAuthUser(username: string, role: UserRole): AuthUser {
  const profile = ROLE_PROFILES[role];
  return { username, role, staffName: profile.staffName, title: profile.title };
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const username =
      typeof body.username === 'string' ? body.username.trim().toLowerCase().slice(0, 60) : '';
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    // Block repeated failed attempts for the same IP + username
    const key = `${req.ip}|${username}`;
    const record = failedLogins.get(key);
    if (record && record.resetAt > Date.now() && record.count >= MAX_FAILED_LOGINS) {
      res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
      return;
    }

    const user = await findUser(username);
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk) {
      const current = record && record.resetAt > Date.now() ? record : null;
      failedLogins.set(key, {
        count: (current?.count ?? 0) + 1,
        resetAt: current?.resetAt ?? Date.now() + LOCKOUT_WINDOW_MS,
      });
      res.status(401).json({ error: 'Incorrect username or password.' });
      return;
    }

    failedLogins.delete(key);
    const token = jwt.sign({ sub: user.username, role: user.role }, getJwtSecret(), {
      expiresIn: TOKEN_LIFETIME,
    });
    res.json({ token, user: toAuthUser(user.username, user.role) });
  } catch {
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

// Returns the current user (used by the frontend to restore a session on page refresh)
export function meHandler(req: Request, res: Response): void {
  res.json({ user: req.user });
}

// ---------------------------------------------------------------------------
// Authentication middleware (mounted on /api)
// ---------------------------------------------------------------------------

// Follow-Up Staff may only work with donor leads, so everything else is emptied
function filterStateForFollowUp(state: SystemState): SystemState {
  return {
    leads: state.leads,
    transactions: [],
    reconciliations: [],
    assets: [],
    rationStock: [],
    auditTrail: [],
    websiteSyncEvents: [],
  };
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (isPublicRoute(req)) {
    next();
    return;
  }

  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Please log in to continue.' });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    const role = payload.role as UserRole;
    if (!payload.sub || !(role in ROLE_PROFILES)) {
      throw new Error('Invalid token payload');
    }

    req.user = toAuthUser(String(payload.sub), role);

    // The existing routes read the role from the "x-user-role" header.
    // Overwrite it with the role from the verified token so it can never be faked.
    req.headers['x-user-role'] = role;

    // Follow-Up Staff only ever receive lead data in any response
    if (role === 'followup') {
      const originalJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        if (body && typeof body === 'object' && 'state' in body) {
          const payloadBody = body as { state: SystemState; dbStatus?: Record<string, unknown> };
          const filtered: Record<string, unknown> = {
            ...payloadBody,
            state: filterStateForFollowUp(payloadBody.state),
          };
          // Hide database details (counts, connection errors) from this role
          if (payloadBody.dbStatus) {
            filtered.dbStatus = { ...payloadBody.dbStatus, errorMessage: undefined };
          }
          return originalJson(filtered);
        }
        return originalJson(body);
      }) as Response['json'];
    }

    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}