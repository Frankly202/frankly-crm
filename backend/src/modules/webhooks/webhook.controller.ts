import { Request, Response, NextFunction } from 'express';
import { ChannelType } from '@prisma/client';
import { getChannelAdapter } from './adapters/channel-registry.js';
import { webhookService } from './webhook.service.js';
import { UnauthorizedError, BadRequestError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';

export class WebhookController {
  /**
   * Meta challenge verification for WhatsApp and Instagram.
   */
  async verifyMetaChallenge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      if (mode === 'subscribe') {
        const configuredToken = process.env['META_VERIFY_TOKEN'] || env.META_VERIFY_TOKEN;

        // Fail closed if token is not configured in production
        if (env.NODE_ENV === 'production' && !configuredToken) {
          throw new UnauthorizedError('Webhook verification token is not configured');
        }

        if (configuredToken && token !== configuredToken) {
          throw new UnauthorizedError('Invalid webhook verification token');
        }

        if (!configuredToken && token !== 'frankly_test_verify_token') {
          throw new UnauthorizedError('Invalid verification token');
        }

        res.status(200).send(challenge);
        return;
      }

      throw new BadRequestError('Invalid verification mode');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unified inbound webhook handler for all channels.
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

      // Normalize inbound payload into common structure
      const normalizedMessages = await adapter.normalizeInboundPayload(req.body);

      // Ingest each message through the domain pipeline
      const results = [];
      for (const msg of normalizedMessages) {
        const result = await webhookService.ingestInboundMessage(msg);
        results.push({
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
          processedCount: results.length,
          messages: results,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const webhookController = new WebhookController();
