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

import React from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { DiscoveredModelWithTrust } from '../../protocol/discoveryTypes';

interface AmberWarningModalProps {
  model: DiscoveredModelWithTrust;
  isOpen: boolean;
  onClose: () => void;
  onProceed: (model: DiscoveredModelWithTrust) => void;
}

export const AmberWarningModal: React.FC<AmberWarningModalProps> = ({
  model,
  isOpen,
  onClose,
  onProceed,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-panel">
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '6px',
          }}
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={22} color="#f59e0b" />
          </div>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
              Unverified Community Model Notice
            </h3>
            <p style={{ fontSize: '12px', color: 'rgba(245, 158, 11, 0.85)', marginTop: '2px' }}>
              This model was discovered via peer swarm broadcast without a pinned creator key.
            </p>
          </div>
        </div>

        {/* Model Card Details */}
        <div style={{
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{model.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Type: <span style={{ color: '#fff' }}>{model.modelType}</span> • Base:{' '}
                <span style={{ color: '#fff' }}>{model.baseModel || 'Unknown'}</span>
              </div>
            </div>
            <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              Community
            </span>
          </div>

          <div style={{
            fontSize: '11px',
            padding: '8px 10px',
            borderRadius: '6px',
            background: 'rgba(0, 0, 0, 0.4)',
            color: 'var(--text-secondary)',
            wordBreak: 'break-all',
          }} className="mono">
            <div><span style={{ color: 'var(--text-muted)' }}>InfoHash: </span>{model.infoHash}</div>
            <div style={{ marginTop: '2px' }}><span style={{ color: 'var(--text-muted)' }}>Creator: </span>{model.creator} {model.creatorPublicKey ? `(${model.creatorPublicKey.slice(0, 12)}...)` : '(No key attached)'}</div>
          </div>
        </div>

        {/* Security Disclosures */}
        <div style={{
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '12px 14px',
          marginBottom: '20px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontWeight: 600, marginBottom: '6px' }}>
            <ShieldAlert size={14} />
            <span>Automatic Endpoint Protections Active:</span>
          </div>
          <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', lineHeight: 1.4 }}>
            <li><strong>Quarantine Staging:</strong> Downloads to an isolated <code style={{ color: '#06b6d4' }}>.quarantine/</code> directory.</li>
            <li><strong>Multi-Pass Inspection:</strong> Rejects executables, scripts, and ZIP polyglots.</li>
            <li><strong>Zero-Execution Guarantee:</strong> Tensors are isolated and never executed.</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '12px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onProceed(model);
            }}
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#000',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle2 size={15} />
            <span>Proceed to Pre-Download Verification</span>
          </button>
        </div>
      </div>
    </div>
  );
};
