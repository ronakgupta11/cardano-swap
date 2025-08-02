import { useAccount, useConnect, useDisconnect } from 'wagmi';

export function useEthereumWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const connectWallet = () => {
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    }
  };

  return {
    address,
    isConnected,
    isConnecting: isPending,
    connect: connectWallet,
    disconnect,
  };
}
