/**
 * RenegadeSwarm - Decentralized AI Model Distribution Network
 * Copyright (C) 2026 DevNullInc & The RenegadeSwarm Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  UserCheck,
  Copy,
  Check,
  Plus,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  Eye,
  EyeOff,
  FolderCog,
  Sliders,
  AlertTriangle,
  Info,
  Lock,
} from 'lucide-react';
import { KeyringEntry, TrustLevel } from '../../protocol/keyring';
import { UserIdentity, LockoutStatus } from '../../shared/ipcContracts';
import { SharingPolicySettings } from '../../protocol/sharingPolicy';

interface SettingsViewProps {
  cmmDbPath: string;
  comfyModelsRoot: string;
  sharingPolicy: SharingPolicySettings;
  onSyncCmmConfig: (dbPath: string, rootPath: string) => Promise<boolean>;
  onUpdateSharingPolicy: (policy: Partial<SharingPolicySettings>) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  cmmDbPath: initialDbPath,
  comfyModelsRoot: initialRootPath,
  sharingPolicy,
  onSyncCmmConfig,
  onUpdateSharingPolicy,
}) => {
  const [activeSection, setActiveSection] = useState<'keyring' | 'identity' | 'paths' | 'privacy'>('keyring');
  const [keyringEntries, setKeyringEntries] = useState<KeyringEntry[]>([]);
  const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);
  const [lockoutStatus, setLockoutStatus] = useState<LockoutStatus | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // New Key Form State
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);
  const [newCreatorName, setNewCreatorName] = useState('');
  const [newPublicKeyHex, setNewPublicKeyHex] = useState('');
  const [newTrustLevel, setNewTrustLevel] = useState<TrustLevel>('VerifiedCreator');
  const [newAlias, setNewAlias] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Generate Identity State
  const [creatorHandleInput, setCreatorHandleInput] = useState('');

  // Import Keyring Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  // Path Configuration State
  const [dbPathInput, setDbPathInput] = useState(initialDbPath);
  const [rootPathInput, setRootPathInput] = useState(initialRootPath);

  const fetchSecurityState = async () => {
    if (!window.renegadeSwarm) return;
    setLoading(true);
    try {
      const [entriesRes, identityRes, lockoutRes] = await Promise.all([
        window.renegadeSwarm.getKeyringEntries(),
        window.renegadeSwarm.getUserIdentity(),
        window.renegadeSwarm.getKeyringLockoutStatus ? window.renegadeSwarm.getKeyringLockoutStatus() : Promise.resolve({ success: false } as any),
      ]);

      if (entriesRes.success && entriesRes.data) {
        setKeyringEntries(entriesRes.data);
      }
      if (identityRes.success) {
        setUserIdentity(identityRes.data || null);
        if (identityRes.data?.creatorName) {
          setCreatorHandleInput(identityRes.data.creatorName);
        }
      }
      if (lockoutRes?.success && lockoutRes?.data) {
        setLockoutStatus(lockoutRes.data);
      }
    } catch (err: any) {
      console.error('Failed to load keyring state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityState();
    const interval = setInterval(async () => {
      if (window.renegadeSwarm?.getKeyringLockoutStatus) {
        const res = await window.renegadeSwarm.getKeyringLockoutStatus();
        if (res.success && res.data) {
          setLockoutStatus(res.data);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatLockoutTime = (seconds: number) => {
    if (seconds <= 0) return 'Ready';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} min`;
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGenerateIdentity = async () => {
    if (!window.renegadeSwarm) return;
    if (lockoutStatus && !lockoutStatus.canGenerate) {
      alert(`Key regeneration is locked for another ${formatLockoutTime(lockoutStatus.lockoutRemainingSeconds)} to prevent blacklist avoidance.`);
      return;
    }

    const isRegen = !!userIdentity;
    if (isRegen) {
      if (!confirm('Generating a new signing key will replace your active key and activate a 24-hour regeneration lockout. Proceed?')) {
        return;
      }
    }

    const name = creatorHandleInput.trim() || 'Renegade Creator';
    setLoading(true);
    try {
      const res = await window.renegadeSwarm.generateIdentity(name);
      if (res.success && res.data) {
        setUserIdentity(res.data);
        if (window.renegadeSwarm.getKeyringLockoutStatus) {
          const lRes = await window.renegadeSwarm.getKeyringLockoutStatus();
          if (lRes.success && lRes.data) setLockoutStatus(lRes.data);
        }
        setStatusMsg({ text: `Generated new Ed25519 signing keypair for @${res.data.creatorName} (Locked for 24h)`, type: 'success' });
        setTimeout(() => setStatusMsg(null), 4000);
      } else {
        alert(res.error || 'Failed to generate identity');
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCreatorKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.renegadeSwarm) return;

    const cleanedKey = newPublicKeyHex.trim().toLowerCase();
    if (cleanedKey.length !== 64) {
      alert('Public Key must be exactly 64 hexadecimal characters (32-byte Ed25519).');
      return;
    }

    try {
      const entry: KeyringEntry = {
        creatorName: newCreatorName.trim(),
        publicKeyHex: cleanedKey,
        trustLevel: newTrustLevel,
        alias: newAlias.trim() || undefined,
        notes: newNotes.trim() || undefined,
        addedAt: Math.floor(Date.now() / 1000),
      };

      const res = await window.renegadeSwarm.addKeyringEntry(entry);
      if (res.success && res.data) {
        setKeyringEntries(res.data);
        setShowAddKeyModal(false);
        setNewCreatorName('');
        setNewPublicKeyHex('');
        setNewAlias('');
        setNewNotes('');
        setStatusMsg({ text: `Added @${entry.creatorName} to Web of Trust Keyring (${entry.trustLevel})`, type: 'success' });
        setTimeout(() => setStatusMsg(null), 3000);
      } else {
        alert(res.error || 'Failed to add creator key');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveKey = async (publicKeyHex: string, creatorName: string) => {
    if (!window.renegadeSwarm) return;
    if (!confirm(`Remove @${creatorName} (${publicKeyHex.substring(0, 16)}...) from your Keyring?`)) return;

    try {
      const res = await window.renegadeSwarm.removeKeyringEntry(publicKeyHex);
      if (res.success && res.data) {
        setKeyringEntries(res.data);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExportKeyring = async () => {
    if (!window.renegadeSwarm) return;
    try {
      const res = await window.renegadeSwarm.exportKeyring();
      if (res.success && res.data) {
        handleCopy(res.data, 'keyring_json');
        setStatusMsg({ text: 'Keyring JSON bundle copied to clipboard!', type: 'success' });
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleImportKeyring = async () => {
    if (!window.renegadeSwarm || !importJsonText.trim()) return;
    try {
      const res = await window.renegadeSwarm.importKeyring(importJsonText.trim());
      if (res.success && res.data) {
        setKeyringEntries(res.data.entries);
        setShowImportModal(false);
        setImportJsonText('');
        setStatusMsg({ text: `Successfully imported ${res.data.importedCount} keys into Keyring!`, type: 'success' });
        setTimeout(() => setStatusMsg(null), 4000);
      } else {
        alert(res.error || 'Invalid Keyring JSON format');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSavePaths = async () => {
    setLoading(true);
    try {
      const ok = await onSyncCmmConfig(dbPathInput, rootPathInput);
      if (ok) {
        setStatusMsg({ text: 'Paths saved and RenegadeCMM connection verified!', type: 'success' });
      } else {
        setStatusMsg({ text: 'Paths saved. CMM database not yet reachable at specified path.', type: 'info' });
      }
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  const getTrustBadge = (level: TrustLevel) => {
    switch (level) {
      case 'VerifiedCreator':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}>
            <ShieldCheck size={12} /> Verified Creator
          </span>
        );
      case 'Community':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '12px',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}>
            <ShieldAlert size={12} /> Community (TOFU)
          </span>
        );
      case 'Blocked':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}>
            <ShieldX size={12} /> Blocked Key
          </span>
        );
      default:
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '12px',
            background: 'rgba(148, 163, 184, 0.15)',
            color: '#94a3b8',
            border: '1px solid rgba(148, 163, 184, 0.3)',
          }}>
            <Info size={12} /> Untrusted
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0, background: 'var(--bg-main)', color: 'var(--text-main)' }}>
      {/* Settings Sub-Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(13, 17, 23, 0.95)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(168, 85, 247, 0.3)',
          }}>
            <KeyRound size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Keyring & Security Preferences</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Ed25519 signing identities, Web of Trust tiers, path bindings, and sharing privacy.
            </p>
          </div>
        </div>

        {/* Section Tabs */}
        <div style={{ display: 'flex', gap: '6px', background: 'rgba(255, 255, 255, 0.04)', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveSection('keyring')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeSection === 'keyring' ? 'var(--accent-purple)' : 'transparent',
              color: activeSection === 'keyring' ? '#fff' : 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <ShieldCheck size={14} /> Web of Trust ({keyringEntries.length})
          </button>
          <button
            onClick={() => setActiveSection('identity')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeSection === 'identity' ? 'var(--accent-purple)' : 'transparent',
              color: activeSection === 'identity' ? '#fff' : 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <UserCheck size={14} /> Creator Identity & Signing
          </button>
          <button
            onClick={() => setActiveSection('paths')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeSection === 'paths' ? 'var(--accent-purple)' : 'transparent',
              color: activeSection === 'paths' ? '#fff' : 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <FolderCog size={14} /> Paths & CMM
          </button>
          <button
            onClick={() => setActiveSection('privacy')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: activeSection === 'privacy' ? 'var(--accent-purple)' : 'transparent',
              color: activeSection === 'privacy' ? '#fff' : 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
          >
            <Sliders size={14} /> Sharing & Privacy
          </button>
        </div>
      </div>

      {/* Status Alert Banner */}
      {statusMsg && (
        <div style={{
          padding: '10px 24px',
          background: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : statusMsg.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          color: statusMsg.type === 'success' ? '#10b981' : statusMsg.type === 'error' ? '#ef4444' : '#60a5fa',
          fontSize: '12px',
          fontWeight: 600,
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {statusMsg.type === 'success' ? <Check size={14} /> : statusMsg.type === 'error' ? <AlertTriangle size={14} /> : <Info size={14} />}
          {statusMsg.text}
        </div>
      )}

      {/* Main Scrollable Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px' }}>
        {/* SECTION 1: WEB OF TRUST KEYRING */}
        {activeSection === 'keyring' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
            {/* Action Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              background: 'rgba(22, 27, 34, 0.8)',
              padding: '16px 20px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
            }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px 0' }}>Trusted Creator Public Keys</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Pre-seeded root keys and community creator pins used to verify model provenance and manifest integrity.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setShowAddKeyModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'var(--accent-purple)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} /> Add Trusted Creator
                </button>
                <button
                  onClick={handleExportKeyring}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
                    fontWeight: 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={14} /> Export Keyring JSON
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
                    fontWeight: 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={14} /> Import Keyring JSON
                </button>
                <button
                  onClick={fetchSecurityState}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
              </div>
            </div>

            {/* Keyring Table */}
            <div style={{
              background: 'rgba(22, 27, 34, 0.6)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'rgba(13, 17, 23, 0.95)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Creator & Alias</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Trust Tier</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Ed25519 Public Key (32-byte / 64-char Hex)</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Notes</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keyringEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No creator keys found in keyring. Click "Add Trusted Creator" or reload defaults.
                      </td>
                    </tr>
                  ) : (
                    keyringEntries.map((entry) => {
                      const isRoot = entry.creatorName === 'TheStygianRenegade' || entry.creatorName === 'DevNullInc';
                      return (
                        <tr
                          key={entry.publicKeyHex}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, color: '#fff' }}>@{entry.creatorName}</span>
                              {isRoot && (
                                <span style={{
                                  fontSize: '9px',
                                  textTransform: 'uppercase',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(168, 85, 247, 0.2)',
                                  color: '#c084fc',
                                  fontWeight: 700,
                                }}>
                                  Root
                                </span>
                              )}
                            </div>
                            {entry.alias && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{entry.alias}</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {getTrustBadge(entry.trustLevel)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <code className="mono" style={{ fontSize: '11px', color: '#38bdf8', background: 'rgba(0, 0, 0, 0.3)', padding: '3px 8px', borderRadius: '4px' }}>
                                {entry.publicKeyHex}
                              </code>
                              <button
                                onClick={() => handleCopy(entry.publicKeyHex, entry.publicKeyHex)}
                                title="Copy 64-character public key"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: copiedField === entry.publicKeyHex ? '#10b981' : 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: '4px',
                                }}
                              >
                                {copiedField === entry.publicKeyHex ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                            {entry.notes || '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {!isRoot ? (
                              <button
                                onClick={() => handleRemoveKey(entry.publicKeyHex, entry.creatorName)}
                                title="Remove key from keyring"
                                style={{
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.2)',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Protected</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 2: USER IDENTITY & MANIFEST SIGNING */}
        {activeSection === 'identity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            {/* Caution Alert */}
            <div style={{
              background: 'rgba(234, 88, 12, 0.12)',
              border: '1px solid rgba(234, 88, 12, 0.3)',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-start',
            }}>
              <AlertTriangle size={22} color="#f97316" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ color: '#fb923c', margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700 }}>
                  Cryptographic Provenance & Private Key Safeguard
                </h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#fed7aa', lineHeight: 1.5 }}>
                  RenegadeSwarm utilizes 32-byte <strong>Ed25519</strong> digital signatures to bind creator identity directly to model files and BitTorrent info hashes.
                  Never share or commit your <strong>Private Key</strong>. Anyone possessing your private key can publish and sign model manifests under your name.
                </p>
              </div>
            </div>

            {/* Current Identity Card */}
            {userIdentity ? (
              <div style={{
                background: 'rgba(22, 27, 34, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '16px',
                      color: '#fff',
                    }}>
                      {userIdentity.creatorName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>@{userIdentity.creatorName}</h3>
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', fontWeight: 600 }}>
                          Active Signing Key
                        </span>
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 600 }}>
                          Machine-Bound AES-256-GCM
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Created: {new Date(userIdentity.createdAt * 1000).toLocaleDateString()}
                        {userIdentity.lastRegeneratedAt && ` (Regenerated: ${new Date(userIdentity.lastRegeneratedAt * 1000).toLocaleDateString()})`}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {lockoutStatus && !lockoutStatus.canGenerate ? (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: '#f59e0b',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}>
                        <Lock size={13} />
                        <span>Regen Locked ({formatLockoutTime(lockoutStatus.lockoutRemainingSeconds)})</span>
                      </div>
                    ) : (
                      <button
                        onClick={handleGenerateIdentity}
                        disabled={loading}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-main)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <RefreshCw size={12} className={loading ? 'spin' : ''} /> Regenerate Keypair
                      </button>
                    )}
                  </div>
                </div>

                {/* Lockout Notice Banner */}
                {lockoutStatus && !lockoutStatus.canGenerate && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: '#fcd34d',
                  }}>
                    <Lock size={14} style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Anti-Abuse Safeguard:</strong> Key regeneration is locked until{' '}
                      <strong>{new Date(lockoutStatus.nextAllowedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>{' '}
                      ({formatLockoutTime(lockoutStatus.lockoutRemainingSeconds)} remaining). This prevents malicious blacklist evasion and identity cycling.
                    </span>
                  </div>
                )}

                {/* Public Key Display */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Public Key (Share this publicly on Hugging Face / CivitAI / GitHub):
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      readOnly
                      value={userIdentity.publicKeyHex}
                      className="mono"
                      style={{
                        flex: 1,
                        background: '#0d1117',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        color: '#38bdf8',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => handleCopy(userIdentity.publicKeyHex, 'pubkey')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 600,
                        fontSize: '12px',
                      }}
                    >
                      {copiedField === 'pubkey' ? <Check size={14} /> : <Copy size={14} />} Copy Public Key
                    </button>
                  </div>
                </div>

                {/* Private Key Display */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#f87171' }}>
                      Private Key (Confidential Signing Seed):
                    </label>
                    <button
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {showPrivateKey ? <EyeOff size={13} /> : <Eye size={13} />} {showPrivateKey ? 'Hide Key' : 'Reveal Key'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      readOnly
                      type={showPrivateKey ? 'text' : 'password'}
                      value={userIdentity.privateKeyHex}
                      className="mono"
                      style={{
                        flex: 1,
                        background: '#0d1117',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        color: '#f87171',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => handleCopy(userIdentity.privateKeyHex, 'privkey')}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 600,
                        fontSize: '12px',
                      }}
                    >
                      {copiedField === 'privkey' ? <Check size={14} /> : <Copy size={14} />} Copy Private Key
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Generate Key Form */
              <div style={{
                background: 'rgba(22, 27, 34, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Initialize Creator Signing Identity</h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  You don't have an Ed25519 signing keypair yet. Create one now to digitally sign models when packaging swarms.
                </p>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={creatorHandleInput}
                    onChange={(e) => setCreatorHandleInput(e.target.value)}
                    placeholder="Enter creator handle / name (e.g. TheStygianRenegade)"
                    style={{
                      flex: 1,
                      background: '#0d1117',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontSize: '13px',
                      color: 'var(--text-main)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handleGenerateIdentity}
                    disabled={loading}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      background: 'var(--accent-purple)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <KeyRound size={16} /> Generate Keypair
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: PATHS & RENEGADE CMM */}
        {activeSection === 'paths' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            <div style={{
              background: 'rgba(22, 27, 34, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 700 }}>ComfyUI & RenegadeCMM Integration Paths</h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Configure local database and model directories for automatic folder routing and zero-lag metadata sync.
                </p>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  RenegadeCMM SQLite Database Path (`renegadecmm.sqlite`):
                </label>
                <input
                  type="text"
                  value={dbPathInput}
                  onChange={(e) => setDbPathInput(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  ComfyUI Models Root Directory (`models/`):
                </label>
                <input
                  type="text"
                  value={rootPathInput}
                  onChange={(e) => setRootPathInput(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                  Downloaded models are automatically promoted into subfolders (`checkpoints/`, `loras/`, `vae/`, `unet/`, `clip/`) based on detected type.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px' }}>
                <button
                  onClick={handleSavePaths}
                  disabled={loading}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    background: 'var(--accent-purple)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <FolderCog size={16} /> Save & Test Path Bindings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: SHARING & PRIVACY */}
        {activeSection === 'privacy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            <div style={{
              background: 'rgba(22, 27, 34, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 700 }}>Opt-In Privacy & Model Sharing Governance</h3>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                  Control default seeding behavior and privacy filters to protect proprietary models and unpublished LoRAs.
                </p>
              </div>

              {/* Sharing Mode Selector */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>Default Sharing Mode</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                    Strict <strong>Opt-In Only</strong> prevents any local model from being seeded without explicit approval.
                  </p>
                </div>
                <select
                  value={sharingPolicy.mode}
                  onChange={(e) => onUpdateSharingPolicy({ mode: e.target.value as any })}
                  style={{
                    background: '#0d1117',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    outline: 'none',
                  }}
                >
                  <option value="opt_in_only">Opt-In Only (Strict / Recommended)</option>
                  <option value="filter_blacklist">Blacklist Filtered</option>
                  <option value="disabled">Disable All Sharing</option>
                </select>
              </div>

              {/* Auto Share Completed Downloads */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>Auto-Seed Completed Swarm Downloads</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                    Automatically seed torrent packages that you personally downloaded from the swarm until your ratio cap is reached.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={sharingPolicy.autoSeedDownloads}
                  onChange={(e) => onUpdateSharingPolicy({ autoSeedDownloads: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-purple)' }}
                />
              </div>

              {/* Allow NSFW Sharing */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
              }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>Allow NSFW Model Seeding</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                    Permit models marked with NSFW tags to be seeded when explicitly opted-in.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={sharingPolicy.allowNsfwSharing}
                  onChange={(e) => onUpdateSharingPolicy({ allowNsfwSharing: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-purple)' }}
                />
              </div>

              {/* Blacklisted Folders */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Blacklisted Directory Name Patterns (Never Seeded):
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {sharingPolicy.excludedFolderPatterns.map((folder: string) => (
                    <span
                      key={folder}
                      style={{
                        padding: '4px 10px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                      }}
                    >
                      /{folder}/
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Add Trusted Creator */}
      {showAddKeyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }}>
          <div style={{
            background: '#161b22',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 700 }}>Add Trusted Creator to Keyring</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Pin an author's 64-character Ed25519 public key to elevate models signed by them to Verified Creator tier.
            </p>

            <form onSubmit={handleAddCreatorKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Creator Name / Handle *
                </label>
                <input
                  required
                  type="text"
                  value={newCreatorName}
                  onChange={(e) => setNewCreatorName(e.target.value)}
                  placeholder="e.g. LyKON or black-forest-labs"
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Ed25519 Public Key (64 hex characters) *
                </label>
                <input
                  required
                  type="text"
                  value={newPublicKeyHex}
                  onChange={(e) => setNewPublicKeyHex(e.target.value)}
                  placeholder="e.g. 4a5c88b2e118b6284f18b3ec48866164287d3d2ae3b0c44298fc1c149afbf4c8"
                  className="mono"
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#38bdf8',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Trust Tier
                  </label>
                  <select
                    value={newTrustLevel}
                    onChange={(e) => setNewTrustLevel(e.target.value as TrustLevel)}
                    style={{
                      width: '100%',
                      background: '#0d1117',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: 'var(--text-main)',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  >
                    <option value="VerifiedCreator">Verified Creator (Green)</option>
                    <option value="Community">Community (Amber)</option>
                    <option value="Untrusted">Untrusted (Gray)</option>
                    <option value="Blocked">Blocked Key (Red)</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Alias (Optional)
                  </label>
                  <input
                    type="text"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    placeholder="e.g. SDXL DreamShaper Author"
                    style={{
                      width: '100%',
                      background: '#0d1117',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: 'var(--text-main)',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="e.g. Key verified from Civitai bio link"
                  style={{
                    width: '100%',
                    background: '#0d1117',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: 'var(--text-main)',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddKeyModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '8px',
                    background: 'var(--accent-purple)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Pin Creator Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Import Keyring JSON */}
      {showImportModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }}>
          <div style={{
            background: '#161b22',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '600px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 700 }}>Import Trusted Creators JSON</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Paste a JSON array of Keyring entries exported from another RenegadeSwarm instance or community curator.
            </p>

            <textarea
              rows={8}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder={`[\n  {\n    "creatorName": "LyKON",\n    "publicKeyHex": "4a5c88b2e118b6284f18b3ec48866164287d3d2ae3b0c44298fc1c149afbf4c8",\n    "trustLevel": "VerifiedCreator",\n    "alias": "SDXL Creator",\n    "addedAt": 1723456789\n  }\n]`}
              className="mono"
              style={{
                width: '100%',
                background: '#0d1117',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '12px',
                color: '#38bdf8',
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'vertical',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportKeyring}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  background: 'var(--accent-purple)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Import Key Bundle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
