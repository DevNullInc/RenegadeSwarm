/**
 * RenegadeSwarm - Decentralized AI Model Distribution Network
 * Copyright (C) 2026 DevNullInc & The RenegadeSwarm Contributors
 */

import { describe, it, expect } from 'vitest';
import { debugLogManager } from '../src/main/telemetry/debugLogManager';

describe('Debug Diagnostics & Logging Subsystem', () => {
  it('should buffer and categorize structured diagnostic log events', () => {
    debugLogManager.logInfo('TRACKER', 'UDP Announce dispatched to opentrackr', { txId: 12345 });
    debugLogManager.logWarn('CMM', 'CMM bridge connection re-ping requested');
    debugLogManager.logError('SECURITY', 'Rejected quarantined file with path traversal');

    const logs = debugLogManager.getLogEvents(undefined, 100);
    expect(logs.length).toBeGreaterThanOrEqual(3);

    const errorLogs = debugLogManager.getLogEvents('error', 100);
    expect(errorLogs.some((l) => l.subsystem === 'SECURITY')).toBe(true);

    const warnLogs = debugLogManager.getLogEvents('warn', 100);
    expect(warnLogs.some((l) => l.subsystem === 'CMM')).toBe(true);
  });

  it('should collect system runtime diagnostics', () => {
    const diag = debugLogManager.getSystemDiagnostics();
    expect(diag).toBeDefined();
    expect(diag.appVersion).toContain('v0.3.0');
    expect(diag.hardwareHashing).toContain('AVX2');
    expect(diag.listenPort).toBeGreaterThan(0);
    expect(diag.memoryUsage.rss).toBeGreaterThan(0);
  });

  it('should provide tab-specific telemetry metrics', () => {
    const dashTelemetry = debugLogManager.getTabTelemetry('dashboard');
    expect(dashTelemetry.tabId).toBe('dashboard');
    expect(dashTelemetry.metrics.bep15UdpAnnounceReady).toBe(true);

    const discTelemetry = debugLogManager.getTabTelemetry('discovery');
    expect(discTelemetry.tabId).toBe('discovery');
    expect(discTelemetry.metrics.creatorSigningAlgorithm).toContain('Ed25519');

    const seederTelemetry = debugLogManager.getTabTelemetry('seeder');
    expect(seederTelemetry.tabId).toBe('seeder');
    expect(seederTelemetry.metrics.safetensorsHeaderMaxBudget).toContain('100MB');
  });

  it('should support clearing log events', () => {
    debugLogManager.clearLogs();
    const logs = debugLogManager.getLogEvents(undefined, 100);
    // After clearing, only the system clearing notification exists
    expect(logs.length).toBe(1);
    expect(logs[0].message).toContain('Diagnostic console logs cleared');
  });
});
