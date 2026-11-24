import { MongoClient, ServerApiVersion } from 'mongodb';
import type { Db } from 'mongodb';
import type {
  AuditLogEntry,
  ChannelReconciliation,
  DonorLead,
  LedgerTransaction,
  RationStockItem,
  SocietyAsset,
  SystemState,
  WebsiteSyncEvent,
} from '../types/system.ts';
import { INITIAL_SYSTEM_STATE } from '../data/seedData.ts';

export interface DatabaseStatus {
  storageMode: 'atlas' | 'preview-fallback';
  connected: boolean;
  databaseName: string;
  collections: {
    leads: number;
    transactions: number;
    reconciliations: number;
    assets: number;
    rationStock: number;
    auditTrail: number;
    websiteSyncEvents: number;
  };
  errorMessage?: string;
}

const DB_NAME = process.env.MONGODB_DB_NAME?.trim() || 'bait_ul_noor_crm';

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let atlasConnectAttempted = false;
let atlasError: string | undefined;

// Preview fallback state when MONGODB_URI is not configured yet in Secrets
let fallbackState: SystemState = structuredClone(INITIAL_SYSTEM_STATE);

function stripMongoId<T extends object>(doc: T & { _id?: unknown }): T {
  const copy = { ...doc };
  delete copy._id;
  return copy;
}

async function ensureSeededIfEmpty(db: Db): Promise<void> {
  const leadsCol = db.collection<DonorLead>('leads');
  const txnsCol = db.collection<LedgerTransaction>('transactions');
  const recCol = db.collection<ChannelReconciliation>('reconciliations');
  const assetsCol = db.collection<SocietyAsset>('assets');
  const rationCol = db.collection<RationStockItem>('ration_stock');
  const auditCol = db.collection<AuditLogEntry>('audit_trail');
  const syncCol = db.collection<WebsiteSyncEvent>('website_sync_events');

  const [leadCount, txnCount] = await Promise.all([
    leadsCol.countDocuments(),
    txnsCol.countDocuments(),
  ]);

  if (leadCount === 0 && txnCount === 0) {
    if (INITIAL_SYSTEM_STATE.leads.length > 0) {
      await leadsCol.insertMany(structuredClone(INITIAL_SYSTEM_STATE.leads));
    }
    if (INITIAL_SYSTEM_STATE.transactions.length > 0) {
      await txnsCol.insertMany(structuredClone(INITIAL_SYSTEM_STATE.transactions));
    }
    if (INITIAL_SYSTEM_STATE.reconciliations.length > 0) {
      await recCol.insertMany(structuredClone(INITIAL_SYSTEM_STATE.reconciliations));
    }
    if (INITIAL_SYSTEM_STATE.assets.length > 0) {
      await assetsCol.insertMany(structuredClone(INITIAL_SYSTEM_STATE.assets));
    }
    if (INITIAL_SYSTEM_STATE.rationStock.length > 0) {
      await rationCol.insertMany(structuredClone(INITIAL_SYSTEM_STATE.rationStock));
    }
    if (INITIAL_SYSTEM_STATE.auditTrail.length > 0) {
      await auditCol.insertMany(structuredClone(INITIAL_SYSTEM_STATE.auditTrail));
    }
    if (INITIAL_SYSTEM_STATE.websiteSyncEvents.length > 0) {
      await syncCol.insertMany(
        structuredClone(INITIAL_SYSTEM_STATE.websiteSyncEvents)
      );
    }
  }

  await Promise.all([
    leadsCol.createIndex({ id: 1 }, { unique: true }),
    txnsCol.createIndex({ id: 1 }, { unique: true }),
    txnsCol.createIndex({ transactionDate: 1, systemEntryTimestamp: 1 }),
    recCol.createIndex({ channel: 1 }, { unique: true }),
    assetsCol.createIndex({ id: 1 }, { unique: true }),
    rationCol.createIndex({ id: 1 }, { unique: true }),
  ]);
}

