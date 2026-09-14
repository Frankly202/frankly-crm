import { Request, Response, NextFunction } from 'express';
import { ChannelType } from '@prisma/client';
import { getChannelAdapter } from './adapters/channel-registry.js';
import { webhookService } from './webhook.service.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import { verifyMetaChallengeToken } from './utils/meta-signature.util.js';

export class WebhookController {
  /**
   * Meta challenge verification for WhatsApp, Instagram, and Messenger.
   */
  async verifyMetaChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      const verifiedChallenge = verifyMetaChallengeToken(mode, token, challenge);
      res.status(200).send(verifiedChallenge);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unified inbound webhook handler for all channels.
   * Processes both inbound messages and asynchronous status receipts (sent/delivered/read/failed).
   */
  async handleInbound(
    req: Request,
    res: Response,
    next: NextFunction,
    channel: ChannelType,
  ): Promise<void> {
    try {
      const adapter = getChannelAdapter(channel);

      // Verify webhook signature (fails closed if invalid)
      const isValid = adapter.verifyWebhookSignature(req);
      if (!isValid) {
        throw new UnauthorizedError(`Invalid webhook signature for channel ${channel}`);
      }

      // Process status updates (e.g. Meta delivered, read, failed status callbacks)
      const statusUpdates = adapter.normalizeStatusUpdates
        ? await adapter.normalizeStatusUpdates(req.body)
        : [];

      const statusResults = [];
      for (const update of statusUpdates) {
        const updatedMsg = await webhookService.updateMessageStatus(update);
        if (updatedMsg) {
          statusResults.push({
            messageId: updatedMsg.id,
            externalMessageId: updatedMsg.externalMessageId,
            status: updatedMsg.status,
            rawStatus: update.rawStatus,
          });
        }
      }

      // Normalize and ingest inbound messages
      const normalizedMessages = await adapter.normalizeInboundPayload(req.body);
      const messageResults = [];
      for (const msg of normalizedMessages) {
        const result = await webhookService.ingestInboundMessage(msg);
        messageResults.push({
          messageId: result.message.id,
          externalMessageId: result.message.externalMessageId,
          deduplicated: result.deduplicated ?? false,
          leadId: result.lead.id,
          contactId: result.contact.id,
        });
      }

      res.status(200).json({
        success: true,
        data: {
          channel,
          processedCount: messageResults.length + statusResults.length,
          messages: messageResults,
          statuses: statusResults,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}


export const webhookController = new WebhookController();
