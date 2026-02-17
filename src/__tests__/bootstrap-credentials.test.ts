import { describe, it, expect, vi } from 'vitest';
import { applyBootstrapResponse, RuntimeCredentialsStore } from '../runtime-credentials';
import type { BootstrapTarget, BootstrapResponseData } from '../runtime-credentials';

function makeTarget(overrides?: Partial<BootstrapTarget>): BootstrapTarget {
  return {
    installationId: null,
    runtimeToken: null,
    refreshToken: null,
    credentialsStore: null,
    ...overrides,
  };
}

describe('applyBootstrapResponse', () => {
  it('sets all fields when refresh_token is present', () => {
    const target = makeTarget();
    const data: BootstrapResponseData = {
      installation_id: 'inst-1',
      runtime_token: 'srt_abc',
      refresh_token: 'srf_xyz',
      expires_at: '2026-05-01T00:00:00Z',
    };

    applyBootstrapResponse(target, data);

    expect(target.installationId).toBe('inst-1');
    expect(target.runtimeToken).toBe('srt_abc');
    expect(target.refreshToken).toBe('srf_xyz');
  });

  it('does NOT overwrite existing refreshToken when response has empty string', () => {
    const target = makeTarget({ refreshToken: 'srf_original' });
    const data: BootstrapResponseData = {
      installation_id: 'inst-1',
      runtime_token: 'srt_abc',
      refresh_token: '',
      expires_at: '2026-05-01T00:00:00Z',
    };

    applyBootstrapResponse(target, data);

    expect(target.installationId).toBe('inst-1');
    expect(target.runtimeToken).toBe('srt_abc');
    expect(target.refreshToken).toBe('srf_original');
  });

  it('does NOT overwrite existing refreshToken when response has undefined', () => {
    const target = makeTarget({ refreshToken: 'srf_original' });
    const data: BootstrapResponseData = {
      installation_id: 'inst-1',
      runtime_token: 'srt_abc',
      expires_at: '2026-05-01T00:00:00Z',
    };

    applyBootstrapResponse(target, data);

    expect(target.refreshToken).toBe('srf_original');
  });

  it('calls credentialsStore.update() when store is present', () => {
    const store = new RuntimeCredentialsStore();
    const updateSpy = vi.spyOn(store, 'update');
    const target = makeTarget({ credentialsStore: store });

    const data: BootstrapResponseData = {
      installation_id: 'inst-1',
      runtime_token: 'srt_abc',
      refresh_token: 'srf_xyz',
      expires_at: '2026-05-01T00:00:00Z',
    };

    applyBootstrapResponse(target, data);

    expect(updateSpy).toHaveBeenCalledWith({
      installationId: 'inst-1',
      runtimeToken: 'srt_abc',
      refreshToken: 'srf_xyz',
      expiresAt: '2026-05-01T00:00:00Z',
    });
  });

  it('store.update() guards against empty refreshToken internally', () => {
    const store = new RuntimeCredentialsStore({
      refreshToken: 'srf_original',
    });

    store.update({ refreshToken: '' });

    expect(store.getRefreshToken()).toBe('srf_original');
  });

  it('store.update() guards against undefined refreshToken', () => {
    const store = new RuntimeCredentialsStore({
      refreshToken: 'srf_original',
    });

    store.update({});

    expect(store.getRefreshToken()).toBe('srf_original');
  });
});
