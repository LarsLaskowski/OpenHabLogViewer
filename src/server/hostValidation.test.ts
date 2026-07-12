import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type express from 'express';
import { createHostValidator } from './hostValidation.js';

interface FakeResponse {
  statusCode: number | null;
  body: unknown;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

function createFakeResponse(): FakeResponse {
  return {
    statusCode: null,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function runMiddleware(allowedHosts: string[], hostHeader: string | undefined): { nextCalled: boolean; response: FakeResponse } {
  const middleware = createHostValidator(allowedHosts);
  const request = { headers: { host: hostHeader } } as unknown as express.Request;
  const response = createFakeResponse();
  let nextCalled = false;
  middleware(request, response as unknown as express.Response, () => {
    nextCalled = true;
  });
  return { nextCalled, response };
}

describe('createHostValidator', () => {
  it('allows a listed host and ignores the port', () => {
    const { nextCalled, response } = runMiddleware(['myhost'], 'myhost:9001');
    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, null);
  });

  it('rejects an unlisted host with a 403 JSON body', () => {
    const { nextCalled, response } = runMiddleware(['myhost'], 'evil.example');
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { error: 'Forbidden host' });
  });

  it('compares case-insensitively', () => {
    const { nextCalled } = runMiddleware(['myhost'], 'MyHost:9001');
    assert.equal(nextCalled, true);
  });

  it('keeps a bracketed IPv6 literal intact when stripping the port', () => {
    const allowed = runMiddleware(['[::1]'], '[::1]:9001');
    assert.equal(allowed.nextCalled, true);

    const bare = runMiddleware(['[::1]'], '[::1]');
    assert.equal(bare.nextCalled, true);
  });

  it('rejects a missing Host header', () => {
    const { nextCalled, response } = runMiddleware(['myhost'], undefined);
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
  });
});
