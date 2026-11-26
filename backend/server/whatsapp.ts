import crypto from 'node:crypto';
import express from 'express';
import type { Express, Request, RequestHandler, Response } from 'express';
import type { DonorLead, LeadSource, WebsiteSyncEvent } from '../types/system.ts';
import { ROLE_PROFILES } from '../utils/accounting.ts';
import { insertLead, insertWebsiteSyncEvent, readFullSystemState } from './db.ts';
import { nextSeq } from './ids.ts';

/**
 * WhatsApp Cloud API webhook (Meta).
 *
 * When someone messages the society's WhatsApp number (for example after tapping the
 * WhatsApp button on a Facebook ad), Meta calls this address and a "New Inquiry" lead
 * is created automatically.
 *
 *   GET  /api/webhooks/whatsapp   Meta's one-time "verify this address" check
 *   POST /api/webhooks/whatsapp   incoming messages
 *
 * Needs two secrets in the server settings (never in the code):
 *   WHATSAPP_VERIFY_TOKEN  any long random text; the same text is typed into Meta
 *   WHATSAPP_APP_SECRET    the "App Secret" of the Meta app; used to confirm that a
 *                          message really comes from Meta
 */

const MAX_TRACKED_MESSAGE_IDS = 2000;
const seenMessageIds = new Set<string>();

function remember(id: string): boolean {
  if (seenMessageIds.has(id)) return false;
  seenMessageIds.add(id);
  if (seenMessageIds.size > MAX_TRACKED_MESSAGE_IDS) {
    const oldest = seenMessageIds.values().next().value;
    if (oldest !== undefined) seenMessageIds.delete(oldest);
  }
  return true;
}

// Compare two secrets without leaking how many characters matched
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Keeps the exact bytes Meta sent, because the signature is calculated over them
export const whatsappRawParser: RequestHandler = express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    (req as Request & { rawBody?: Buffer }).rawBody = buf;
  },
});