export async function getAtlasDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    return null;
  }

  if (mongoDb) {
    return mongoDb;
  }

  if (atlasConnectAttempted && atlasError) {
    return null;
  }

  atlasConnectAttempted = true;
  try {
    mongoClient = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      connectTimeoutMS: 8000,
      serverSelectionTimeoutMS: 8000,
    });
    await mongoClient.connect();
    await mongoClient.db('admin').command({ ping: 1 });
    const db = mongoClient.db(DB_NAME);
    await ensureSeededIfEmpty(db);
    mongoDb = db;
    atlasError = undefined;
    return mongoDb;
  } catch (err) {
    atlasError =
      err instanceof Error ? err.message : 'Unable to connect to MongoDB Atlas.';
    mongoDb = null;
    return null;
  }
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const uriConfigured = Boolean(process.env.MONGODB_URI?.trim());
  if (uriConfigured) {
    // Retry connection if previously failed and user asks for health check
    if (!mongoDb) {
      atlasConnectAttempted = false;
      atlasError = undefined;
    }
    const db = await getAtlasDb();
    if (db) {
      const [
        leads,
        transactions,
        reconciliations,
        assets,
        rationStock,
        auditTrail,
        websiteSyncEvents,
      ] = await Promise.all([
        db.collection('leads').countDocuments(),
        db.collection('transactions').countDocuments(),
        db.collection('reconciliations').countDocuments(),
        db.collection('assets').countDocuments(),
        db.collection('ration_stock').countDocuments(),
        db.collection('audit_trail').countDocuments(),
        db.collection('website_sync_events').countDocuments(),
      ]);
      return {
        storageMode: 'atlas',
        connected: true,
        databaseName: DB_NAME,
        collections: {
          leads,
          transactions,
          reconciliations,
          assets,
          rationStock,
          auditTrail,
          websiteSyncEvents,
        },
      };
    }
  }

  return {
    storageMode: 'preview-fallback',
    connected: false,
    databaseName: DB_NAME,
    collections: {
      leads: fallbackState.leads.length,
      transactions: fallbackState.transactions.length,
      reconciliations: fallbackState.reconciliations.length,
      assets: fallbackState.assets.length,
      rationStock: fallbackState.rationStock.length,
      auditTrail: fallbackState.auditTrail.length,
      websiteSyncEvents: fallbackState.websiteSyncEvents.length,
    },
    errorMessage: uriConfigured
      ? atlasError || 'MongoDB Atlas connection failed.'
      : undefined,
  };
}

export async function readFullSystemState(): Promise<SystemState> {
  const db = await getAtlasDb();
  if (!db) {
    return structuredClone(fallbackState);
  }

  const [
    leads,
    transactions,
    reconciliations,
    assets,
    rationStock,
    auditTrail,
    websiteSyncEvents,
  ] = await Promise.all([
    db.collection<DonorLead>('leads').find({}).sort({ createdAt: -1 }).toArray(),
    db
      .collection<LedgerTransaction>('transactions')
      .find({})
      .sort({ transactionDate: 1, systemEntryTimestamp: 1 })
      .toArray(),
    db.collection<ChannelReconciliation>('reconciliations').find({}).toArray(),
    db.collection<SocietyAsset>('assets').find({}).toArray(),
    db.collection<RationStockItem>('ration_stock').find({}).toArray(),
    db
      .collection<AuditLogEntry>('audit_trail')
      .find({})
      .sort({ timestamp: -1 })
      .toArray(),
    db
      .collection<WebsiteSyncEvent>('website_sync_events')
      .find({})
      .sort({ timestamp: -1 })
      .toArray(),
  ]);

  return {
    leads: leads.map(stripMongoId),
    transactions: transactions.map(stripMongoId),
    reconciliations: reconciliations.map(stripMongoId),
    assets: assets.map(stripMongoId),
    rationStock: rationStock.map(stripMongoId),
    auditTrail: auditTrail.map(stripMongoId),
    websiteSyncEvents: websiteSyncEvents.map(stripMongoId),
  };
}

export async function insertLead(lead: DonorLead): Promise<void> {
  const db = await getAtlasDb();
  if (!db) {
    fallbackState.leads = [lead, ...fallbackState.leads];
    return;
  }
  await db.collection<DonorLead>('leads').insertOne({ ...lead });
}

export async function updateLeadById(
  id: string,
  lead: DonorLead
): Promise<boolean> {
  const db = await getAtlasDb();
  if (!db) {
    const idx = fallbackState.leads.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    fallbackState.leads[idx] = lead;
    return true;
  }
  const res = await db
    .collection<DonorLead>('leads')
    .replaceOne({ id }, { ...lead });
  return res.matchedCount > 0;
}

export async function insertTransaction(
  txn: LedgerTransaction,
  audit?: AuditLogEntry
): Promise<void> {
  const db = await getAtlasDb();
  if (!db) {
    fallbackState.transactions = [...fallbackState.transactions, txn];
    if (audit) {
      fallbackState.auditTrail = [audit, ...fallbackState.auditTrail];
    }
    return;
  }
  await db.collection<LedgerTransaction>('transactions').insertOne({ ...txn });
  if (audit) {
    await db.collection<AuditLogEntry>('audit_trail').insertOne({ ...audit });
  }
}

