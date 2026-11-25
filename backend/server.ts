import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import type {
  AuditLogEntry,
  DonorLead,
  IncomeFundType,
  LeadSource,
  LedgerName,
  LedgerTransaction,
  PaymentChannel,
  RationStockItem,
  SocietyAsset,
  SystemState,
  WebsiteSyncEvent,
} from './types/system.ts';
import { getStartingState } from './server/startState.ts';
import {
  formatPkr,
  getTodayIsoDate,
  inferDefaultLedgerForFund,
  ROLE_PROFILES,
} from './utils/accounting.ts';
import {
  approveTransactionBackdate,
  getDatabaseStatus,
  insertAsset,
  insertLead,
  insertRationItem,
  insertTransaction,
  insertWebsiteSyncEvent,
  readFullSystemState,
  replaceFullSystemState,
  updateLeadById,
  updateReconciliationRecord,
} from './server/db.ts';
import {
  asCleanString,
  asPositiveNumber,
  hasDangerousMongoKeys,
  resolveRole,
  isAllowedIncomeFund,
  sanitizeReconciliationChannel,
  validateAssetPayload,
  validateLeadPayload,
  validateRationPayload,
  validateReconciliationPayload,
  validateTransactionPayload,
} from './server/validation.ts';
import {
  assertAuthConfig,
  authenticate,
  ensureDefaultUsers,
  loginHandler,
  meHandler,
} from './server/auth.ts';

// Next free number for IDs like LD-1001 / TXN-007. Uses the highest existing number,
// so IDs never repeat even after records are removed or a backup is restored.
function nextSeq(ids: string[], prefix: string, start: number): number {
  let max = start - 1;
  for (const id of ids) {
    if (typeof id === 'string' && id.startsWith(prefix)) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}

// Voucher prefix from today's date, e.g. VCH-2611 for November 2026
function voucherPrefix(): string {
  const iso = new Date().toISOString();
  return `VCH-${iso.slice(2, 4)}${iso.slice(5, 7)}`;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS: only the websites listed in CORS_ORIGINS (comma separated) may call this API.
// Example: CORS_ORIGINS=https://bait-tul-noor.vercel.app,https://www.baitulnoor.org
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn('[cors] CORS_ORIGINS is empty: browsers on other domains will be blocked.');
}

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header = server-to-server call or health check: allow
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role'],
    maxAge: 86400,
  })
);

// The public website endpoint only ever needs a tiny body
app.use('/api/public', express.json({ limit: '10kb' }));

app.use(express.json({ limit: '5mb' }));

// Global NoSQL operator injection guard on request bodies
app.use('/api', (req, res, next) => {
  if (req.body && hasDangerousMongoKeys(req.body)) {
    res.status(400).json({ error: 'Invalid characters in payload keys.' });
    return;
  }
  next();
});

// Behind Render's proxy, trust the forwarded IP (used by login rate limiting)
app.set('trust proxy', 1);

// Every /api route needs a valid login token, except login and the public website inquiry
app.use('/api', authenticate);
app.post('/api/auth/login', loginHandler);
app.get('/api/auth/me', meHandler);

// ---------------------------------------------------------------------------
// Public website inquiry (donation / contact / WhatsApp click-to-chat forms)
// - needs no login, so it is deliberately limited:
//   * it can ONLY create a "New Inquiry" lead, never a voucher or any money entry
//   * it never returns CRM data, only { ok: true }
//   * rate limited per IP and overall, with a hidden "website" field to catch bots
// ---------------------------------------------------------------------------
const PUBLIC_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_MAX_PER_IP = 5;
const PUBLIC_MAX_PER_HOUR = 200;
const publicHitsByIp = new Map<string, number[]>();
let publicHitsAll: number[] = [];

