import React, { useState } from 'react';
import {
  Download,
  Printer,
  Plus,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  ChannelReconciliation,
  PaymentChannel,
  RationStockItem,
  SocietyAsset,
  UserRole,
} from '../types/system';
import {
  exportRowsToXlsx,
  formatPkr,
  formatShortDate,
  getTodayIsoDate,
} from '../utils/accounts';
import { PrintReportConfig } from './PrintStatementModal';

interface ChannelsAssetsViewProps {
  reconciliations: ChannelReconciliation[];
  channelTotals: Record<
    PaymentChannel,
    { credits: number; debits: number; net: number; count: number }
  >;
  assets: SocietyAsset[];
  rationStock: RationStockItem[];
  currentRole: UserRole;
  onUpdateReconciliation: (rec: ChannelReconciliation) => void;
  onAddAsset: (asset: Omit<SocietyAsset, 'id'>) => void;
  onAddRation: (item: Omit<RationStockItem, 'id'>) => void;
  onOpenPrint: (config: PrintReportConfig) => void;
}

type ChannelSubTab = 'reconciliation' | 'assets' | 'ration';

export const ChannelsAssetsView: React.FC<ChannelsAssetsViewProps> = ({
  reconciliations,
  channelTotals,
  assets,
  rationStock,
  currentRole,
  onUpdateReconciliation,
  onAddAsset,
  onAddRation,
  onOpenPrint,
}) => {
  const [subTab, setSubTab] = useState<ChannelSubTab>('reconciliation');
  const [editingRec, setEditingRec] = useState<ChannelReconciliation | null>(
    null
  );
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showRationModal, setShowRationModal] = useState(false);

  // Asset form
  const [assetName, setAssetName] = useState('');
  const [assetCategory, setAssetCategory] = useState('Furniture');
  const [assetQty, setAssetQty] = useState('1');
  const [assetUnitVal, setAssetUnitVal] = useState('15000');
  const [assetLocation, setAssetLocation] = useState('Main Hostel');
  const [assetCondition, setAssetCondition] =
    useState<SocietyAsset['condition']>('Good');

  // Ration form
  const [rationName, setRationName] = useState('');
  const [rationQty, setRationQty] = useState('10');
  const [rationUnit, setRationUnit] = useState('kg');
  const [rationValue, setRationValue] = useState('5000');
  const [rationDonor, setRationDonor] = useState('');

  const canModifyAccounts =
    currentRole === 'management' || currentRole === 'accountant';

  const totalAssetsValuation = assets.reduce(
    (s, a) => s + a.quantity * a.unitValuePkr,
    0
  );
  const totalRationValuation = rationStock.reduce(
    (s, r) => s + r.estimatedValuePkr,
    0
  );

  const handleExportReconciliationCsv = () => {
    exportRowsToXlsx(
      `bait-ul-noor-channel-reconciliation-${getTodayIsoDate()}.xlsx`,
      [
        'Channel',
        'Type',
        'Account Reference',
        'Credits (PKR)',
        'Debits (PKR)',
        'Ledger Net (PKR)',
        'Statement Balance (PKR)',
        'Variance (PKR)',
        'Last Reconciled',
        'Reconciled By',
      ],
      reconciliations.map((rec) => {
        const stats = channelTotals[rec.channel] || {
          credits: 0,
          debits: 0,
          net: 0,
        };
        return [
          rec.channel,
          rec.channelType,
          rec.accountRef,
          stats.credits,
          stats.debits,
          stats.net,
          rec.statementBalancePkr,
          rec.statementBalancePkr - stats.net,
          rec.lastReconciledDate,
          rec.reconciledBy,
        ];
      })
    );
  };

  const handleCreateAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName.trim()) return;
    onAddAsset({
      assetCode: `BN-AS-${String(assets.length + 1).padStart(3, '0')}`,
      name: assetName.trim(),
      category: assetCategory,
      quantity: Math.max(1, Number(assetQty) || 1),
      unitValuePkr: Math.max(0, Number(assetUnitVal) || 0),
      acquiredDate: getTodayIsoDate(),
      location: assetLocation.trim() || 'Main Facility',
      condition: assetCondition,
    });
    setAssetName('');
    setShowAssetModal(false);
  };

  const handleCreateRation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rationName.trim()) return;
    onAddRation({
      itemName: rationName.trim(),
      quantity: Math.max(1, Number(rationQty) || 1),
      unit: rationUnit.trim() || 'kg',
      estimatedValuePkr: Math.max(0, Number(rationValue) || 0),
      donorSource: rationDonor.trim() || 'Direct In-Kind Donor',
      lastUpdated: getTodayIsoDate(),
    });
    setRationName('');
    setRationDonor('');
    setShowRationModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setSubTab('reconciliation')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'reconciliation'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bank &amp; Wallet Reconciliation
          </button>
          <button
            type="button"
            onClick={() => setSubTab('assets')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'assets'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Society Assets (Asase) ({assets.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ration')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'ration'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            In-Kind Ration / Ajnaas ({rationStock.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'reconciliation' && (
            <>
              <button
                type="button"
                onClick={handleExportReconciliationCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenPrint({
                    kind: 'reconciliation',
                    title: 'Bank, Wallet & Donation Box Reconciliation Statement',
                    subtitle:
                      'Comparison of ledger book balances against bank, JazzCash, EasyPaisa & physical cash statements',
                    reconciliations,
                    channelTotals,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>PDF Reconciliation</span>
              </button>
            </>
          )}

          {subTab === 'assets' && canModifyAccounts && (
            <button
              type="button"
              onClick={() => setShowAssetModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Society Asset</span>
            </button>
          )}

          {subTab === 'ration' && canModifyAccounts && (
            <button
              type="button"
              onClick={() => setShowRationModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-900 text-white text-xs font-medium hover:bg-emerald-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Ration / Ajnaas Stock</span>
            </button>
          )}
        </div>
      </div>

      {/* SubTab 1: Bank & Wallet Reconciliation */}
      {subTab === 'reconciliation' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Bank Accounts, Mobile Wallets &amp; Donation Boxes
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Faysal Bank, Meezan Bank, JazzCash, EasyPaisa, and sealed Donation Boxes reconciliation
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-3 px-5">Channel &amp; Account Ref</th>
                  <th className="py-3 px-4 text-right">Total Credits</th>
                  <th className="py-3 px-4 text-right">Total Debits</th>
                  <th className="py-3 px-4 text-right">Ledger Book Bal</th>
                  <th className="py-3 px-4 text-right">Bank / Vault Stmt</th>
                  <th className="py-3 px-4 text-right">Variance</th>
                  <th className="py-3 px-4">Last Reconciled</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {reconciliations.map((rec) => {
                  const stats = channelTotals[rec.channel] || {
                    credits: 0,
                    debits: 0,
                    net: 0,
                  };
                  const variance = rec.statementBalancePkr - stats.net;
                  const matched = variance === 0;
                  return (
                    <tr key={rec.channel} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-5">
                        <div className="font-medium text-slate-900 text-sm">
                          {rec.channel}
                        </div>
                        <div className="text-slate-500 font-mono text-[11px] mt-0.5">
                          {rec.channelType} · {rec.accountRef}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-800 whitespace-nowrap">
                        {formatPkr(stats.credits)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">
                        {formatPkr(stats.debits)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatPkr(stats.net)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {formatPkr(rec.statementBalancePkr)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        {matched ? (
                          <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Matched
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium">
                            {formatPkr(variance)}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono tabular-nums text-slate-700">
                          {formatShortDate(rec.lastReconciledDate)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {rec.reconciledBy}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {canModifyAccounts ? (
                          <button
                            type="button"
                            onClick={() => setEditingRec(rec)}
                            className="text-emerald-900 font-medium hover:underline"
                          >
                            Update Stmt
                          </button>
                        ) : (
                          <span className="text-slate-400">Read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 2: Society Assets (Asase) */}
      {subTab === 'assets' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900">
                Society Physical Assets Register (Asase)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Fixed equipment, furniture, kitchen appliances, and office assets owned by Bait-ul-Noor
              </p>
            </div>
            <div className="text-xs">
              <span className="text-slate-500">Total Asset Valuation: </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                {formatPkr(totalAssetsValuation)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-3 px-5">Asset Code</th>
                  <th className="py-3 px-4">Asset Name &amp; Category</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Acquired</th>
                  <th className="py-3 px-4">Condition</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Unit Value</th>
                  <th className="py-3 px-5 text-right">Total Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td className="py-3 px-5 font-mono text-slate-600 whitespace-nowrap">
                      {a.assetCode}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{a.name}</div>
                      <div className="text-slate-500">{a.category}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{a.location}</td>
                    <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                      {formatShortDate(a.acquiredDate)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{a.condition}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {a.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {formatPkr(a.unitValuePkr)}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatPkr(a.quantity * a.unitValuePkr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 3: In-Kind Ration / Ajnaas Stock */}
      {subTab === 'ration' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900">
                In-Kind Ration &amp; Ajnaas Stock Records
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Physical food supplies and in-kind goods contributed to the Welfare store
              </p>
            </div>
            <div className="text-xs">
              <span className="text-slate-500">Estimated Ration Value: </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                {formatPkr(totalRationValuation)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-3 px-5">Ration / Commodity Item</th>
                  <th className="py-3 px-4">Donor / Source</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-right">Stock Qty</th>
                  <th className="py-3 px-5 text-right">Est. Value (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rationStock.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 px-5 font-medium text-slate-900">
                      {item.itemName}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {item.donorSource}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                      {formatShortDate(item.lastUpdated)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="py-3 px-5 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatPkr(item.estimatedValuePkr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Update Statement Balance Modal */}
      {editingRec && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-semibold text-base text-slate-900">
                Reconcile · {editingRec.channel}
              </h3>
              <button
                type="button"
                onClick={() => setEditingRec(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onUpdateReconciliation({
                  ...editingRec,
                  lastReconciledDate: getTodayIsoDate(),
                });
                setEditingRec(null);
              }}
              className="p-6 space-y-4 text-xs"
            >
              <div className="p-3 rounded bg-slate-50 border border-slate-200 flex justify-between">
                <span className="text-slate-600">Ledger Book Balance:</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatPkr(channelTotals[editingRec.channel]?.net || 0)}
                </span>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Actual Bank / Wallet / Box Statement Balance (PKR)
                </label>
                <input
                  type="number"
                  required
                  value={editingRec.statementBalancePkr}
                  onChange={(e) =>
                    setEditingRec({
                      ...editingRec,
                      statementBalancePkr: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Reconciliation Notes
                </label>
                <textarea
                  rows={2}
                  value={editingRec.notes}
                  onChange={(e) =>
                    setEditingRec({ ...editingRec, notes: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRec(null)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-900 text-white font-medium hover:bg-emerald-800"
                >
                  Save Reconciliation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Society Asset Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-semibold text-base text-slate-900">
                Register Society Asset (Asase)
              </h3>
              <button
                type="button"
                onClick={() => setShowAssetModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAsset} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Asset Name *
                </label>
                <input
                  type="text"
                  required
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  placeholder="e.g. Sewing Machines for Vocational Room"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={assetCategory}
                    onChange={(e) => setAssetCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Condition
                  </label>
                  <select
                    value={assetCondition}
                    onChange={(e) =>
                      setAssetCondition(
                        e.target.value as SocietyAsset['condition']
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white"
                  >
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Needs Maintenance">Needs Maintenance</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={assetQty}
                    onChange={(e) => setAssetQty(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Unit Value (PKR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={assetUnitVal}
                    onChange={(e) => setAssetUnitVal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={assetLocation}
                  onChange={(e) => setAssetLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssetModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-900 text-white font-medium hover:bg-emerald-800"
                >
                  Add Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Ration Modal */}
      {showRationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display font-semibold text-base text-slate-900">
                Log In-Kind Ration / Ajnaas Stock
              </h3>
              <button
                type="button"
                onClick={() => setShowRationModal(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateRation} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={rationName}
                  onChange={(e) => setRationName(e.target.value)}
                  placeholder="e.g. White Sugar / Dry Milk"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={rationQty}
                    onChange={(e) => setRationQty(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={rationUnit}
                    onChange={(e) => setRationUnit(e.target.value)}
                    placeholder="kg / Bags / Cans"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Estimated Valuation (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={rationValue}
                  onChange={(e) => setRationValue(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Donor / Source
                </label>
                <input
                  type="text"
                  value={rationDonor}
                  onChange={(e) => setRationDonor(e.target.value)}
                  placeholder="e.g. Al-Rehman Traders"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRationModal(false)}
                  className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-emerald-900 text-white font-medium hover:bg-emerald-800"
                >
                  Save Ration Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};