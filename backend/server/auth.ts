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
  email?: string;
  role: UserRole;
  staffName: string;
  title: string;
  active: boolean;
}

// How a user is stored in the "users" collection (password is always hashed)
interface StoredUser {
  username: string;
  email?: string;
  staffName?: string;
  title?: string;
  passwordHash: string;
  role: UserRole;
  active?: boolean;
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
    (req.method === 'POST' &&
      (req.path === '/auth/login' || req.path === '/public/inquiry')) ||
    // Meta calls the WhatsApp webhook; it proves itself with a signature, not a login
    (req.path === '/webhooks/whatsapp' &&
      (req.method === 'GET' || req.method === 'POST'))
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
  return db
    .collection<StoredUser>('users')
    .findOne({ username }, { projection: { _id: 0 } });
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

async function listAllUsers(): Promise<StoredUser[]> {
  const db = await getAtlasDb();
  if (!db) {
    return Array.from(memoryUsers.values());
  }
  return db
    .collection<StoredUser>('users')
    .find({}, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
}

async function setUserActiveStatus(
  username: string,
  active: boolean
): Promise<boolean> {
  const db = await getAtlasDb();
  if (!db) {
    const existing = memoryUsers.get(username);
    if (!existing) return false;
    memoryUsers.set(username, { ...existing, active });
    return true;
  }
  const res = await db
    .collection<StoredUser>('users')
    .updateOne({ username }, { $set: { active } });
  return res.matchedCount > 0;
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
      active: true,
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

function toAuthUser(user: StoredUser): AuthUser {
  const profile = ROLE_PROFILES[user.role];
  return {
    username: user.username,
    email: user.email,
    role: user.role,
    staffName: user.staffName || profile.staffName,
    title: user.title || profile.title,
    active: user.active !== false,
  };
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const username =
      typeof body.username === 'string'
        ? body.username.trim().toLowerCase().slice(0, 120)
        : '';
    const password =
      typeof body.password === 'string' ? body.password.slice(0, 200) : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    // Block repeated failed attempts for the same IP + username
    const key = `${req.ip}|${username}`;
    const record = failedLogins.get(key);
    if (
      record &&
      record.resetAt > Date.now() &&
      record.count >= MAX_FAILED_LOGINS
    ) {
      res
        .status(429)
        .json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
      return;
    }

    const user = await findUser(username);
    const passwordOk = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_HASH
    );

    if (!user || !passwordOk) {
      const current = record && record.resetAt > Date.now() ? record : null;
      failedLogins.set(key, {
        count: (current?.count ?? 0) + 1,
        resetAt: current?.resetAt ?? Date.now() + LOCKOUT_WINDOW_MS,
      });
      res.status(401).json({ error: 'Incorrect username or password.' });
      return;
    }

    if (user.active === false) {
      res.status(403).json({
        error:
          'This staff account is deactivated. Contact Management / Admin.',
      });
      return;
    }

    failedLogins.delete(key);
    const token = jwt.sign(
      { sub: user.username, role: user.role },
      getJwtSecret(),
      {
        expiresIn: TOKEN_LIFETIME,
      }
    );
    res.json({ token, user: toAuthUser(user) });
  } catch {
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

// Returns the current user (used by the frontend to restore a session on page refresh)
export function meHandler(req: Request, res: Response): void {
  res.json({ user: req.user });
}

// ---------------------------------------------------------------------------
// Staff Account Management (Management / Admin only)
// ---------------------------------------------------------------------------

export async function listUsersHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (req.user?.role !== 'management') {
    res.status(403).json({ error: 'Management / Admin access required.' });
    return;
  }
  try {
    const users = await listAllUsers();
    res.json({ users: users.map(toAuthUser) });
  } catch {
    res.status(500).json({ error: 'Failed to load staff accounts.' });
  }
}

// Names that leads can be assigned to (every ACTIVE staff member).
// Any logged-in role may read this, because Follow-Up Staff and Accountants also assign leads.
// It returns names only: no emails, usernames or roles.
export async function listAssigneesHandler(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    const users = await listAllUsers();
    const names = users
      .filter((u) => u.active !== false)
      .map((u) => toAuthUser(u).staffName)
      .filter(Boolean);
    // Remove duplicates and sort A-Z
    const unique = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
    res.json({ assignees: unique });
  } catch {
    res.status(500).json({ error: 'Failed to load staff list.' });
  }
}

export async function createUserHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (req.user?.role !== 'management') {
    res.status(403).json({
      error: 'Only Management / Admin can create staff login accounts.',
    });
    return;
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const staffName =
      typeof body.staffName === 'string'
        ? body.staffName.trim().slice(0, 100)
        : '';
    const email =
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase().slice(0, 120)
        : '';
    const title =
      typeof body.title === 'string' ? body.title.trim().slice(0, 100) : '';
    const role = body.role as UserRole;
    const password =
      typeof body.password === 'string' ? body.password.slice(0, 200) : '';

    if (staffName.length < 2) {
      res
        .status(400)
        .json({ error: 'Full name is required (min 2 characters).' });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid staff email address is required.' });
      return;
    }
    if (!(role in ROLE_PROFILES)) {
      res.status(400).json({ error: 'Invalid staff role selected.' });
      return;
    }
    if (password.length < 8) {
      res
        .status(400)
        .json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const existing = await findUser(email);
    if (existing) {
      res
        .status(409)
        .json({ error: 'An account with this email already exists.' });
      return;
    }

    const newUser: StoredUser = {
      username: email,
      email,
      staffName,
      title: title || ROLE_PROFILES[role].title,
      role,
      active: true,
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: new Date().toISOString(),
    };

    await saveUser(newUser);
    const updatedUsers = await listAllUsers();
    res.status(201).json({
      user: toAuthUser(newUser),
      users: updatedUsers.map(toAuthUser),
    });
  } catch {
    res.status(500).json({ error: 'Failed to create staff account.' });
  }
}

export async function toggleUserStatusHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (req.user?.role !== 'management') {
    res.status(403).json({ error: 'Management / Admin access required.' });
    return;
  }

