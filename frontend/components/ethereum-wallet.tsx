// frontend/components/ethereum-wallet.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';
import { useEthereumWallet } from '../hooks/use-ethereum-wallet';

export default function EthereumWalletButton() {
  const { isConnected, address, connect, disconnect } = useEthereumWallet();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col items-start justify-between">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-slate-500'}`}></div>
        <span className="text-sm text-slate-300">Ethereum Wallet</span>
      </div>
      {isConnected ? (
        <div className="flex flex-col items-start gap-2">
          <span className="text-sm text-white">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy} className="text-xs border-slate-600 text-slate-300 bg-transparent">
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => disconnect()} className="text-xs border-slate-600 text-slate-300 bg-transparent">
              <Wallet className="w-3 h-3 mr-1" />
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={connect} className="text-xs border-slate-600 text-slate-300 bg-transparent">
          <Wallet className="w-3 h-3 mr-1" />
          Connect
        </Button>
      )}
    </div>
  );
}