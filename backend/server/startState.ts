import type { ChannelReconciliation, SystemState } from '../types/system.ts';
import { INITIAL_SYSTEM_STATE } from '../data/seedData.ts';

/**
 * What the database starts with (first run, or when "Reset" is pressed).
 *
 *  - SEED_DEMO_DATA=true   -> the sample leads, vouchers and assets (for demos)
 *  - anything else/unset   -> a clean start for real use: no leads, no vouchers,
 *                             only the 5 payment channels (Faysal, Meezan, JazzCash,
 *                             EasyPaisa, Donation Boxes) with zero balances.
 */
export function useDemoData(): boolean {
  return (process.env.SEED_DEMO_DATA || '').trim().toLowerCase() === 'true';
}

function channelShells(): ChannelReconciliation[] {
  const today = new Date().toISOString().slice(0, 10);
  const base = {
    statementBalancePkr: 0,
    lastReconciledDate: today,
    reconciledBy: 'Not yet reconciled',
    notes: '',
  };
  return [
    {
      ...base,
      channel: 'Faysal Bank',
      channelType: 'Bank Account',
      // Same account number that is shown on the public donation page
      accountRef: 'PK59FAYS032301000010231',
    },
    {
      ...base,
      channel: 'Meezan Bank',
      channelType: 'Bank Account',
      accountRef: 'Add account number',
    },
    {
      ...base,
      channel: 'JazzCash',
      channelType: 'Mobile Wallet',
      accountRef: 'Add wallet number',
    },
    {
      ...base,
      channel: 'EasyPaisa',
      channelType: 'Mobile Wallet',
      accountRef: 'Add wallet number',
    },
    {
      ...base,
      channel: 'Donation Boxes',
      channelType: 'Physical Channel',
      accountRef: 'Donation boxes & petty cash',
    },
  ];
}

export function getStartingState(): SystemState {
  if (useDemoData()) return structuredClone(INITIAL_SYSTEM_STATE);
  return {
    leads: [],
    transactions: [],
    reconciliations: channelShells(),
    assets: [],
    rationStock: [],
    auditTrail: [],
    websiteSyncEvents: [],
  };
}