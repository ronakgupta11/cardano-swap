"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Clock, CheckCircle, AlertCircle, ExternalLink, Wallet, Eye } from "lucide-react"
import { useCardanoWallet } from "@/context/WalletContext"
import CardanoWalletButton from "./cardano-wallet"
import EthereumWalletButton from "./ethereum-wallet"

interface Order {
  id: string
  fromToken: string
  toToken: string
  fromAmount: string
  toAmount: string
  fromChain: string
  toChain: string
  status: "pending" | "completed" | "failed" | "available"
  timestamp: string
  txHash?: string
  estimatedTime?: string
}

const mockOrders: Order[] = [
  {
    id: "1",
    fromToken: "ETH",
    toToken: "ADA",
    fromAmount: "1.0",
    toAmount: "8133.33",
    fromChain: "Ethereum",
    toChain: "Cardano",
    status: "pending",
    timestamp: "2 minutes ago",
    txHash: "0x1234...5678",
    estimatedTime: "~15 minutes",
  },
  {
    id: "2",
    fromToken: "ETH",
    toToken: "ADA",
    fromAmount: "0.5",
    toAmount: "4066.67",
    fromChain: "Ethereum",
    toChain: "Cardano",
    status: "available",
    timestamp: "15 minutes ago",
    txHash: "0xabcd...efgh",
  },
  {
    id: "3",
    fromToken: "ETH",
    toToken: "ADA",
    fromAmount: "2.0",
    toAmount: "16266.66",
    fromChain: "Ethereum",
    toChain: "Cardano",
    status: "completed",
    timestamp: "1 hour ago",
    txHash: "0x9876...5432",
  },
  {
    id: "4",
    fromToken: "ETH",
    toToken: "ADA",
    fromAmount: "0.25",
    toAmount: "2033.33",
    fromChain: "Ethereum",
    toChain: "Cardano",
    status: "failed",
    timestamp: "3 hours ago",
    txHash: "0xdef0...1234",
  },
]

interface OrdersDashboardProps {
  isEvmWalletConnected: boolean
  onEvmWalletConnect: () => void
  onViewDetail: (orderId: string) => void
}

const getStatusIcon = (status: Order["status"]) => {
  switch (status) {
    case "pending":
      return <Clock className="w-4 h-4 text-yellow-500" />
    case "completed":
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case "failed":
      return <AlertCircle className="w-4 h-4 text-red-500" />
    case "available":
      return <ExternalLink className="w-4 h-4 text-blue-500" />
    default:
      return null
  }
}

const getStatusColor = (status: Order["status"]) => {
  switch (status) {
    case "pending":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
    case "completed":
      return "bg-green-500/20 text-green-300 border-green-500/30"
    case "failed":
      return "bg-red-500/20 text-red-300 border-red-500/30"
    case "available":
      return "bg-blue-500/20 text-blue-300 border-blue-500/30"
    default:
      return "bg-slate-500/20 text-slate-300 border-slate-500/30"
  }
}

export function OrdersDashboard({
  isEvmWalletConnected,
  onEvmWalletConnect,
  onViewDetail,
}: OrdersDashboardProps) {
  const [activeTab, setActiveTab] = useState("all")
  const { isConnected, connect,disconnect,address } = useCardanoWallet()

  const filterOrders = (status?: Order["status"]) => {
    if (!status) return mockOrders
    return mockOrders.filter((order) => order.status === status)
  }

  const getActionButtons = (order: Order) => {
    const buttons = []

    // View Details button (always available)
    buttons.push(
      <Button
        key="view"
        size="sm"
        variant="outline"
        className="border-slate-600 text-slate-300 bg-transparent hover:bg-slate-700"
        onClick={() => onViewDetail(order.id)}
      >
        <Eye className="w-3 h-3 mr-1" />
        View
      </Button>,
    )

    // Status-specific action button
    switch (order.status) {
      case "available":
        buttons.push(
          <Button key="withdraw" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
            Withdraw
          </Button>,
        )
        break
      case "failed":
        buttons.push(
          <Button
            key="retry"
            size="sm"
            variant="outline"
            className="border-red-600 text-red-300 bg-transparent hover:bg-red-900/20"
          >
            Retry
          </Button>,
        )
        break
    }

    return buttons
  }

  const OrderListItem = ({ order }: { order: Order }) => (
    <Card className="bg-slate-800/50 border-slate-700 hover:bg-slate-800/70 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {/* Left side - Order info */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              {getStatusIcon(order.status)}
              <Badge className={`${getStatusColor(order.status)} text-xs`}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
              <span className="text-xs text-slate-400">{order.timestamp}</span>
              {order.estimatedTime && order.status === "pending" && (
                <span className="text-xs text-blue-400">{order.estimatedTime}</span>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-sm text-white">
                <span className="font-medium">
                  {order.fromAmount} {order.fromToken}
                </span>
                <span className="text-slate-400 mx-2">→</span>
                <span className="font-medium">
                  {order.toAmount} {order.toToken}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span>
                {order.fromChain} → {order.toChain}
              </span>
              {order.txHash && <span className="font-mono">{order.txHash}</span>}
            </div>
          </div>

          {/* Right side - Action buttons */}
          <div className="flex items-center gap-2 ml-4">{getActionButtons(order)}</div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header with wallet connections */}
      <div className="space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Orders Dashboard</h1>
          <p className="text-slate-400">Track your EVM to Cardano swaps</p>
        </div>

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
      </div>

      {/* Orders Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="all" className="text-slate-300 data-[state=active]:text-white text-xs">
            All ({mockOrders.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-slate-300 data-[state=active]:text-white text-xs">
            Pending ({filterOrders("pending").length})
          </TabsTrigger>
          <TabsTrigger value="available" className="text-slate-300 data-[state=active]:text-white text-xs">
            Available ({filterOrders("available").length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-slate-300 data-[state=active]:text-white text-xs">
            Completed ({filterOrders("completed").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-3 mt-4">
          {mockOrders.map((order) => (
            <OrderListItem key={order.id} order={order} />
          ))}
        </TabsContent>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {filterOrders("pending").map((order) => (
            <OrderListItem key={order.id} order={order} />
          ))}
        </TabsContent>

        <TabsContent value="available" className="space-y-3 mt-4">
          {filterOrders("available").map((order) => (
            <OrderListItem key={order.id} order={order} />
          ))}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3 mt-4">
          {filterOrders("completed").map((order) => (
            <OrderListItem key={order.id} order={order} />
          ))}
        </TabsContent>
      </Tabs>

      {mockOrders.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-2">No orders found</div>
          <p className="text-sm text-slate-500">Your swap orders will appear here</p>
        </div>
      )}
    </div>
  )
}