function takePublicSlot(ip: string): boolean {
  const now = Date.now();
  publicHitsAll = publicHitsAll.filter((t) => now - t < 60 * 60 * 1000);
  if (publicHitsAll.length >= PUBLIC_MAX_PER_HOUR) return false;

  const recent = (publicHitsByIp.get(ip) || []).filter(
    (t) => now - t < PUBLIC_WINDOW_MS
  );
  if (recent.length >= PUBLIC_MAX_PER_IP) {
    publicHitsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  publicHitsByIp.set(ip, recent);
  publicHitsAll.push(now);

  if (publicHitsByIp.size > 5000) {
    for (const [key, hits] of publicHitsByIp) {
      if (!hits.some((t) => now - t < PUBLIC_WINDOW_MS)) publicHitsByIp.delete(key);
    }
  }
  return true;
}

app.post('/api/public/inquiry', async (req, res) => {
  try {
    const body = req.body || {};

    // Hidden trap field: real people never fill it. Pretend success so bots move on.
    if (asCleanString(body.website, 200)) {
      res.status(200).json({ ok: true });
      return;
    }

    if (!takePublicSlot(req.ip || 'unknown')) {
      res
        .status(429)
        .json({ error: 'Too many submissions. Please try again in a few minutes.' });
      return;
    }

    const donorName = asCleanString(body.donorName ?? body.name, 120);
    const phone = asCleanString(body.phone, 40);
    const digits = phone.replace(/\D/g, '');
    if (donorName.length < 2) {
      res.status(400).json({ error: 'Please enter your name.' });
      return;
    }
    if (!/^[+\d\s()-]+$/.test(phone) || digits.length < 10 || digits.length > 15) {
      res.status(400).json({ error: 'Please enter a valid phone / WhatsApp number.' });
      return;
    }

    const source: LeadSource =
      body.submissionType === 'donation'
        ? 'Website Donation Form'
        : body.submissionType === 'whatsapp'
          ? 'Direct WhatsApp'
          : 'Website Contact Form';

    const pledged = Math.min(asPositiveNumber(body.amountPkr, 0), 100_000_000);
    const fundType: IncomeFundType = isAllowedIncomeFund(body.fundType)
      ? body.fundType
      : 'Atiyaat (Donations)';
    const message = asCleanString(body.notes ?? body.message, 500);

    const state = await readFullSystemState();
    const nowIso = new Date().toISOString();
    const todayIso = getTodayIsoDate();
    const nextLeadId = `LD-${nextSeq(state.leads.map((l) => l.id), 'LD-', 1001)}`;

    const newLead: DonorLead = {
      id: nextLeadId,
      donorName,
      phone,
      source,
      inquiryDate: todayIso,
      stage: 'New Inquiry',
      fundInterest: fundType,
      pledgedAmountPkr: pledged,
      receivedAmountPkr: 0,
      assignedTo: ROLE_PROFILES.followup.staffName,
      followUpDate: todayIso,
      followUpNote:
        pledged > 0
          ? `Website pledge of ${formatPkr(pledged)}. Payment NOT verified: confirm it in the bank/wallet statement before creating a voucher.`
          : 'Incoming website inquiry; awaiting staff follow-up.',
      notes:
        (pledged > 0 ? '[Payment unverified - pledge only] ' : '') +
        (message || `Incoming ${source} submission.`),
      createdAt: nowIso,
    };

    const syncEvent: WebsiteSyncEvent = {
      id: `SYN-${nextSeq(state.websiteSyncEvents.map((e) => e.id), 'SYN-', 1)}`,
      timestamp: nowIso,
      source,
      donorName,
      phone,
      amountPkr: pledged > 0 ? pledged : undefined,
      fundType,
      leadId: nextLeadId,
      status: 'Synced to CRM',
    };

    await Promise.all([insertLead(newLead), insertWebsiteSyncEvent(syncEvent)]);
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Could not send your request. Please try again.' });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    const status = await getDatabaseStatus();
    res.json(status);
  } catch {
    res.status(500).json({ error: 'Unable to query database health.' });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    const [state, dbStatus] = await Promise.all([
      readFullSystemState(),
      getDatabaseStatus(),
    ]);
    res.json({ state, dbStatus });
  } catch {
    res.status(500).json({ error: 'Failed to load system state.' });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const parsed = validateLeadPayload(req.body || {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    // Follow-Up Staff can log inquiries but cannot record donations
    if (
      resolveRole(req.headers['x-user-role']) === 'followup' &&
      (parsed.data.stage === 'Converted / Donated' || parsed.data.receivedAmountPkr > 0)
    ) {
      res.status(403).json({
        error: 'Only Management or Accountant can record received donations.',
      });
      return;
    }
    const state = await readFullSystemState();
    const nextId = `LD-${nextSeq(state.leads.map((l) => l.id), 'LD-', 1001)}`;
    const newLead: DonorLead = {
      ...parsed.data,
      id: nextId,
      createdAt: new Date().toISOString(),
    };
    await insertLead(newLead);
    const updatedState = await readFullSystemState();
    res.status(201).json({ lead: newLead, state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to create donor inquiry.' });
  }
});

app.put('/api/leads/:id', async (req, res) => {
  try {
    const leadId = asCleanString(req.params.id, 40);
    if (!leadId) {
      res.status(400).json({ error: 'Invalid lead ID.' });
      return;
    }
    const parsed = validateLeadPayload(req.body || {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const state = await readFullSystemState();
    const existing = state.leads.find((l) => l.id === leadId);
    if (!existing) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }
    const updatedLead: DonorLead = {
      ...parsed.data,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    // Follow-Up Staff update follow-ups and notes only; money fields stay as they are
    if (resolveRole(req.headers['x-user-role']) === 'followup') {
      if (
        updatedLead.stage === 'Converted / Donated' &&
        existing.stage !== 'Converted / Donated'
      ) {
        res.status(403).json({
          error: 'Only Management or Accountant can mark a lead as donated.',
        });
        return;
      }
      updatedLead.receivedAmountPkr = existing.receivedAmountPkr;
      updatedLead.linkedVoucherId = existing.linkedVoucherId;
    }
    await updateLeadById(leadId, updatedLead);
    const updatedState = await readFullSystemState();
    res.json({ lead: updatedLead, state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to update donor lead.' });
  }
});

app.post('/api/leads/:id/convert', async (req, res) => {
  try {
    const role = resolveRole(req.headers['x-user-role']);
    if (role !== 'management' && role !== 'accountant') {
      res.status(403).json({
        error: 'Posting linked Credit vouchers requires Accountant or Management role.',
      });
      return;
    }

    const leadId = asCleanString(req.params.id, 40);
    const state = await readFullSystemState();
    const existingLead = state.leads.find((l) => l.id === leadId);
    if (!existingLead) {
      res.status(404).json({ error: 'Lead not found.' });
      return;
    }

    const body = req.body || {};
    const txnValidation = validateTransactionPayload({
      transactionDate: body.transactionDate,
      type: 'Credit',
      ledger: body.ledger,
      category: body.fundType,
      channel: body.channel,
      amountPkr: body.receivedAmountPkr,
      donorOrPayee: existingLead.donorName,
      linkedLeadId: existingLead.id,
      notes: body.notes || `Converted from lead ${existingLead.id}`,
    });

    if (!txnValidation.ok) {
      res.status(400).json({ error: txnValidation.error });
      return;
    }

    const nowIso = new Date().toISOString();
    const todayIso = getTodayIsoDate();
    const isBackdated = txnValidation.data.transactionDate < todayIso;
    const autoApproved = !isBackdated || role === 'management';
    const profile = ROLE_PROFILES[role];

    const nextTxnNum = nextSeq(state.transactions.map((t) => t.id), 'TXN-', 1);
    const nextTxnId = `TXN-${String(nextTxnNum).padStart(3, '0')}`;
    const voucherNo = `${voucherPrefix()}-${String(nextTxnNum).padStart(3, '0')}`;

    const newTxn: LedgerTransaction = {
      id: nextTxnId,
      voucherNo,
      transactionDate: txnValidation.data.transactionDate,
      systemEntryTimestamp: nowIso,
      isBackdated,
      backdateApproved: autoApproved,
      backdateApprovedBy:
        isBackdated && autoApproved ? profile.staffName : undefined,
      type: 'Credit',
      ledger: txnValidation.data.ledger,
      category: txnValidation.data.category,
      channel: txnValidation.data.channel,
      amountPkr: txnValidation.data.amountPkr,
      donorOrPayee: existingLead.donorName,
      linkedLeadId: existingLead.id,
      notes: txnValidation.data.notes,
      enteredByName: profile.staffName,
      enteredByRole: role,
    };

    const updatedLead: DonorLead = {
      ...existingLead,
      stage: 'Converted / Donated',
      fundInterest: txnValidation.data.category as IncomeFundType,
      receivedAmountPkr: txnValidation.data.amountPkr,
      linkedVoucherId: nextTxnId,
      followUpNote: `Converted and linked to ${voucherNo}.`,
    };

    const audit: AuditLogEntry = {
      id: `AUD-${nextSeq(state.auditTrail.map((a) => a.id), 'AUD-', 1)}`,
      timestamp: nowIso,
      actorName: profile.staffName,
      actorRole: role,
      action: 'Lead Converted to Credit Voucher',
      targetRef: `${existingLead.id} / ${voucherNo}`,
      details: `${existingLead.donorName} donation of ${formatPkr(txnValidation.data.amountPkr)} posted to ${txnValidation.data.ledger} (${txnValidation.data.channel}).`,
    };

    await Promise.all([
      insertTransaction(newTxn, audit),
      updateLeadById(existingLead.id, updatedLead),
    ]);

    const updatedState = await readFullSystemState();
    res.status(201).json({ state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to convert donor lead.' });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const role = resolveRole(req.headers['x-user-role']);
    if (role !== 'management' && role !== 'accountant') {
      res.status(403).json({
        error: 'Recording Credit/Debit vouchers requires Accountant or Management role.',
      });
      return;
    }

    const parsed = validateTransactionPayload(req.body || {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const state = await readFullSystemState();
    const nowIso = new Date().toISOString();
    const todayIso = getTodayIsoDate();
    const isBackdated = parsed.data.transactionDate < todayIso;
    const autoApproved = !isBackdated || role === 'management';
    const profile = ROLE_PROFILES[role];

    const nextNum = nextSeq(state.transactions.map((t) => t.id), 'TXN-', 1);
    const nextId = `TXN-${String(nextNum).padStart(3, '0')}`;
    const voucherNo = `${voucherPrefix()}-${String(nextNum).padStart(3, '0')}`;

    const newTxn: LedgerTransaction = {
      id: nextId,
      voucherNo,
      transactionDate: parsed.data.transactionDate,
      systemEntryTimestamp: nowIso,
      isBackdated,
      backdateApproved: autoApproved,
      backdateApprovedBy:
        isBackdated && autoApproved ? profile.staffName : undefined,
      type: parsed.data.type,
      ledger: parsed.data.ledger,
      category: parsed.data.category,
      channel: parsed.data.channel,
      amountPkr: parsed.data.amountPkr,
      donorOrPayee: parsed.data.donorOrPayee,
      linkedLeadId: parsed.data.linkedLeadId,
      notes: parsed.data.notes,
      enteredByName: profile.staffName,
      enteredByRole: role,
    };

    const audit: AuditLogEntry | undefined = isBackdated
      ? {
          id: `AUD-${nextSeq(state.auditTrail.map((a) => a.id), 'AUD-', 1)}`,
          timestamp: nowIso,
          actorName: profile.staffName,
          actorRole: role,
          action: autoApproved
            ? 'Backdated Voucher Recorded & Approved'
            : 'Backdated Voucher Pending Approval',
          targetRef: voucherNo,
          details: `Txn Date ${parsed.data.transactionDate} posted for ${formatPkr(parsed.data.amountPkr)} (${parsed.data.ledger}). Running balances recalculated.`,
        }
      : undefined;

    await insertTransaction(newTxn, audit);
    const updatedState = await readFullSystemState();
    res.status(201).json({ transaction: newTxn, state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to post voucher.' });
  }
});

app.patch('/api/transactions/:id/approve-backdate', async (req, res) => {
  try {
    const role = resolveRole(req.headers['x-user-role']);
    if (role !== 'management') {
      res.status(403).json({
        error: 'Only Management / Admin can approve backdated vouchers.',
      });
      return;
    }

    const txnId = asCleanString(req.params.id, 40);
    const state = await readFullSystemState();
    const target = state.transactions.find((t) => t.id === txnId);
    if (!target) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }

    const profile = ROLE_PROFILES[role];
    const audit: AuditLogEntry = {
      id: `AUD-${nextSeq(state.auditTrail.map((a) => a.id), 'AUD-', 1)}`,
      timestamp: new Date().toISOString(),
      actorName: profile.staffName,
      actorRole: role,
      action: 'Backdate Approved',
      targetRef: target.voucherNo,
      details: `Approved backdated entry (${target.transactionDate}) for ${formatPkr(target.amountPkr)}.`,
    };

    await approveTransactionBackdate(txnId, profile.staffName, audit);
    const updatedState = await readFullSystemState();
    res.json({ state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to approve backdated voucher.' });
  }
});

app.put('/api/reconciliations/:channel', async (req, res) => {
  try {
    const role = resolveRole(req.headers['x-user-role']);
    if (role !== 'management' && role !== 'accountant') {
      res.status(403).json({
        error: 'Channel reconciliation requires Accountant or Management role.',
      });
      return;
    }

    const decodedChannel = decodeURIComponent(req.params.channel);
    const channel = sanitizeReconciliationChannel(decodedChannel);
    if (!channel) {
      res.status(400).json({ error: 'Invalid payment channel.' });
      return;
    }

    const parsed = validateReconciliationPayload(channel, req.body || {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const profile = ROLE_PROFILES[role];
    const ok = await updateReconciliationRecord(
      channel,
      parsed.statementBalancePkr,
      parsed.notes,
      getTodayIsoDate(),
      profile.staffName
    );
    if (!ok) {
      res.status(404).json({ error: 'Channel record not found.' });
      return;
    }

    const updatedState = await readFullSystemState();
    res.json({ state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to update reconciliation.' });
  }
});

app.post('/api/assets', async (req, res) => {
  try {
    const role = resolveRole(req.headers['x-user-role']);
    if (role !== 'management' && role !== 'accountant') {
      res.status(403).json({
        error: 'Asset registration requires Accountant or Management role.',
      });
      return;
    }

    const parsed = validateAssetPayload(req.body || {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const state = await readFullSystemState();
    const asset: SocietyAsset = {
      ...parsed.data,
      id: `AST-${String(nextSeq(state.assets.map((a) => a.id), 'AST-', 1)).padStart(2, '0')}`,
      assetCode: `BN-AS-${String(nextSeq(state.assets.map((a) => a.id), 'AST-', 1)).padStart(3, '0')}`,
    };
    await insertAsset(asset);
    const updatedState = await readFullSystemState();
    res.status(201).json({ asset, state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to register asset.' });
  }
});

app.post('/api/ration', async (req, res) => {
  try {
    const role = resolveRole(req.headers['x-user-role']);
    if (role !== 'management' && role !== 'accountant') {
      res.status(403).json({
        error: 'Ration inventory logging requires Accountant or Management role.',
      });
      return;
    }

    const parsed = validateRationPayload(req.body || {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const state = await readFullSystemState();
    const item: RationStockItem = {
      ...parsed.data,
      id: `RAT-${String(nextSeq(state.rationStock.map((r) => r.id), 'RAT-', 1)).padStart(2, '0')}`,
    };
    await insertRationItem(item);
    const updatedState = await readFullSystemState();
    res.status(201).json({ item, state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to save ration stock.' });
  }
});

app.post('/api/website-sync', async (req, res) => {
  try {
    const body = req.body || {};
    const submissionType =
      body.submissionType === 'donation' || body.submissionType === 'contact'
        ? body.submissionType
        : 'meta_whatsapp';
    const donorName = asCleanString(body.donorName, 120);
    const phone = asCleanString(body.phone, 40);
    if (!donorName || !phone) {
      res.status(400).json({ error: 'Donor name and phone are required.' });
      return;
    }

    const state = await readFullSystemState();
    const nowIso = new Date().toISOString();
    const todayIso = getTodayIsoDate();
    const nextLeadId = `LD-${nextSeq(state.leads.map((l) => l.id), 'LD-', 1001)}`;
    const source =
      submissionType === 'donation'
        ? 'Website Donation Form'
        : submissionType === 'contact'
          ? 'Website Contact Form'
          : 'Meta Ads (WhatsApp)';

    const amountPkr = asPositiveNumber(body.amountPkr, 0);
    const notes = asCleanString(body.notes, 500);
    const campaignName = asCleanString(body.campaignName, 140) || undefined;
    const fundType = (asCleanString(body.fundType, 100) ||
      'Atiyaat (Donations)') as IncomeFundType;

    if (submissionType === 'donation' && amountPkr > 0 && body.channel) {
      const channel = (sanitizeReconciliationChannel(String(body.channel)) ||
        'JazzCash') as PaymentChannel;
      const nextTxnNum = nextSeq(state.transactions.map((t) => t.id), 'TXN-', 1);
      const nextTxnId = `TXN-${String(nextTxnNum).padStart(3, '0')}`;
      const voucherNo = `${voucherPrefix()}-${String(nextTxnNum).padStart(3, '0')}`;
      const targetLedger: LedgerName = inferDefaultLedgerForFund(fundType);

      const newLead: DonorLead = {
        id: nextLeadId,
        donorName,
        phone,
        source,
        inquiryDate: todayIso,
        stage: 'Converted / Donated',
        fundInterest: fundType,
        pledgedAmountPkr: amountPkr,
        receivedAmountPkr: amountPkr,
        assignedTo: ROLE_PROFILES.followup.staffName,
        followUpDate: todayIso,
        followUpNote: `Auto-synced website payment via ${channel}.`,
        notes: notes || 'Direct website online donation.',
        linkedVoucherId: nextTxnId,
        createdAt: nowIso,
      };

      const newTxn: LedgerTransaction = {
        id: nextTxnId,
        voucherNo,
        transactionDate: todayIso,
        systemEntryTimestamp: nowIso,
        isBackdated: false,
        backdateApproved: true,
        type: 'Credit',
        ledger: targetLedger,
        category: fundType,
        channel,
        amountPkr,
        donorOrPayee: donorName,
        linkedLeadId: nextLeadId,
        notes: notes || 'Direct Website Donation Form sync.',
        enteredByName: 'Website Integration',
        enteredByRole: 'accountant',
      };

      const syncEvent: WebsiteSyncEvent = {
        id: `SYN-${nextSeq(state.websiteSyncEvents.map((e) => e.id), 'SYN-', 1)}`,
        timestamp: nowIso,
        source,
        donorName,
        phone,
        amountPkr,
        fundType,
        leadId: nextLeadId,
        voucherNo,
        status: 'Synced to CRM + Credit Voucher',
      };

      const audit: AuditLogEntry = {
        id: `AUD-${nextSeq(state.auditTrail.map((a) => a.id), 'AUD-', 1)}`,
        timestamp: nowIso,
        actorName: 'Website Integration',
        actorRole: 'accountant',
        action: 'Website Donation Synced',
        targetRef: `${nextLeadId} / ${voucherNo}`,
        details: `${donorName} · ${fundType} ${formatPkr(amountPkr)} synced to ${targetLedger} (${channel}).`,
      };

      await Promise.all([
        insertLead(newLead),
        insertTransaction(newTxn, audit),
        insertWebsiteSyncEvent(syncEvent),
      ]);

      const updatedState = await readFullSystemState();
      res.status(201).json({ state: updatedState });
      return;
    }

    const newLead: DonorLead = {
      id: nextLeadId,
      donorName,
      phone,
      source,
      campaignName,
      inquiryDate: todayIso,
      stage: 'New Inquiry',
      fundInterest: fundType,
      pledgedAmountPkr: amountPkr,
      receivedAmountPkr: 0,
      assignedTo: ROLE_PROFILES.followup.staffName,
      followUpDate: todayIso,
      followUpNote: 'Incoming inquiry synced; awaiting staff follow-up.',
      notes: notes || `Incoming ${source} submission.`,
      createdAt: nowIso,
    };

    const syncEvent: WebsiteSyncEvent = {
      id: `SYN-${nextSeq(state.websiteSyncEvents.map((e) => e.id), 'SYN-', 1)}`,
      timestamp: nowIso,
      source,
      donorName,
      phone,
      amountPkr: amountPkr > 0 ? amountPkr : undefined,
      fundType,
      leadId: nextLeadId,
      status: 'Synced to CRM',
    };

    await Promise.all([insertLead(newLead), insertWebsiteSyncEvent(syncEvent)]);
    const updatedState = await readFullSystemState();
    res.status(201).json({ state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to process website sync event.' });
  }
});

app.post('/api/backup/restore', async (req, res) => {
  try {
    const role = resolveRole(req.headers['x-user-role']);
    if (role !== 'management') {
      res.status(403).json({
        error: 'Database restore requires Management / Admin role.',
      });
      return;
    }

    const body = req.body || {};
    const incoming = body.state as SystemState | undefined;
    if (
      !incoming ||
      !Array.isArray(incoming.leads) ||
      !Array.isArray(incoming.transactions) ||
      !Array.isArray(incoming.reconciliations)
    ) {
      res.status(400).json({ error: 'Invalid backup state payload.' });
      return;
    }

    const profile = ROLE_PROFILES[role];
    const actorNote = asCleanString(body.actorNote, 300) || 'Backup restored';

    const nextState: SystemState = {
      leads: incoming.leads,
      transactions: incoming.transactions,
      reconciliations: incoming.reconciliations,
      assets: Array.isArray(incoming.assets) ? incoming.assets : [],
      rationStock: Array.isArray(incoming.rationStock)
        ? incoming.rationStock
        : [],
      websiteSyncEvents: Array.isArray(incoming.websiteSyncEvents)
        ? incoming.websiteSyncEvents
        : [],
      auditTrail: [
        {
          id: `AUD-${nextSeq(Array.isArray(incoming.auditTrail) ? incoming.auditTrail.map((a) => a.id) : [], 'AUD-', 1)}`,
          timestamp: new Date().toISOString(),
          actorName: profile.staffName,
          actorRole: role,
          action: 'System Backup Restored',
          targetRef: 'FULL-BACKUP',
          details: actorNote,
        },
        ...(Array.isArray(incoming.auditTrail) ? incoming.auditTrail : []),
      ],
    };

    await replaceFullSystemState(nextState);
    const updatedState = await readFullSystemState();
    res.json({ state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to restore backup.' });
  }
});

app.post('/api/backup/reset', async (req, res) => {
  try {
    const role = resolveRole(req.headers['x-user-role']);
    if (role !== 'management') {
      res.status(403).json({
        error: 'Resetting database requires Management / Admin role.',
      });
      return;
    }
    await replaceFullSystemState(getStartingState());
    const updatedState = await readFullSystemState();
    res.json({ state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to reset database.' });
  }
});

// Simple root route so hosting platforms (e.g. Render) can check the API is alive
app.get('/', (_req, res) => {
  res.json({ service: 'Bait-ul-Noor CRM API', status: 'running' });
});

// Backend only: the React frontend is deployed separately (e.g. on Vercel)
// Refuse to start without a strong JWT_SECRET
assertAuthConfig();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bait-ul-Noor CRM & Accounting API listening on port ${PORT}`);
  // Create the starter logins (management / accountant / followup) on first run
  ensureDefaultUsers().catch((err) => {
    console.error('[auth] Could not create default users:', err);
  });
});