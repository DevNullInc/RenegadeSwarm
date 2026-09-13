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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border border-amber-500/50 bg-[#0d1117] p-6 shadow-2xl shadow-amber-950/40">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Unverified Community Model Notice
            </h3>
            <p className="text-xs text-amber-300/80 mt-0.5">
              This model was discovered via peer swarm broadcast without a pinned creator key.
            </p>
          </div>
        </div>

        {/* Model Card Details */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 mb-4 space-y-2.5">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm font-semibold text-white">{model.title}</div>
              <div className="text-xs text-zinc-400">
                Type: <span className="text-zinc-200">{model.modelType}</span> • Base:{' '}
                <span className="text-zinc-200">{model.baseModel || 'Unknown'}</span>
              </div>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-medium border bg-amber-500/10 text-amber-300 border-amber-500/30">
              ⚪ Unverified / Community
            </span>
          </div>

          <div className="text-xs font-mono bg-black/40 rounded p-2 text-zinc-400 break-all space-y-1">
            <div>
              <span className="text-zinc-500">InfoHash: </span>
              {model.infoHash}
            </div>
            <div>
              <span className="text-zinc-500">Creator: </span>
              {model.creator} {model.creatorPublicKey ? `(${model.creatorPublicKey.slice(0, 12)}...)` : '(No key attached)'}
            </div>
          </div>
        </div>

        {/* Security Disclosures */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3.5 mb-6 space-y-2 text-xs text-zinc-300">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            Automatic Endpoint Protections Active:
          </div>
          <ul className="list-disc list-inside space-y-1 text-zinc-400 pl-1">
            <li>
              <span className="text-zinc-300">Quarantine Staging:</span> Weights will download to an isolated <code className="text-zinc-300">.quarantine/</code> folder.
            </li>
            <li>
              <span className="text-zinc-300">Multi-Pass Validation:</span> Deep magic byte checks reject Windows PE, ELF, Mach-O executables, scripts, and ZIP polyglots.
            </li>
            <li>
              <span className="text-zinc-300">Zero-Execution Guarantee:</span> Weight tensors are never executed and cannot run arbitrary code.
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              onProceed(model);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-950/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <CheckCircle2 className="h-4 w-4" />
            Proceed to Pre-Download Verification
          </button>
        </div>
      </div>
    </div>
  );
};
