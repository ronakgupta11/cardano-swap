"use client"

import { use, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { ArrowUpDown, ChevronDown, Wallet, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useCardanoWallet } from "@/context/WalletContext"
import CardanoWalletButton from "./cardano-wallet"
import EthereumWalletButton from "./ethereum-wallet"
import { computeHashlock, generateRandomSecret } from "@/lib/utils"
import { useEthereumWallet } from "@/hooks/use-ethereum-wallet"
import { storeSecretInLocalStorage } from "@/lib/utils"
import { signOrder, createOrderHash } from "@/lib/ethUtils"
import { ADDRESSES } from "@/lib/constants"
import LimitOrderProtocolABI from "@/lib/LimitOrderProtocol.json"
import { parseEther } from "viem"
import { readContract, waitForTransactionReceipt, writeContract } from "@wagmi/core"
import { config } from "@/lib/wagmi"
import { pstruct, bs, int, PPubKeyHash, Value, Script } from "@harmoniclabs/plu-ts"
import UTxOUtils from "@/lib/utxo"
import { pBSToData, pIntToData, pByteString } from "@harmoniclabs/plu-ts"
import blockfrost from "@/lib/blockfrost"
import getTxBuilder from "@/lib/getTxBuilder"

import { ScriptType, CredentialType, Address, Credential } from '@harmoniclabs/plu-ts';
import scriptData from "@/testnet/atomic-swap.plutus.json"
import authVaultData from "@/testnet/auth-vault.plutus.json"
import { toPlutsUtxo } from "@/lib/meshUtils"


// import { ethers } from "ethers"
const AuthVaultDatum = pstruct({
  AuthVaultDatum: {
      maker_pkh: PPubKeyHash.type,
      expected_escrow_script_hash: bs,
      maker_input_value: int
  }
});

interface Token {
  symbol: string
  name: string
  chain: string
  icon: string
  price: number
  disabled?: boolean,
  address?: string
}
interface EvmToCardanoOrderParams {
  makerSrcAddress: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  makerDstAddress: string;
  hashlock: string;
  salt: number;
  expiresAt: Date;
}

interface CardanoToEvmOrderParams {
  fromAmount: string;
  authVaultAddr: string;
  script: { hash: Buffer }; // Assuming script has a hash property of type Buffer
}

const evmTokens: Token[] = [
  { symbol: "ETH", name: "Ethereum", chain: "Ethereum", icon: "🔷", price: 3657.65 ,address: "0x0000000000000000000000000000000000000000"},
  { symbol: "BTC", name: "Bitcoin", chain: "Bitcoin", icon: "₿", price: 65432.1, disabled: true },
  { symbol: "BNB", name: "BNB", chain: "BNB Chain", icon: "🟡", price: 777.41, disabled: true },
  { symbol: "MATIC", name: "Polygon", chain: "Polygon", icon: "🟣", price: 0.85, disabled: true },
  { symbol: "AVAX", name: "Avalanche", chain: "Avalanche", icon: "🔺", price: 42.15, disabled: true },
]

const cardanoToken: Token = {
  symbol: "ADA",
  name: "Cardano",
  chain: "Cardano",
  icon: "🔵",
  price: 0.45,
  address: "0x0000000000000000000000000000000000000000"
}

interface SwapInterfaceProps {
  isEvmWalletConnected: boolean
  onEvmWalletConnect: () => void
}

export function SwapInterface({
  isEvmWalletConnected,
}: SwapInterfaceProps) {
  const [fromToken, setFromToken] = useState<Token>(evmTokens[0])
  const [fromAmount, setFromAmount] = useState("0")
  const [toAmount, setToAmount] = useState("0")
  const [swapDirection, setSwapDirection] = useState<"evm-to-cardano" | "cardano-to-evm">("evm-to-cardano")
  const { wallet:cardanoWallet, isConnected, address:cardanoAddress } = useCardanoWallet();
  const { address:evmAddress } = useEthereumWallet();
  const script = Script.fromCbor(scriptData.cborHex, ScriptType.PlutusV3);;
  const scriptAddr = new Address("testnet", new Credential(CredentialType.Script, script.hash));


   const authVaultScript = Script.fromCbor(authVaultData.cborHex,  ScriptType.PlutusV3);
   const authVaultAddr = new Address("testnet", new Credential(CredentialType.Script, authVaultScript.hash));


  const [isSwapping, setIsSwapping] = useState(false)
  const { toast } = useToast()

  const handleSwapDirection = () => {
    setSwapDirection((prev) => (prev === "evm-to-cardano" ? "cardano-to-evm" : "evm-to-cardano"))
    // Recalculate amounts when direction changes
    if (swapDirection === "evm-to-cardano") {
      setToAmount(calculateToAmount(fromAmount, cardanoToken, fromToken))
    } else {
      setToAmount(calculateToAmount(fromAmount, fromToken, cardanoToken))
    }
  }

  const calculateToAmount = (amount: string, from: Token, to: Token) => {
    const numAmount = Number.parseFloat(amount) || 0
    const rate = from.price / to.price
    return (numAmount * rate).toFixed(4)
  }

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (swapDirection === "evm-to-cardano") {
      const calculatedAmount = Number(calculateToAmount(value, fromToken, cardanoToken));
      setToAmount(Math.floor(calculatedAmount).toString());
    } else {
      setToAmount(calculateToAmount(value, cardanoToken, fromToken).toString());
    }
  }

  const handleFromTokenChange = (tokenSymbol: string) => {
    const token = evmTokens.find((t) => t.symbol === tokenSymbol)
    if (token && !token.disabled) {
      setFromToken(token)
      if (swapDirection === "evm-to-cardano") {
        setToAmount(calculateToAmount(fromAmount, token, cardanoToken))
      } else {
        setToAmount(calculateToAmount(fromAmount, cardanoToken, token))
      }
    }
  }

  const canSwap =
    (swapDirection === "evm-to-cardano"
      ? isEvmWalletConnected && isConnected
      : isEvmWalletConnected && isConnected) && Number.parseFloat(fromAmount) > 0

      async function handleEvmToCardanoOrder({
        makerSrcAddress,
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        makerDstAddress,
        hashlock,
        salt,
        expiresAt
      }: EvmToCardanoOrderParams) {

      
        const order = {
          maker: makerSrcAddress,
          makerAsset: fromToken,
          takerAsset: toToken,
          makingAmount: BigInt(fromAmount), 
          takingAmount: BigInt(toAmount), 
          receiver: '0x0000000000000000000000000000000000000000',
          hashlock: hashlock,
          salt: salt
        };
      
        const orderMetadata = {
          adaAmount: BigInt(toAmount),
          cardanoAddress: makerDstAddress,
          safetyDeposit: 0.01, // Default safety deposit
          deadline: expiresAt,
          createdAt: new Date().toISOString()
        };
      
        // Create order hash for EIP-712 signing
        const orderHash = await createOrderHash(order);
      
        const signedOrderData = {
          ...order,
          ...orderMetadata,
          orderHash: orderHash
        };
      
        const signature = await signOrder(signedOrderData);
        // Get the LOP contract using ABI

      
        if (fromToken === "0x0000000000000000000000000000000000000000") {
          const preInteractionTx =   await writeContract(config,{
            abi: LimitOrderProtocolABI.abi,
            address: ADDRESSES.limitOrderProtocol as `0x${string}`,
            functionName: 'preInteraction',
            args: [order, signature],
            value: BigInt(fromAmount),
          });
          console.log(`📋 Transaction hash: ${preInteractionTx}`);
          console.log(`⏳ Waiting for confirmation...`);
          const receipt = await waitForTransactionReceipt(config, {
            hash: preInteractionTx,
          });
          console.log(`✅ PreInteraction completed in block ${receipt.blockNumber}`);
        } else {
          // Approve token to lop
          const tokenContract = await readContract(config, {
            address: fromToken as `0x${string}`,
            abi: [
              "function approve(address spender, uint256 amount) external returns (bool)"
            ] as any,
            functionName: 'approve',
            args: [ADDRESSES.limitOrderProtocol, BigInt(fromAmount)],
          });
          const approveTx = await writeContract(config, {
            address: fromToken as `0x${string}`,
            abi: [
              "function approve(address spender, uint256 amount) external returns (bool)"
            ] as any,
            functionName: 'approve',
            args: [ADDRESSES.limitOrderProtocol, BigInt(fromAmount)],
          });
          console.log(`📋 Approve transaction hash: ${approveTx}`);
          console.log(`⏳ Waiting for approval confirmation...`);
          const receipt = await waitForTransactionReceipt(config, {
            hash: approveTx,
          });
          console.log(`✅ Token approved in block ${receipt.blockNumber}`);
      
          // Now call preInteraction
          const preInteractionTx = await writeContract(config, {
            address: ADDRESSES.limitOrderProtocol as `0x${string}`,
            abi: LimitOrderProtocolABI.abi,
            functionName: 'preInteraction',
            args: [order, signature],
          });
          console.log(`📋 Transaction hash: ${preInteractionTx}`);
          console.log(`⏳ Waiting for confirmation...`);
          const preReceipt = await waitForTransactionReceipt(config, {
            hash: preInteractionTx,
          });
          console.log(`✅ PreInteraction completed in block ${preReceipt.blockNumber}`);
        }
        return { signature, orderHash };
      }

      async function _handleCardanoToEvmOrder({
        fromAmount,
        authVaultAddr,
        script
      }: CardanoToEvmOrderParams) {
        try {
          console.log('Starting Cardano to EVM order process...');
          const Blockfrost = blockfrost();
          const txBuilder = await getTxBuilder(Blockfrost);
          console.log('Transaction builder initialized.');
          console.log('Cardano wallet:', cardanoWallet);
          const maker =  Address.fromString(
            await cardanoWallet?.getChangeAddress() as any
          );
        
          console.log('Maker:', maker);
          const makerPkh =  maker.paymentCreds.hash.toBuffer()
          console.log('Maker public key hash:', makerPkh);
      
          const utxos = (await cardanoWallet?.getUtxos())?.map(toPlutsUtxo);
          console.log('Retrieved UTXOs:', utxos);
      
          if (utxos?.length === 0) {
            throw new Error("No UTXOs found at maker address. Please ensure the address has sufficient funds.");
          }
      
          const feeBuffer = BigInt(2_000_000); // 2 ADA fee buffer in lovelaces
          const fromAmountLovelaces = BigInt(Math.floor(parseFloat(fromAmount) * 1_000_000)); // Convert ADA to lovelaces
          console.log('From amount in lovelaces:', fromAmountLovelaces);
      
          const requiredAmount = fromAmountLovelaces + feeBuffer;
          console.log('Required amount:', requiredAmount);
      
          const selectedUtxo = utxos?.find(u => u.resolved.value.lovelaces > requiredAmount);
          console.log('Selected UTXO:', selectedUtxo);
      
          if (!selectedUtxo) {
            throw new Error(`Insufficient funds. Required: ${requiredAmount}, but no suitable UTXO found.`);
          }
      
          // Build transaction
          const tx = txBuilder.buildSync({
            inputs: [{ 
              utxo: UTxOUtils.convertUtxo(selectedUtxo)
            }],
            collaterals: [UTxOUtils.convertUtxo(selectedUtxo)],
            outputs: [{
              address: authVaultAddr.toString() as any,
              value: Value.lovelaces(fromAmountLovelaces), // Use the converted lovelaces amount
              datum: AuthVaultDatum.AuthVaultDatum({
                maker_pkh: pBSToData.$(pByteString(makerPkh as any)),
                expected_escrow_script_hash: pBSToData.$(pByteString(script.hash as any)),
                maker_input_value: pIntToData.$(Number(fromAmountLovelaces)) // Use lovelaces in datum
              })
            }],
            changeAddress: cardanoAddress as any
          });
          console.log('Transaction built:', tx);
      
          // Sign transaction
          const signedTx = await cardanoWallet?.signTx(tx.toCbor().toString());
          console.log('Transaction signed:', signedTx);
      
          // Submit transaction
          const txHash = await cardanoWallet?.submitTx(signedTx as any);
          console.log('Transaction submitted. Hash:', txHash);
      
          if (!txHash) {
            throw new Error("Failed to submit transaction to Cardano network");
          }
      
          console.log("Cardano transaction submitted successfully", { txHash });
      
          // For Cardano orders, create a unique order hash by combining tx hash with timestamp
          const orderHash = txHash;
          console.log('Order hash:', orderHash);
      
          return { 
            signature: txHash, // Use txHash as signature for Cardano orders
            orderHash: orderHash // Use combined hash for uniqueness
          };
      
        } catch (error) {
          console.error("Cardano transaction failed", { error: (error as any).message });
          throw new Error(`Cardano transaction failed: ${error as any}`);
        }
      }


  const handleSwap = async () => {
    console.log('Starting swap process...');
    setIsSwapping(true);
    try {
      // Generate a random secret and compute its hashlock
      const secret = generateRandomSecret();
      console.log('Generated secret:', secret);
      const hashlock = await computeHashlock(secret);
      console.log('Computed hashlock:', hashlock);
      const salt = Math.floor(Math.random() * 1000000);
      console.log('Generated salt:', salt);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      console.log('Set expiration date:', expiresAt);
      let signature;
      let orderHash;

      // Prepare order data
      const orderData = {
        fromChain: swapDirection === "evm-to-cardano" ? "EVM" : "Cardano",
        toChain: swapDirection === "evm-to-cardano" ? "Cardano" : "EVM",
        fromToken: fromToken.address,
        toToken: cardanoToken.address,
        fromAmount,
        toAmount,
        makerSrcAddress: swapDirection === "evm-to-cardano" ? evmAddress : cardanoAddress,
        makerDstAddress: swapDirection === "evm-to-cardano" ? cardanoAddress : evmAddress,
        hashlock,
        salt,
        expiresAt
      };
      console.log('Prepared order data:', orderData);

      if (orderData.fromChain === "EVM" && orderData.toChain === "Cardano") {
        // Convert fromAmount to wei (assuming ETH or 18-decimal tokens)
        const fromAmountWei = parseEther(fromAmount.toString());
        console.log('Converted fromAmount to wei:', fromAmountWei);

        const result = await handleEvmToCardanoOrder({
          makerSrcAddress: orderData.makerSrcAddress as string,
          fromToken: orderData.fromToken as string,
          toToken: orderData.toToken as string,
          fromAmount: fromAmountWei.toString(),
          toAmount:toAmount,
          makerDstAddress: orderData.makerDstAddress as string,
          hashlock: orderData.hashlock as string,
          salt: orderData.salt as number,
          expiresAt: orderData.expiresAt as Date
        });
        console.log('Order result:', result);
        signature = result.signature;
        orderHash = result.orderHash;
      } else if (orderData.fromChain === "Cardano" && orderData.toChain === "EVM") {
        console.log('Handling Cardano to EVM order...');
        const result = await _handleCardanoToEvmOrder({
          fromAmount: orderData.fromAmount as string,
          script: script as unknown as { hash: Buffer<ArrayBufferLike> }, 
          authVaultAddr: authVaultAddr as any
          });
        console.log('Order result:', result);
        signature = result.signature;
        orderHash = result.orderHash;
      } else {
        throw new Error(`Unsupported chain combination: ${orderData.fromChain} -> ${orderData.toChain}`);
      }

      // Call API to save in database
      console.log('Submitting order to API...');
      const response = await fetch('http://localhost:3001/api/orders', {
        method: 'POST',
        body: JSON.stringify(orderData),
      });
      const data = await response.json();
      console.log('API response:', data);

      // Show success toast
      toast({
        title: "Swap Order Submitted!",
        description: `Your ${
          swapDirection === "evm-to-cardano"
            ? `${fromAmount} ${fromToken.symbol} → ${toAmount} ${cardanoToken.symbol}`
            : `${fromAmount} ${cardanoToken.symbol} → ${toAmount} ${fromToken.symbol}`
        } swap has been submitted successfully.`,
        duration: 5000,
      });

      // Reset form
      setFromAmount("");
      setToAmount("");
    } catch (error) {
      console.error('Swap failed:', error);
      toast({
        title: "Swap Failed",
        description: "There was an error submitting your swap order. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsSwapping(false);
      console.log('Swap process completed.');
    }
  }
  return (
    <div className="space-y-4">
          {/* Wallet Connection Status */}
          <div className="grid grid-cols-2 gap-3">
          <Card className="bg-slate-800/30 border-slate-700">
            <CardContent className="p-3">
             <EthereumWalletButton/>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/30 border-slate-700">
            <CardContent className="p-3">
             <CardanoWalletButton/>
            </CardContent>
          </Card>
        </div>
   

      {/* From Token */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-slate-400 text-sm">
              You pay ({swapDirection === "evm-to-cardano" ? "EVM" : "Cardano"})
            </span>
          </div>
        

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {swapDirection === "evm-to-cardano" ? (
                <Select value={fromToken.symbol} onValueChange={handleFromTokenChange}>
                  <SelectTrigger className="w-auto border-none bg-transparent p-0 text-white">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{fromToken.icon}</span>
                      <div className="text-left">
                        <div className="font-semibold">{fromToken.symbol}</div>
                        <div className="text-xs text-slate-400">on {fromToken.chain}</div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {evmTokens.map((token) => (
                      <SelectItem
                        key={token.symbol}
                        value={token.symbol}
                        disabled={token.disabled}
                        className="text-white disabled:text-slate-500"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{token.icon}</span>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {token.symbol}
                              {token.disabled && <span className="text-xs bg-slate-600 px-1 rounded">Soon</span>}
                            </div>
                            <div className="text-xs text-slate-400">{token.chain}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{cardanoToken.icon}</span>
                  <div className="text-left">
                    <div className="font-semibold">{cardanoToken.symbol}</div>
                    <div className="text-xs text-slate-400">on {cardanoToken.chain}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="text-right">
              <Input
                value={fromAmount}
                onChange={(e) => handleFromAmountChange(e.target.value)}
                className="text-right text-2xl font-semibold bg-transparent border-none p-0 text-white w-32"
                placeholder="0"
                type="number"
                step="0.01"
              />
              <div className="text-xs text-slate-400">
                ~$
                {(
                  Number.parseFloat(fromAmount) *
                  (swapDirection === "evm-to-cardano" ? fromToken.price : cardanoToken.price)
                ).toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Swap Button */}
      <div className="flex justify-center">
        <Button
          size="sm"
          variant="outline"
          onClick={handleSwapDirection}
          className="rounded-full w-10 h-10 p-0 border-slate-600 bg-slate-800 hover:bg-slate-700"
        >
          <ArrowUpDown className="w-4 h-4 text-slate-300" />
        </Button>
      </div>

      {/* To Token */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-slate-400 text-sm">
              You receive ({swapDirection === "evm-to-cardano" ? "Cardano" : "EVM"})
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {swapDirection === "evm-to-cardano" ? (
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{cardanoToken.icon}</span>
                  <div className="text-left">
                    <div className="font-semibold">{cardanoToken.symbol}</div>
                    <div className="text-xs text-slate-400">on {cardanoToken.chain}</div>
                  </div>
                </div>
              ) : (
                <Select value={fromToken.symbol} onValueChange={handleFromTokenChange}>
                  <SelectTrigger className="w-auto border-none bg-transparent p-0 text-white">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{fromToken.icon}</span>
                      <div className="text-left">
                        <div className="font-semibold">{fromToken.symbol}</div>
                        <div className="text-xs text-slate-400">on {fromToken.chain}</div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    </div>
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {evmTokens.map((token) => (
                      <SelectItem
                        key={token.symbol}
                        value={token.symbol}
                        disabled={token.disabled}
                        className="text-white disabled:text-slate-500"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{token.icon}</span>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {token.symbol}
                              {token.disabled && <span className="text-xs bg-slate-600 px-1 rounded">Soon</span>}
                            </div>
                            <div className="text-xs text-slate-400">{token.chain}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="text-right">
              <div className="text-2xl font-semibold text-white">{toAmount}</div>
              <div className="text-xs text-slate-400">
                ~$
                {(
                  Number.parseFloat(toAmount) *
                  (swapDirection === "evm-to-cardano" ? cardanoToken.price : fromToken.price)
                ).toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exchange Rate */}
      <div className="text-center text-sm text-slate-400">
        {swapDirection === "evm-to-cardano"
          ? `1 ${fromToken.symbol} = ${(fromToken.price / cardanoToken.price).toFixed(2)} ${cardanoToken.symbol}`
          : `1 ${cardanoToken.symbol} = ${(cardanoToken.price / fromToken.price).toFixed(6)} ${fromToken.symbol}`}{" "}
        • Fee: 0.1%
      </div>

      {/* Action Button */}
      <Button
        className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 text-lg disabled:opacity-50"
        disabled={!canSwap || isSwapping}
        onClick={handleSwap}
      >
        {isSwapping ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </div>
        ) : !isEvmWalletConnected && !isConnected ? (
          "Connect Both Wallets to Swap"
        ) : swapDirection === "evm-to-cardano" ? (
          !isEvmWalletConnected ? (
            "Connect EVM Wallet"
          ) : !isConnected ? (
            "Connect Cardano Wallet"
          ) : (
            "Permit and Swap"
          )
        ) : !isConnected ? (
          "Connect Cardano Wallet"
        ) : !isEvmWalletConnected ? (
          "Connect EVM Wallet"
        ) : (
          "Permit and Swap"
        )}
      </Button>
    </div>
  )
}
