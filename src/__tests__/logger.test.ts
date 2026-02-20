import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SekuireLogger } from '../logger';

const mockPost = vi.fn();

vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        post: mockPost,
      })),
    },
  };
});

describe('SekuireLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { events_logged: 1 } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('construction', () => {
    it('should construct with default config', () => {
      const logger = new SekuireLogger({ sekuireId: 'test-id', fallback: 'silent' });
      const status = logger.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.bufferedEvents).toBe(0);
      expect(status.fallbackMode).toBe('silent');
      logger.setEnabled(false);
    });

    it('should construct disabled', () => {
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        enabled: false,
        fallback: 'silent',
      });
      expect(logger.getStatus().enabled).toBe(false);
    });

    it('should construct without apiBaseUrl', () => {
      const logger = new SekuireLogger({ sekuireId: 'test-id', fallback: 'silent' });
      expect(logger.getStatus().apiAvailable).toBe(false);
      logger.setEnabled(false);
    });

    it('should construct with apiBaseUrl', () => {
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        apiBaseUrl: 'http://localhost:9300',
        fallback: 'silent',
      });
      expect(logger.getStatus().apiAvailable).toBe(true);
      logger.setEnabled(false);
    });
  });

  describe('buffer management', () => {
    it('should batch events in buffer', () => {
      const logger = new SekuireLogger({ sekuireId: 'test-id', fallback: 'silent' });
      logger.logEvent('model_call', 'info', { msg: 'a' });
      logger.logEvent('model_call', 'info', { msg: 'b' });
      expect(logger.getStatus().bufferedEvents).toBe(2);
      logger.setEnabled(false);
    });

    it('should auto-flush when batchSize reached', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        batchSize: 3,
        fallback: 'console',
      });

      logger.logEvent('model_call', 'info', { msg: '1' });
      logger.logEvent('model_call', 'info', { msg: '2' });
      logger.logEvent('model_call', 'info', { msg: '3' });

      await vi.advanceTimersByTimeAsync(0);
      expect(logger.getStatus().bufferedEvents).toBe(0);
      writeSpy.mockRestore();
      logger.setEnabled(false);
    });

    it('should evict oldest events on overflow', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        maxBufferSize: 5,
        batchSize: 100,
        fallback: 'console',
      });

      for (let i = 0; i < 6; i++) {
        logger.logEvent('model_call', 'info', { i });
      }

      expect(logger.getStatus().bufferedEvents).toBe(5);
      expect(logger.getStatus().overflowEventsTotal).toBeGreaterThan(0);
      writeSpy.mockRestore();
      logger.setEnabled(false);
    });
  });

  describe('fallback modes', () => {
    it('should write to stdout in console mode', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        fallback: 'console',
      });

      logger.logEvent('model_call', 'info', { msg: 'test' });
      await logger.flush();

      const calls = writeSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('test')
      );
      expect(calls.length).toBeGreaterThan(0);
      const parsed = JSON.parse(calls[0][0] as string);
      expect(parsed.event_type).toBe('model_call');

      writeSpy.mockRestore();
      logger.setEnabled(false);
    });

    it('should drop events in silent mode', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        fallback: 'silent',
      });

      logger.logEvent('model_call', 'info', { msg: 'silent-test' });
      await logger.flush();

      const calls = writeSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('silent-test')
      );
      expect(calls.length).toBe(0);

      writeSpy.mockRestore();
      logger.setEnabled(false);
    });

    it('should write NDJSON to file in file mode', async () => {
      const fallbackFilePath = path.join(
        os.tmpdir(),
        `sekuire-logger-${Date.now()}-${Math.random().toString(16).slice(2)}.ndjson`
      );
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        fallback: 'file',
        fallbackFilePath,
      });

      logger.logEvent('model_call', 'info', { msg: 'file-test' });
      await logger.flush();
      await logger.shutdown();

      const content = await fs.readFile(fallbackFilePath, 'utf-8');
      expect(content).toContain('file-test');

      const stdoutCalls = writeSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('file-test')
      );
      expect(stdoutCalls.length).toBe(0);

      writeSpy.mockRestore();
      await fs.rm(fallbackFilePath, { force: true });
    });
  });

  describe('retry semantics', () => {
    it('should queue failed batch for retry', async () => {
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        apiBaseUrl: 'http://localhost:9300',
        fallback: 'silent',
        maxRetries: 3,
      });
      mockPost.mockReset();
      mockPost.mockResolvedValue({ data: { events_logged: 1 } });
      mockPost.mockRejectedValueOnce(new Error('network error'));

      logger.logEvent('model_call', 'info', { msg: 'retry-test' });
      await logger.flush();

      expect(logger.getStatus().retryQueueSize).toBe(1);

      logger.logEvent('model_call', 'info', { msg: 'trigger-retry' });
      await logger.flush();

      expect(logger.getStatus().retryQueueSize).toBe(0);
      logger.setEnabled(false);
    });

    it('should fall back after maxRetries exhausted', async () => {
      const onError = vi.fn();
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        apiBaseUrl: 'http://localhost:9300',
        fallback: 'console',
        maxRetries: 2,
        onError,
      });
      mockPost.mockReset();
      mockPost.mockRejectedValue(new Error('persistent error'));

      logger.logEvent('model_call', 'info', { msg: 'will-fail' });
      await logger.flush();
      expect(logger.getStatus().retryQueueSize).toBe(1);

      for (let i = 0; i < 3; i++) {
        logger.logEvent('model_call', 'info', { msg: `pad-${i}` });
        await logger.flush();
      }

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ operation: 'retry_exhausted' })
      );

      writeSpy.mockRestore();
      logger.setEnabled(false);
    });
  });

  describe('lifecycle', () => {
    it('should flush remaining events on shutdown', async () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        fallback: 'console',
      });

      logger.logEvent('model_call', 'info', { msg: 'shutdown-test' });
      await logger.shutdown();

      expect(logger.getStatus().bufferedEvents).toBe(0);
      writeSpy.mockRestore();
    });

    it('should toggle timers with setEnabled', () => {
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        fallback: 'silent',
      });

      logger.setEnabled(false);
      expect(logger.getStatus().enabled).toBe(false);

      logger.setEnabled(true);
      expect(logger.getStatus().enabled).toBe(true);

      logger.setEnabled(false);
    });
  });

  describe('status', () => {
    it('should report buffered count and overflow total', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        maxBufferSize: 3,
        batchSize: 100,
        fallback: 'console',
      });

      logger.logEvent('model_call', 'info', { i: 0 });
      logger.logEvent('model_call', 'info', { i: 1 });
      logger.logEvent('model_call', 'info', { i: 2 });
      logger.logEvent('model_call', 'info', { i: 3 });

      const status = logger.getStatus();
      expect(status.bufferedEvents).toBe(3);
      expect(status.overflowEventsTotal).toBeGreaterThan(0);

      writeSpy.mockRestore();
      logger.setEnabled(false);
    });

    it('should not log events when disabled', () => {
      const logger = new SekuireLogger({
        sekuireId: 'test-id',
        enabled: false,
        fallback: 'silent',
      });

      logger.logEvent('model_call', 'info', { msg: 'should-not-buffer' });
      expect(logger.getStatus().bufferedEvents).toBe(0);
    });
  });
});
