import type { Request, Response } from 'express';

jest.mock('../../src/services/ingest/s3', () => ({ getManifest: jest.fn() }));

import {
  requireUser,
  getUserId,
  checkRepoOwnership,
  authEnabled,
} from '../../src/middleware/auth';
import { getManifest } from '../../src/services/ingest/s3';

const mockGetManifest = getManifest as jest.Mock;

describe('auth middleware (no Clerk key configured)', () => {
  it('reports auth disabled', () => {
    expect(authEnabled).toBe(false);
  });

  it('requireUser assigns the anonymous user and continues', () => {
    const req = {} as Request;
    const next = jest.fn();
    requireUser(req, {} as Response, next);
    expect(req.userId).toBe('anonymous');
    expect(getUserId(req)).toBe('anonymous');
    expect(next).toHaveBeenCalled();
  });
});

describe('checkRepoOwnership', () => {
  beforeEach(() => mockGetManifest.mockReset());

  it('returns notfound when the manifest is missing', async () => {
    mockGetManifest.mockRejectedValueOnce(new Error('NoSuchKey'));
    expect(await checkRepoOwnership('r', 'u')).toBe('notfound');
  });

  it('returns ok when the owner matches', async () => {
    mockGetManifest.mockResolvedValueOnce({ ownerUserId: 'u' });
    expect(await checkRepoOwnership('r', 'u')).toBe('ok');
  });

  it('returns ok for legacy repos with no recorded owner', async () => {
    mockGetManifest.mockResolvedValueOnce({});
    expect(await checkRepoOwnership('r', 'u')).toBe('ok');
  });

  it('returns forbidden when a different user owns the repo', async () => {
    mockGetManifest.mockResolvedValueOnce({ ownerUserId: 'someone-else' });
    expect(await checkRepoOwnership('r', 'u')).toBe('forbidden');
  });
});
