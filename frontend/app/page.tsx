"use client"

import { useState } from "react"
import { SwapInterface } from "@/components/swap-interface"
import { OrdersDashboard } from "@/components/orders-dashboard"
import { OrderDetail } from "@/components/order-detail"
import { Button } from "@/components/ui/button"
import { ArrowLeftRight, List, Zap } from "lucide-react"

export default function Home() {
  const [currentView, setCurrentView] = useState<"swap" | "orders" | "order-detail">("swap")
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isEvmWalletConnected, setIsEvmWalletConnected] = useState(false)
  const [isCardanoWalletConnected, setIsCardanoWalletConnected] = useState(false)

  const handleViewOrderDetail = (orderId: string) => {
    setSelectedOrderId(orderId)
    setCurrentView("order-detail")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation Header */}
      <nav className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 max-w-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">CardanoSwap</h1>
            </div>

            {(isEvmWalletConnected || isCardanoWalletConnected) && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-sm text-slate-300">Connected</span>
              </div>
            )}
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-6 max-w-md">
        {/* Navigation Tabs */}
        {currentView !== "order-detail" && (
          <div className="flex gap-2 mb-6">
            <Button
              variant={currentView === "swap" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentView("swap")}
              className="text-white"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Swap
            </Button>
            <Button
              variant={currentView === "orders" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCurrentView("orders")}
              className="text-white"
            >
              <List className="w-4 h-4 mr-2" />
              Orders
            </Button>
          </div>
        )}

        {/* Main Content */}
        {currentView === "swap" && (
          <SwapInterface
            isEvmWalletConnected={isEvmWalletConnected}
            isCardanoWalletConnected={isCardanoWalletConnected}
            onEvmWalletConnect={() => setIsEvmWalletConnected(true)}
            onCardanoWalletConnect={() => setIsCardanoWalletConnected(true)}
          />
        )}

        {currentView === "orders" && (
          <OrdersDashboard
            isEvmWalletConnected={isEvmWalletConnected}
            isCardanoWalletConnected={isCardanoWalletConnected}
            onEvmWalletConnect={() => setIsEvmWalletConnected(true)}
            onCardanoWalletConnect={() => setIsCardanoWalletConnected(true)}
            onViewDetail={handleViewOrderDetail}
          />
        )}

        {currentView === "order-detail" && selectedOrderId && (
          <OrderDetail orderId={selectedOrderId} onBack={() => setCurrentView("orders")} />
        )}
      </div>
    </div>
  )
}