function verifyHandler(req: Request, res: Response): void {
  const expected = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (
    expected &&
    mode === 'subscribe' &&
    typeof token === 'string' &&
    typeof challenge === 'string' &&
    safeEqual(token, expected)
  ) {
    res.status(200).type('text/plain').send(challenge);
    return;
  }
  console.warn('[whatsapp] Webhook verification failed: the verify token does not match WHATSAPP_VERIFY_TOKEN.');
  res.sendStatus(403);
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function describeMessage(m: Record<string, any>): string {
  if (m.type === 'text') return cleanText(m.text?.body, 300);
  if (m.type === 'button') return cleanText(m.button?.text, 300);
  if (m.type === 'interactive') {
    return cleanText(
      m.interactive?.button_reply?.title || m.interactive?.list_reply?.title,
      300
    );
  }
  return `[${cleanText(m.type, 30) || 'unknown'} message]`;
}

const digitsOf = (value: string) => value.replace(/\D/g, '');

/** Turns incoming WhatsApp messages into "New Inquiry" leads. Returns how many were created. */
export async function processWhatsAppPayload(body: any): Promise<number> {
  if (!body || body.object !== 'whatsapp_business_account') return 0;

  const state = await readFullSystemState();
  let created = 0;

  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      const value = change.value || {};

      // delivery / read receipts arrive as "statuses", not "messages": nothing to do
      const messages: Record<string, any>[] = Array.isArray(value.messages) ? value.messages : [];
      const names = new Map<string, string>();
      for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
        if (c?.wa_id) names.set(String(c.wa_id), cleanText(c.profile?.name, 120));
      }

      for (const m of messages) {
        const messageId = String(m?.id || '');
        if (messageId && !remember(messageId)) continue; // Meta re-sent a message we already handled

        const waId = digitsOf(String(m?.from || ''));
        if (waId.length < 8) continue;
        const phone = `+${waId}`;

        // Same person already has an open inquiry: do not create a second lead
        const last10 = waId.slice(-10);
        const hasOpenLead = state.leads.some(
          (l) =>
            digitsOf(l.phone).slice(-10) === last10 &&
            (l.stage === 'New Inquiry' || l.stage === 'Qualified')
        );
        if (hasOpenLead) {
          console.log('[whatsapp] Skipped: this number already has an open lead (New Inquiry / Qualified).');
          continue;
        }

        const referral = m.referral && typeof m.referral === 'object' ? m.referral : null;
        const source: LeadSource = referral ? 'Meta Ads (WhatsApp)' : 'Direct WhatsApp';
        const donorName = names.get(String(m.from)) || `WhatsApp ${phone}`;

        const noteParts = [`WhatsApp message: "${describeMessage(m)}"`];
        if (referral) {
          const adTitle = cleanText(referral.headline || referral.body, 120);
          noteParts.push(
            `Meta ad: ${adTitle || 'ad'} (ad ID ${cleanText(referral.source_id, 40)})`
          );
          if (referral.ctwa_clid) {
            noteParts.push(`Click ID: ${cleanText(referral.ctwa_clid, 200)}`);
          }
        }

        const nowIso = new Date().toISOString();
        const today = nowIso.slice(0, 10);
        const leadId = `LD-${nextSeq(state.leads.map((l) => l.id), 'LD-', 1001)}`;

        const lead: DonorLead = {
          id: leadId,
          donorName,
          phone,
          source,
          inquiryDate: today,
          stage: 'New Inquiry',
          fundInterest: 'Atiyaat (Donations)',
          pledgedAmountPkr: 0,
          receivedAmountPkr: 0,
          assignedTo: ROLE_PROFILES.followup.staffName,
          followUpDate: today,
          followUpNote: 'New WhatsApp inquiry. Please reply and follow up.',
          notes: noteParts.join(' | ').slice(0, 800),
          createdAt: nowIso,
        };

        const syncEvent: WebsiteSyncEvent = {
          id: `SYN-${nextSeq(state.websiteSyncEvents.map((e) => e.id), 'SYN-', 1)}`,
          timestamp: nowIso,
          source,
          donorName,
          phone,
          fundType: 'Atiyaat (Donations)',
          leadId,
          status: 'Synced to CRM',
        };

        await Promise.all([insertLead(lead), insertWebsiteSyncEvent(syncEvent)]);
        state.leads.push(lead); // so a second message in the same delivery is seen too
        state.websiteSyncEvents.push(syncEvent);
        created += 1;
      }
    }
  }
  return created;
}

async function receiveHandler(req: Request, res: Response): Promise<void> {
  const secret = (process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!secret) {
    // Never accept unsigned messages: without the secret the webhook stays switched off
    console.warn('[whatsapp] Rejected: WHATSAPP_APP_SECRET is not set on this server.');
    res.status(503).json({ error: 'WhatsApp is not configured.' });
    return;
  }

  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  const header = String(req.headers['x-hub-signature-256'] || '');
  if (!raw || !header.startsWith('sha256=')) {
    console.warn('[whatsapp] Rejected: the request has no valid Meta signature header.');
    res.sendStatus(401);
    return;
  }
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const received = header.slice('sha256='.length).trim().toLowerCase();
  if (!safeEqual(received, expected)) {
    console.warn('[whatsapp] Rejected: signature does not match. WHATSAPP_APP_SECRET is probably wrong (Meta > App settings > Basic > App secret).');
    res.sendStatus(401);
    return;
  }

  try {
    const created = await processWhatsAppPayload(req.body);
    console.log(`[whatsapp] Webhook accepted: ${created} new lead(s) created.`);
    res.sendStatus(200);
  } catch (err) {
    console.error('[whatsapp] could not save an incoming message', err instanceof Error ? err.message : err);
    res.sendStatus(500); // Meta will try again
  }
}

export function registerWhatsAppRoutes(app: Express): void {
  app.get('/api/webhooks/whatsapp', verifyHandler);
  app.post('/api/webhooks/whatsapp', receiveHandler);
}