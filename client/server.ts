import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  AuditLogEntry,
  DonorLead,
  IncomeFundType,
  LedgerName,
  LedgerTransaction,
  PaymentChannel,
  RationStockItem,
  SocietyAsset,
  SystemState,
  WebsiteSyncEvent,
} from './src/types/system.ts';
import { INITIAL_SYSTEM_STATE } from './src/data/seedData.ts';
import {
  formatPkr,
  getTodayIsoDate,
  inferDefaultLedgerForFund,
  ROLE_PROFILES,
} from './src/utils/accounting.ts';
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
  sanitizeReconciliationChannel,
  validateAssetPayload,
  validateLeadPayload,
  validateRationPayload,
  validateReconciliationPayload,
  validateTransactionPayload,
} from './server/validation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '5mb' }));

// Global NoSQL operator injection guard on request bodies
app.use('/api', (req, res, next) => {
  if (req.body && hasDangerousMongoKeys(req.body)) {
    res.status(400).json({ error: 'Invalid characters in payload keys.' });
    return;
  }
  next();
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
    const state = await readFullSystemState();
    const nextId = `LD-${1001 + state.leads.length}`;
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

    const nextTxnNum = state.transactions.length + 1;
    const nextTxnId = `TXN-${String(nextTxnNum).padStart(3, '0')}`;
    const voucherNo = `VCH-2611-${String(nextTxnNum).padStart(3, '0')}`;

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
      id: `AUD-${state.auditTrail.length + 1}`,
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

    const nextNum = state.transactions.length + 1;
    const nextId = `TXN-${String(nextNum).padStart(3, '0')}`;
    const voucherNo = `VCH-2611-${String(nextNum).padStart(3, '0')}`;

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
          id: `AUD-${state.auditTrail.length + 1}`,
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
      id: `AUD-${state.auditTrail.length + 1}`,
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
      id: `AST-${String(state.assets.length + 1).padStart(2, '0')}`,
      assetCode: `BN-AS-${String(state.assets.length + 1).padStart(3, '0')}`,
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
      id: `RAT-${String(state.rationStock.length + 1).padStart(2, '0')}`,
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
    const nextLeadId = `LD-${1001 + state.leads.length}`;
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
      const nextTxnNum = state.transactions.length + 1;
      const nextTxnId = `TXN-${String(nextTxnNum).padStart(3, '0')}`;
      const voucherNo = `VCH-2611-${String(nextTxnNum).padStart(3, '0')}`;
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
        assignedTo: 'Tariq Mahmood',
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
        id: `SYN-${state.websiteSyncEvents.length + 1}`,
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
        id: `AUD-${state.auditTrail.length + 1}`,
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
      assignedTo: 'Ayesha Siddiqui',
      followUpDate: todayIso,
      followUpNote: 'Incoming inquiry synced; awaiting staff follow-up.',
      notes: notes || `Incoming ${source} submission.`,
      createdAt: nowIso,
    };

    const syncEvent: WebsiteSyncEvent = {
      id: `SYN-${state.websiteSyncEvents.length + 1}`,
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
          id: `AUD-${(incoming.auditTrail?.length || 0) + 1}`,
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
    await replaceFullSystemState(structuredClone(INITIAL_SYSTEM_STATE));
    const updatedState = await readFullSystemState();
    res.json({ state: updatedState });
  } catch {
    res.status(500).json({ error: 'Failed to reset database.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bait-ul-Noor CRM & Accounting server listening on port ${PORT}`);
  });
}

startServer();
