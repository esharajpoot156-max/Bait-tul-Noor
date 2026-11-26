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
import { getStartingState } from './startState.ts';

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
let fallbackState: SystemState = getStartingState();

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

  const [leadCount, txnCount, recCount, assetCount, rationCount, auditCount, syncCount] =
    await Promise.all([
      leadsCol.countDocuments(),
      txnsCol.countDocuments(),
      recCol.countDocuments(),
      assetsCol.countDocuments(),
      rationCol.countDocuments(),
      auditCol.countDocuments(),
      syncCol.countDocuments(),
    ]);

  const start = getStartingState();
  const brandNewDatabase =
    leadCount + txnCount + recCount + assetCount + rationCount + auditCount + syncCount === 0;

  if (brandNewDatabase) {
    // First ever run: load the starting data (clean, or demo if SEED_DEMO_DATA=true)
    if (start.leads.length > 0) await leadsCol.insertMany(start.leads);
    if (start.transactions.length > 0) await txnsCol.insertMany(start.transactions);
    if (start.reconciliations.length > 0) await recCol.insertMany(start.reconciliations);
    if (start.assets.length > 0) await assetsCol.insertMany(start.assets);
    if (start.rationStock.length > 0) await rationCol.insertMany(start.rationStock);
    if (start.auditTrail.length > 0) await auditCol.insertMany(start.auditTrail);
    if (start.websiteSyncEvents.length > 0) await syncCol.insertMany(start.websiteSyncEvents);
  } else if (recCount === 0 && start.reconciliations.length > 0) {
    // Real data exists but the channel list is missing: put the channels back
    await recCol.insertMany(start.reconciliations);
  }
  // Note: an emptied leads/vouchers list no longer brings the sample data back by itself.

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

// Which SystemState list is stored in which MongoDB collection
const STATE_COLLECTIONS: { key: keyof SystemState; collection: string }[] = [
  { key: 'leads', collection: 'leads' },
  { key: 'transactions', collection: 'transactions' },
  { key: 'reconciliations', collection: 'reconciliations' },
  { key: 'assets', collection: 'assets' },
  { key: 'rationStock', collection: 'ration_stock' },
  { key: 'auditTrail', collection: 'audit_trail' },
  { key: 'websiteSyncEvents', collection: 'website_sync_events' },
];

// Empties every collection, then inserts the given state, one collection at a time
async function writeStateToDb(db: Db, state: SystemState): Promise<void> {
  for (const { collection } of STATE_COLLECTIONS) {
    await db.collection(collection).deleteMany({});
  }
  for (const { key, collection } of STATE_COLLECTIONS) {
    const records = state[key] as unknown as Record<string, unknown>[];
    if (records.length > 0) {
      // structuredClone: insertMany adds "_id" to what it receives, so give it copies
      await db.collection(collection).insertMany(structuredClone(records));
    }
  }
}

/**
 * Replaces ALL data with nextState (used by Backup Restore and Reset).
 * Safety net: the current data is read first. If anything fails half way, the old data is
 * put back automatically, so a failed restore does not leave the society with an empty database.
 */
export async function replaceFullSystemState(
  nextState: SystemState
): Promise<void> {
  const db = await getAtlasDb();
  if (!db) {
    fallbackState = structuredClone(nextState);
    return;
  }

  // 1. Remember what is in the database right now
  const snapshot = await readFullSystemState();

  try {
    // 2. Replace it with the new data
    await writeStateToDb(db, nextState);
  } catch (err) {
    // 3. Something failed: put the old data back
    try {
      await writeStateToDb(db, snapshot);
    } catch (rollbackErr) {
      console.error('[restore] Rollback failed:', rollbackErr);
      throw new Error(
        'Restore failed and the automatic rollback also failed. Do not make changes: contact the developer.'
      );
    }
    console.error('[restore] Restore failed, previous data was put back:', err);
    throw new Error('Restore failed. Your previous data was kept.');
  }
}