import { describe, it, expect } from 'vitest';
import {
  parsePaginationParams,
  buildPaginationMeta,
} from '../../src/common/utils/pagination.util.js';

describe('Pagination Utility', () => {
  it('should parse default pagination when query is empty', () => {
    const params = parsePaginationParams({});
    expect(params).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
  });

  it('should parse custom page and limit and compute skip correctly', () => {
    const params = parsePaginationParams({ page: '3', limit: '15' });
    expect(params).toEqual({
      page: 3,
      limit: 15,
      skip: 30,
      take: 15,
    });
  });

  it('should clamp limit to max 100 and min 1', () => {
    const paramsMax = parsePaginationParams({ limit: 500 });
    expect(paramsMax.limit).toBe(100);

    const paramsMin = parsePaginationParams({ limit: -5, page: -2 });
    expect(paramsMin.limit).toBe(1);
    expect(paramsMin.page).toBe(1);
    expect(paramsMin.skip).toBe(0);
  });

  it('should compute pagination metadata correctly', () => {
    const meta = buildPaginationMeta(45, 2, 20);
    expect(meta).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
    });
  });

  it('should return at least 1 totalPage even if total is 0', () => {
    const meta = buildPaginationMeta(0, 1, 20);
    expect(meta.totalPages).toBe(1);
  });
});