export async function approveTransactionBackdate(
  id: string,
  approvedBy: string,
  audit: AuditLogEntry
): Promise<boolean> {
  const db = await getAtlasDb();
  if (!db) {
    const idx = fallbackState.transactions.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    fallbackState.transactions[idx] = {
      ...fallbackState.transactions[idx],
      backdateApproved: true,
      backdateApprovedBy: approvedBy,
    };
    fallbackState.auditTrail = [audit, ...fallbackState.auditTrail];
    return true;
  }
  const res = await db.collection<LedgerTransaction>('transactions').updateOne(
    { id },
    {
      $set: {
        backdateApproved: true,
        backdateApprovedBy: approvedBy,
      },
    }
  );
  if (res.matchedCount === 0) return false;
  await db.collection<AuditLogEntry>('audit_trail').insertOne({ ...audit });
  return true;
}

export async function updateReconciliationRecord(
  channel: ChannelReconciliation['channel'],
  statementBalancePkr: number,
  notes: string,
  lastReconciledDate: string,
  reconciledBy: string
): Promise<boolean> {
  const db = await getAtlasDb();
  if (!db) {
    const idx = fallbackState.reconciliations.findIndex(
      (r) => r.channel === channel
    );
    if (idx === -1) return false;
    fallbackState.reconciliations[idx] = {
      ...fallbackState.reconciliations[idx],
      statementBalancePkr,
      notes,
      lastReconciledDate,
      reconciledBy,
    };
    return true;
  }
  const res = await db
    .collection<ChannelReconciliation>('reconciliations')
    .updateOne(
      { channel },
      {
        $set: {
          statementBalancePkr,
          notes,
          lastReconciledDate,
          reconciledBy,
        },
      }
    );
  return res.matchedCount > 0;
}

export async function insertAsset(asset: SocietyAsset): Promise<void> {
  const db = await getAtlasDb();
  if (!db) {
    fallbackState.assets = [...fallbackState.assets, asset];
    return;
  }
  await db.collection<SocietyAsset>('assets').insertOne({ ...asset });
}

export async function insertRationItem(item: RationStockItem): Promise<void> {
  const db = await getAtlasDb();
  if (!db) {
    fallbackState.rationStock = [...fallbackState.rationStock, item];
    return;
  }
  await db.collection<RationStockItem>('ration_stock').insertOne({ ...item });
}

export async function insertWebsiteSyncEvent(
  event: WebsiteSyncEvent
): Promise<void> {
  const db = await getAtlasDb();
  if (!db) {
    fallbackState.websiteSyncEvents = [
      event,
      ...fallbackState.websiteSyncEvents,
    ];
    return;
  }
  await db
    .collection<WebsiteSyncEvent>('website_sync_events')
    .insertOne({ ...event });
}

export async function replaceFullSystemState(
  nextState: SystemState
): Promise<void> {
  const db = await getAtlasDb();
  if (!db) {
    fallbackState = structuredClone(nextState);
    return;
  }

  await Promise.all([
    db.collection('leads').deleteMany({}),
    db.collection('transactions').deleteMany({}),
    db.collection('reconciliations').deleteMany({}),
    db.collection('assets').deleteMany({}),
    db.collection('ration_stock').deleteMany({}),
    db.collection('audit_trail').deleteMany({}),
    db.collection('website_sync_events').deleteMany({}),
  ]);

  const ops: Promise<unknown>[] = [];
  if (nextState.leads.length > 0) {
    ops.push(db.collection('leads').insertMany(structuredClone(nextState.leads)));
  }
  if (nextState.transactions.length > 0) {
    ops.push(
      db
        .collection('transactions')
        .insertMany(structuredClone(nextState.transactions))
    );
  }
  if (nextState.reconciliations.length > 0) {
    ops.push(
      db
        .collection('reconciliations')
        .insertMany(structuredClone(nextState.reconciliations))
    );
  }
  if (nextState.assets.length > 0) {
    ops.push(
      db.collection('assets').insertMany(structuredClone(nextState.assets))
    );
  }
  if (nextState.rationStock.length > 0) {
    ops.push(
      db
        .collection('ration_stock')
        .insertMany(structuredClone(nextState.rationStock))
    );
  }
  if (nextState.auditTrail.length > 0) {
    ops.push(
      db
        .collection('audit_trail')
        .insertMany(structuredClone(nextState.auditTrail))
    );
  }
  if (nextState.websiteSyncEvents.length > 0) {
    ops.push(
      db
        .collection('website_sync_events')
        .insertMany(structuredClone(nextState.websiteSyncEvents))
    );
  }

  await Promise.all(ops);
}