  try {
    const targetUsername = decodeURIComponent(req.params.username || '')
      .trim()
      .toLowerCase()
      .slice(0, 120);

    if (!targetUsername) {
      res.status(400).json({ error: 'Invalid staff username.' });
      return;
    }
    if (targetUsername === req.user.username) {
      res.status(400).json({
        error: 'Cannot deactivate your own signed-in account.',
      });
      return;
    }

    const active = Boolean((req.body as { active?: unknown })?.active);
    const updated = await setUserActiveStatus(targetUsername, active);
    if (!updated) {
      res.status(404).json({ error: 'Staff user not found.' });
      return;
    }

    const updatedUsers = await listAllUsers();
    res.json({ users: updatedUsers.map(toAuthUser) });
  } catch {
    res.status(500).json({ error: 'Failed to update staff status.' });
  }
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

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const dbUser = await findUser(String(payload.sub));
    if (!dbUser || dbUser.active === false) {
      res.status(401).json({ error: 'Account inactive or not found.' });
      return;
    }

    req.user = toAuthUser(dbUser);

    // The existing routes read the role from the "x-user-role" header.
    // Overwrite it with the role from the verified token so it can never be faked.
    req.headers['x-user-role'] = dbUser.role;

    // Follow-Up Staff only ever receive lead data in any response
    if (dbUser.role === 'followup') {
      const originalJson = res.json.bind(res);
      res.json = ((body?: unknown) => {
        if (body && typeof body === 'object' && 'state' in body) {
          const payloadBody = body as {
            state: SystemState;
            dbStatus?: Record<string, unknown>;
          };
          const filtered: Record<string, unknown> = {
            ...payloadBody,
            state: filterStateForFollowUp(payloadBody.state),
          };
          // Hide database details (counts, connection errors) from this role
          if (payloadBody.dbStatus) {
            filtered.dbStatus = {
              ...payloadBody.dbStatus,
              errorMessage: undefined,
            };
          }
          return originalJson(filtered);
        }
        return originalJson(body);
      }) as Response['json'];
    }

    next();
  } catch {
    res
      .status(401)
      .json({ error: 'Your session has expired. Please log in again.' });
  }
}