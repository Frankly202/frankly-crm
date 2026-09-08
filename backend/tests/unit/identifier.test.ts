import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  normalizeEmail,
  normalizeInstagramHandle,
} from '../../src/common/utils/identifier.util.js';

describe('Identifier Normalization Utilities', () => {
  describe('normalizePhone', () => {
    it('should format clean E.164 phone numbers with leading plus', () => {
      expect(normalizePhone('+35799123456')).toBe('+35799123456');
      expect(normalizePhone('35799123456')).toBe('+35799123456');
    });

    it('should strip spaces, dashes, and parentheses', () => {
      expect(normalizePhone('+357 (99) 123-456')).toBe('+35799123456');
      expect(normalizePhone('00357 99 123 456')).toBe('+0035799123456');
    });

    it('should return empty string for blank input', () => {
      expect(normalizePhone('   ')).toBe('');
    });
  });

  describe('normalizeEmail', () => {
    it('should lowercase and trim standard emails', () => {
      expect(normalizeEmail('  JOHN.DOE@EXAMPLE.COM  ')).toBe('john.doe@example.com');
    });

    it('should extract email from display name angle bracket format', () => {
      expect(normalizeEmail('John Doe <john.doe@example.com>')).toBe('john.doe@example.com');
      expect(normalizeEmail('"Papantoniou, Andreas" <andreas.p@example.com>')).toBe(
        'andreas.p@example.com',
      );
    });

    it('should return empty string for blank input', () => {
      expect(normalizeEmail('   ')).toBe('');
    });
  });

  describe('normalizeInstagramHandle', () => {
    it('should ensure handle starts with single @ and is lowercased', () => {
      expect(normalizeInstagramHandle('@John_Doe')).toBe('@john_doe');
      expect(normalizeInstagramHandle('john_doe')).toBe('@john_doe');
      expect(normalizeInstagramHandle('@@@FATIMA_STUDY')).toBe('@fatima_study');
    });

    it('should return empty string for blank input', () => {
      expect(normalizeInstagramHandle('   ')).toBe('');
    });
  });
});
