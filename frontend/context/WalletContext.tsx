// frontend/context/WalletContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { BrowserWallet } from '@meshsdk/core';

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  wallet: BrowserWallet | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<BrowserWallet | null>(null);

  const connect = async () => {
    const availableWallets = await BrowserWallet.getAvailableWallets();
    if (availableWallets.length > 0) {
      const selectedWallet = availableWallets[0];
      const walletInstance = await BrowserWallet.enable(selectedWallet.name);
      setIsConnected(true);
      const addresses = await walletInstance.getUsedAddresses();
      setAddress(addresses[0]);
      setWallet(walletInstance);
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setAddress(null);
    setWallet(null);
  };

  return (
    <WalletContext.Provider value={{ isConnected, address, connect, disconnect, wallet }}>
      {children}
    </WalletContext.Provider>
  );
};

export const useCardanoWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useCardanoWallet must be used within a WalletProvider');
  }
  return context;
};