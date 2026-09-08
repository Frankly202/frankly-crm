import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import {
  Role,
  LeadCategory,
  LeadStatus,
  ChannelType,
  ActivityType,
  MessageDirection,
  MessageStatus,
} from '@prisma/client';

describe('API Contract & Specification Validation', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const openApiPath = path.join(rootDir, 'docs/api-spec.yaml');
  const postmanPath = path.join(rootDir, 'docs/frankly-crm-postman-collection.json');
  const contractPath = path.join(rootDir, 'docs/API_CONTRACT.md');

  it('should verify docs/api-spec.yaml exists and parses as valid OpenAPI 3.0.3', () => {
    expect(fs.existsSync(openApiPath)).toBe(true);
    const rawContent = fs.readFileSync(openApiPath, 'utf-8');
    const spec = YAML.parse(rawContent);

    expect(spec).toBeDefined();
    expect(spec.openapi).toMatch(/^3\.0\.\d+$/);
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toContain('FranklyEdu');
    expect(spec.info.version).toBe('0.1.0');
    expect(Array.isArray(spec.servers)).toBe(true);
    expect(spec.servers.length).toBeGreaterThan(0);
  });

  it('should ensure all backend routes are documented in the OpenAPI specification', () => {
    const rawContent = fs.readFileSync(openApiPath, 'utf-8');
    const spec = YAML.parse(rawContent);
    const paths = spec.paths;

    const expectedPaths = [
      '/health',
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
      '/auth/logout',
      '/auth/me',
      '/contacts',
      '/contacts/{id}',
      '/leads/dashboard/metrics',
      '/leads',
      '/leads/{id}',
      '/leads/{id}/status',
      '/leads/{id}/assign',
      '/leads/{id}/activities',
      '/conversations',
      '/conversations/{id}',
      '/conversations/{id}/messages',
      '/conversations/{id}/read',
      '/webhooks/whatsapp',
      '/webhooks/instagram',
      '/webhooks/resend',
      '/webhooks/website',
    ];

    for (const expectedPath of expectedPaths) {
      expect(
        paths[expectedPath],
        `Expected path ${expectedPath} to be defined in OpenAPI spec`,
      ).toBeDefined();
    }
  });

  it('should ensure schema enums in OpenAPI match Prisma enums exactly', () => {
    const rawContent = fs.readFileSync(openApiPath, 'utf-8');
    const spec = YAML.parse(rawContent);
    const schemas = spec.components.schemas;

    expect(schemas.Role.enum).toEqual(Object.values(Role));
    expect(schemas.LeadCategory.enum).toEqual(Object.values(LeadCategory));
    expect(schemas.LeadStatus.enum).toEqual(Object.values(LeadStatus));
    expect(schemas.ChannelType.enum).toEqual(Object.values(ChannelType));
    expect(schemas.ActivityType.enum).toEqual(Object.values(ActivityType));
    expect(schemas.MessageDirection.enum).toEqual(Object.values(MessageDirection));
    expect(schemas.MessageStatus.enum).toEqual(Object.values(MessageStatus));
  });

  it('should verify docs/frankly-crm-postman-collection.json is valid Postman v2.1.0', () => {
    expect(fs.existsSync(postmanPath)).toBe(true);
    const rawContent = fs.readFileSync(postmanPath, 'utf-8');
    const collection = JSON.parse(rawContent);

    expect(collection.info).toBeDefined();
    expect(collection.info.schema).toContain('v2.1.0');
    expect(Array.isArray(collection.item)).toBe(true);
    expect(collection.item.length).toBe(7); // 7 folders

    const folderNames = collection.item.map((f: { name: string }) => f.name);
    expect(folderNames).toContain('0. System');
    expect(folderNames).toContain('1. Authentication');
    expect(folderNames).toContain('2. Contacts');
    expect(folderNames).toContain('3. Leads & Activities');
    expect(folderNames).toContain('4. Dashboard Metrics');
    expect(folderNames).toContain('5. Conversations (Unified Inbox)');
    expect(folderNames).toContain('6. Webhooks & Channels');

    const variables = collection.variable.map((v: { key: string }) => v.key);
    expect(variables).toContain('baseUrl');
    expect(variables).toContain('accessToken');
    expect(variables).toContain('refreshToken');
  });

  it('should verify docs/API_CONTRACT.md is comprehensive and documented', () => {
    expect(fs.existsSync(contractPath)).toBe(true);
    const content = fs.readFileSync(contractPath, 'utf-8');
    expect(content.length).toBeGreaterThan(1000);
    expect(content).toContain('Architectural Overview');
    expect(content).toContain('LeadCategory');
    expect(content).toContain('PROPERTY_BUYER_INVESTOR');
    expect(content).toContain('Dashboard Metrics');
    expect(content).toContain('Unified Inbox');
  });
});
