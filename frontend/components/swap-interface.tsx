"use client"

import { use, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { ArrowUpDown, ChevronDown, Wallet, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useWallet, useWalletList } from "@meshsdk/react"
import CardanoWalletButton from "./cardano-wallet"
import EthereumWalletButton from "./ethereum-wallet"

interface Token {
  symbol: string
  name: string
  chain: string
  icon: string
  price: number
  disabled?: boolean
}

const evmTokens: Token[] = [
  { symbol: "ETH", name: "Ethereum", chain: "Ethereum", icon: "🔷", price: 3657.65 },
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
}

interface SwapInterfaceProps {
  isEvmWalletConnected: boolean
  onEvmWalletConnect: () => void
}

export function SwapInterface({
  isEvmWalletConnected,
  onEvmWalletConnect,
}: SwapInterfaceProps) {
  const [fromToken, setFromToken] = useState<Token>(evmTokens[0])
  const [fromAmount, setFromAmount] = useState("1")
  const [toAmount, setToAmount] = useState("8133.33")
  const [swapDirection, setSwapDirection] = useState<"evm-to-cardano" | "cardano-to-evm">("evm-to-cardano")
  const { wallet, connected, name, connecting, connect, disconnect } = useWallet();

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
    return (numAmount * rate).toFixed(2)
  }

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value)
    if (swapDirection === "evm-to-cardano") {
      setToAmount(calculateToAmount(value, fromToken, cardanoToken))
    } else {
      setToAmount(calculateToAmount(value, cardanoToken, fromToken))
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
      ? isEvmWalletConnected && connected
      : isEvmWalletConnected && connected) && Number.parseFloat(fromAmount) > 0

      console.log("available:", useWalletList())

  return (
    <div className="space-y-4">
      {/* From Token */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-slate-400 text-sm">
              You pay ({swapDirection === "evm-to-cardano" ? "EVM" : "Cardano"})
            </span>
            {((swapDirection === "evm-to-cardano" && !isEvmWalletConnected) ||
              (swapDirection === "cardano-to-evm" && !connected)) && (
               swapDirection === "evm-to-cardano" ?  
              
              <EthereumWalletButton />:<CardanoWalletButton/>
            )}
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
            {((swapDirection === "evm-to-cardano" && !connected) ||
              (swapDirection === "cardano-to-evm" && !isEvmWalletConnected)) && (
                swapDirection === "evm-to-cardano" ?  <CardanoWalletButton/>
                :
              <EthereumWalletButton />
            )}
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
        onClick={async () => {
          setIsSwapping(true)
          try {
            // Simulate API call delay
            await new Promise((resolve) => setTimeout(resolve, 2000))

            console.log("Swap initiated:", { fromToken, fromAmount, toAmount, swapDirection })

            // Show success toast
            toast({
              title: "Swap Order Submitted!",
              description: `Your ${
                swapDirection === "evm-to-cardano"
                  ? `${fromAmount} ${fromToken.symbol} → ${toAmount} ${cardanoToken.symbol}`
                  : `${fromAmount} ${cardanoToken.symbol} → ${toAmount} ${fromToken.symbol}`
              } swap has been submitted successfully.`,
              duration: 5000,
            })

            // Reset form
            setFromAmount("")
            setToAmount("")
          } catch (error) {
            toast({
              title: "Swap Failed",
              description: "There was an error submitting your swap order. Please try again.",
              variant: "destructive",
              duration: 5000,
            })
          } finally {
            setIsSwapping(false)
          }
        }}
      >
        {isSwapping ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </div>
        ) : !isEvmWalletConnected && !connected ? (
          "Connect Both Wallets to Swap"
        ) : swapDirection === "evm-to-cardano" ? (
          !isEvmWalletConnected ? (
            "Connect EVM Wallet"
          ) : !connected ? (
            "Connect Cardano Wallet"
          ) : (
            "Permit and Swap"
          )
        ) : !connected ? (
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
