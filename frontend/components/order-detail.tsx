"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Clock, CheckCircle, AlertCircle, ExternalLink, Copy, ArrowUpDown } from "lucide-react"

interface OrderDetailProps {
  orderId: string
  onBack: () => void
}

// Mock order data - in real app, this would be fetched based on orderId
const mockOrderDetail = {
  id: "1",
  fromToken: "ETH",
  toToken: "ADA",
  fromAmount: "1.0",
  toAmount: "8133.33",
  fromChain: "Ethereum",
  toChain: "Cardano",
  status: "pending" as const,
  timestamp: "2 minutes ago",
  createdAt: "2024-01-15 14:30:25 UTC",
  txHash: "0x1234567890abcdef1234567890abcdef12345678",
  estimatedTime: "~15 minutes",
  fee: "0.1%",
  exchangeRate: "1 ETH = 8133.33 ADA",
  fromAddress: "0xabcd...1234",
  toAddress: "addr1qxy2...5678",
  steps: [
    { step: 1, description: "Transaction submitted to Ethereum", status: "completed", timestamp: "14:30:25" },
    { step: 2, description: "Waiting for confirmations (12/12)", status: "completed", timestamp: "14:32:15" },
    { step: 3, description: "Processing cross-chain transfer", status: "pending", timestamp: "" },
    { step: 4, description: "ADA ready for withdrawal", status: "pending", timestamp: "" },
  ],
}

const getStatusIcon = (status: string) => {
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

const getStatusColor = (status: string) => {
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

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
}

export function OrderDetail({ orderId, onBack }: OrderDetailProps) {
  const order = mockOrderDetail

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Orders
        </Button>
      </div>

      {/* Order Summary */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Order #{order.id}</CardTitle>
            <div className="flex items-center gap-2">
              {getStatusIcon(order.status)}
              <Badge className={getStatusColor(order.status)}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Swap Details */}
          <div className="flex items-center justify-center gap-4 p-4 bg-slate-900/50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{order.fromAmount}</div>
              <div className="text-sm text-slate-400">{order.fromToken}</div>
              <div className="text-xs text-slate-500">{order.fromChain}</div>
            </div>
            <ArrowUpDown className="w-6 h-6 text-slate-400" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{order.toAmount}</div>
              <div className="text-sm text-slate-400">{order.toToken}</div>
              <div className="text-xs text-slate-500">{order.toChain}</div>
            </div>
          </div>

          {/* Order Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-400">Created:</span>
              <div className="text-white">{order.createdAt}</div>
            </div>
            <div>
              <span className="text-slate-400">Exchange Rate:</span>
              <div className="text-white">{order.exchangeRate}</div>
            </div>
            <div>
              <span className="text-slate-400">Fee:</span>
              <div className="text-white">{order.fee}</div>
            </div>
            <div>
              <span className="text-slate-400">Estimated Time:</span>
              <div className="text-white">{order.estimatedTime}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Hash */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <div className="space-y-3">
            <h3 className="text-white font-medium">Transaction Details</h3>
            <div className="space-y-2">
              <div>
                <span className="text-slate-400 text-sm">From Address:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">{order.fromAddress}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(order.fromAddress)}
                    className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-slate-400 text-sm">To Address:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">{order.toAddress}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(order.toAddress)}
                    className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-slate-400 text-sm">Transaction Hash:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">{order.txHash}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(order.txHash)}
                    className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Steps */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-4">
          <h3 className="text-white font-medium mb-4">Progress</h3>
          <div className="space-y-4">
            {order.steps.map((step, index) => (
              <div key={step.step} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step.status === "completed"
                        ? "bg-green-500 text-white"
                        : step.status === "pending"
                          ? "bg-yellow-500 text-white"
                          : "bg-slate-600 text-slate-300"
                    }`}
                  >
                    {step.status === "completed" ? "✓" : step.step}
                  </div>
                  {index < order.steps.length - 1 && (
                    <div
                      className={`w-0.5 h-8 mt-2 ${step.status === "completed" ? "bg-green-500" : "bg-slate-600"}`}
                    />
                  )}
                </div>
                <div className="flex-1 pt-1">
                  <div className="text-white text-sm">{step.description}</div>
                  {step.timestamp && <div className="text-slate-400 text-xs mt-1">{step.timestamp}</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Action Button */}
      {order.status === "available" && (
        <Button className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3">
          Withdraw ADA
        </Button>
      )}
    </div>
  )
}
