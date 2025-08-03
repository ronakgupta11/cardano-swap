"use client"
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, CheckCircle, AlertCircle, ExternalLink, Copy, ArrowUpDown } from "lucide-react";
import { useCardanoWallet } from "@/context/WalletContext";
import { useEthereumWallet } from "@/hooks/use-ethereum-wallet";
import EscrowFactory from "@/lib/EscrowFactory.json";
import LimitOrderProtocol from "@/lib/LimitOrderProtocol.json";
import EscrowSrc from "@/lib/EscrowSrc.json"
import EscrowDst from "@/lib/EscrowDst.json"
import { ADDRESSES } from "@/lib/constants";
import {writeContract,readContract, sendTransaction, waitForTransactionReceipt} from "@wagmi/core"
import { config } from "@/lib/wagmi";
import { parseEther } from "viem";
import blockfrost from "@/lib/blockfrost"
import getTxBuilder from "@/lib/getTxBuilder"

import { ScriptType, CredentialType, Address, Credential, Script, int, PPubKeyHash, bs, pstruct, DataConstr } from '@harmoniclabs/plu-ts';
import scriptData from "@/testnet/atomic-swap.plutus.json"
import authVaultData from "@/testnet/auth-vault.plutus.json"
import { toPlutsUtxo } from "@/lib/meshUtils"
import UTxOUtils from "@/lib/utxo"
import { Value } from "@harmoniclabs/plu-ts"
import { pBSToData, pIntToData, pByteString, isData } from "@harmoniclabs/plu-ts"
import { useWebSocket } from "@/hooks/use-websocket";

 const EscrowDatum = pstruct({
  EscrowDatum: {
    hashlock: bs, // The SHA-256 hash of the secret, provided by the Maker.
    maker_pkh: PPubKeyHash.type, // The public key hash of the Maker.
    resolver_pkh: PPubKeyHash.type, // The public key hash of the Resolver who filled the order.
    resolver_unlock_deadline: int, // Deadline for the exclusive withdrawal period.
    resolver_cancel_deadline: int, // Deadline for the exclusive cancellation period.
    public_cancel_deadline: int, // The final deadline for public cancellation.
    safety_deposit: int // The safety deposit amount to be locked in the contract.
  }
}); 
const EscrowRedeemer = pstruct({
  // Action to claim the funds using the secret.
  Withdraw: { secret: bs },
  // Action to cancel the swap after a timeout.
  Cancel: {}
}); 
const AuthVaultRedeemer = pstruct({
  CreateEscrow: {
      resolver_pkh: PPubKeyHash.type,
      safety_deposit_amount: int
  }
});

interface OrderDetailProps {
  orderId: string;
  onBack: () => void;
}

interface Order {
  id: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  fromChain: string;
  toChain: string;
  hashlock: string;
  orderHash: string;
  status: "pending" | "completed" | "failed" | "available" | "accepted";
  timestamp: string;
  createdAt: string;
  txHash: string;
  estimatedTime: string;
  fee: string;
  exchangeRate: string;
  fromAddress: string;
  toAddress: string;
  srcWithdrawTxHash: string | null;
  dstWithdrawTxHash: string | null;
  srcEscrowTxHash: string | null;
  dstEscrowTxHash: string | null;
  escrowSrcAddress: string | null;
  escrowDstAddress: string | null;
  resolverAddress: string | null;
  makerSrcAddress: string;
  makerDstAddress: string;  
  steps: Array<{ step: number; description: string; status: string; timestamp: string,action:string,href:string }>;
  secret: string | null;
}


const getStatusIcon = (status: string) => {
  switch (status) {
    case "pending":
      return <Clock className="w-4 h-4 text-yellow-500" />;
    case "completed":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "failed":
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case "available":
      return <ExternalLink className="w-4 h-4 text-blue-500" />;
    case "accepted":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    default:
      return null;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "completed":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    case "failed":
      return "bg-red-500/20 text-red-300 border-red-500/30";
    case "available":
      return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "accepted":
      return "bg-green-500/20 text-green-300 border-green-500/30";
    default:
      return "bg-slate-500/20 text-slate-300 border-slate-500/30";
  }
};


const script = Script.fromCbor(scriptData.cborHex, ScriptType.PlutusV3);;
const scriptAddr = new Address("testnet", new Credential(CredentialType.Script, script.hash));


 const authVaultScript = Script.fromCbor(authVaultData.cborHex,  ScriptType.PlutusV3);
 const authVaultAddr = new Address("testnet", new Credential(CredentialType.Script, authVaultScript.hash));



const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

const generateOrderSteps = (order: Order) => {
  const steps = [
    { step: 1, description: "Order Created", status: "completed", timestamp: order.createdAt ,action: "",href: ""},
    { step: 2, description: "Order Accepted", status: order.resolverAddress  ? "completed" : "pending", timestamp: "",action: "acceptOrder",href: "" },
    { step: 3, description: "Source Escrow Deployed", status: order.escrowSrcAddress ? "completed" : "pending", timestamp: "",action: "deploySrcEscrow",href: order.fromChain === "Cardano" ? `https://preprod.cardanoscan.io/transaction/${order.srcEscrowTxHash}` : "https://sepolia.etherscan.io/tx/" + order.srcEscrowTxHash },
    { step: 4, description: "Destination Escrow Deployed", status: order.escrowDstAddress ? "completed" : "pending", timestamp: "",action: "deployDstEscrow",href: order.toChain === "Cardano" ? `https://preprod.cardanoscan.io/transaction/${order.dstEscrowTxHash}` : "https://sepolia.etherscan.io/tx/" + order.dstEscrowTxHash },
    { step: 5, description: "Secret Shared", status: order.secret ? "completed" : "pending", timestamp: "", action: "shareSecret",href: "" },
    { step: 6, description: "Withdraw for Maker", status: order.dstWithdrawTxHash ? "completed" : "pending", timestamp: "", action: "withdrawMaker",href: order.toChain === "Cardano" ? `https://preprod.cardanoscan.io/transaction/${order.dstWithdrawTxHash}` : "https://sepolia.etherscan.io/tx/" + order.dstWithdrawTxHash },
    { step: 7, description: "Withdraw for Resolver", status: order.srcWithdrawTxHash ? "completed" : "pending", timestamp: "", action: "withdrawResolver",href: order.fromChain === "Cardano" ? `https://preprod.cardanoscan.io/transaction/${order.srcWithdrawTxHash}` : "https://sepolia.etherscan.io/tx/" + order.srcWithdrawTxHash },
    { step: 8, description: "Order Completed", status: "pending", timestamp: "", action: "completeOrder",href: "" }
  ];

  // Update step statuses based on order status
  if (order.status === "completed") {
    steps.forEach(step => step.status = "completed");
  }  else if (order.status === "pending") {
    steps[0].status = "completed";
  }

  return steps;
};

export function OrderDetail({ orderId, onBack }: OrderDetailProps) {
  const [order, setOrder] = useState<Order | null>(null);
  const { address: cardanoAddress ,wallet: cardanoWallet} = useCardanoWallet();
  const { address: evmAddress } = useEthereumWallet();
  const [isProcessing, setIsProcessing] = useState(false);
  const isMaker = order?.makerSrcAddress === evmAddress || order?.makerDstAddress === cardanoAddress;
  // Only pass orderId to WebSocket hook after accepting order
  const [isAccepted, setIsAccepted] = useState(false);
  const { connect, getSecret } = useWebSocket(isAccepted ? orderId : '', isMaker ? 'maker' : 'resolver');


  // Effect to watch for secret updates
  useEffect(() => {
    const checkForSecret = () => {
      if (!isMaker) { // Only resolvers should watch for secrets
        const secret = getSecret();
        if (secret) {
          console.log('Secret received via WebSocket:', secret);
          // Update the step status
          setOrder((prevOrder) => {
            if (!prevOrder) return null;
            const updatedSteps = prevOrder.steps?.map((step) => {
              if (step.action === "shareSecret") {
                return { ...step, status: "completed" };
              }
              return step;
            });
            return { ...prevOrder, steps: updatedSteps,secret: secret };
          });
        }
      }
    };

    // Check immediately and set up interval
    checkForSecret();
    const interval = setInterval(checkForSecret, 1000);

    return () => clearInterval(interval);
  }, [getSecret, isMaker]);

  useEffect(() => {
    // Fetch order details based on orderId
    const fetchOrderDetail = async () => {
      try {
        const response = await fetch(`http://localhost:3000/api/orders/${orderId}`);
        const data = await response.json();
        if (!data.steps) {
          data.steps = generateOrderSteps(data);
        }
  
        setOrder(data);
        // Initialize isAccepted based on order status
        if (data.status === "accepted" || data.status === "completed" && data.resolverAddress === (data.fromChain === "EVM" ? evmAddress : cardanoAddress)) {
          setIsAccepted(true);
        }
      } catch (error) {
        console.error('Failed to fetch order details:', error);
      }
    };

    fetchOrderDetail();
  }, [orderId]);

  if (!order) {
    return <div>Loading...</div>;
  }

  
  const acceptOrder = async (orderId: string) => {
    const response = await fetch(`http://localhost:3000/api/orders/${orderId}/accept`, {
    
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId ,resolverAddress:order.fromChain === "EVM" ? evmAddress : cardanoAddress}),
    });
    const data = await response.json();
    console.log(data);
    setOrder((prevOrder) => {
      if (!prevOrder) return null;
      return { ...prevOrder, status: "accepted",resolverAddress:order.fromChain === "EVM" ? evmAddress : cardanoAddress as any };
    });

    // Set accepted state to true which will trigger WebSocket connection
    setIsAccepted(true);
  }

  const handleStepAction = async (action: string) => {
    if (isProcessing) return; // Prevent multiple executions
    setIsProcessing(true);
  
    try {
      console.log("handleStepAction", action);
      // Update the step status to completed
      if(action === "acceptOrder"){
        await acceptOrder(orderId);
      } else if (action === "deploySrcEscrow") {
          await handleDeploySrcEscrow();
        } else if (action === "deployDstEscrow") {
           await handleDeployDstEscrow();
        } else if (action === "shareSecret") {


          // Handle share secret logic
        } else if (action === "withdrawMaker") {
          await handleWithdrawMaker();
          // Handle withdraw maker logic
        } else if (action === "withdrawResolver") {
          await handleWithdrawResolver();
          // Handle withdraw resolver logic
        } else if (action === "completeOrder") {

          // Handle complete order logic
        }

        setOrder((prevOrder) => {
          if (!prevOrder) return null;
  
        const updatedSteps = prevOrder.steps?.map((step) => {
          if (step.action === action) {
            return { ...step, status: "completed" };
          }
          return step;
        });
  
        return { ...prevOrder, steps: updatedSteps };
      });
    } finally {
      setIsProcessing(false);
    }
  };
  const handleWithdrawMaker = async () => {
      //withdraw will be done on cardano side
    if(order.fromChain === "EVM"){
      const secret = order.secret as string;
      const secretBytes =  Buffer.from(secret, 'hex')
  
      console.log('Secret Bytes:', secretBytes);
      console.log('Secret:', secret);
      console.log(pBSToData.$(pByteString(secretBytes)));
      const Blockfrost = blockfrost();
      const txBuilder = await getTxBuilder(Blockfrost);

      const utxos = await Blockfrost.addressUtxos(scriptAddr.toString());
      const utxo = utxos.find(utxo => utxo.utxoRef.id.toString() === order.escrowDstAddress);

      const escrowDatum = utxo?.resolved.datum as any;
      console.log('Escrow Datum:', escrowDatum);

      const fields = escrowDatum.fields;
      console.log('Fields:', fields);
      const safetyDeposit = BigInt(fields[6].int);

      console.log('Safety Deposit:', safetyDeposit);

      const resolver =  Address.fromString(
        await cardanoWallet?.getChangeAddress() as any
      );
    
      console.log('Resolver:', resolver);
      const resolverPkh =  resolver.paymentCreds.hash.toBuffer()


      const resolverUtxos = (await cardanoWallet?.getUtxos())?.map(toPlutsUtxo);
      console.log('Retrieved UTXOs:', resolverUtxos);

      const selectedResolverUtxo = UTxOUtils.findUtxoWithFunds(resolverUtxos, 5_000_000);//safetydeposit + fee
      console.log('Resolver UTXO:', selectedResolverUtxo);

      const totalEscrowValue = UTxOUtils.getLovelaces(utxo?.resolved.value);
      const escrowAmount = totalEscrowValue - BigInt(safetyDeposit);

      const chainTip = await Blockfrost.getChainTip();
      const currentSlot = chainTip.slot!;

      const tx = await txBuilder.buildSync({
        inputs: [
            { 
                utxo: UTxOUtils.convertUtxo(utxo),
                inputScript: {
                    script: script,
                    datum: "inline",
                    redeemer: EscrowRedeemer.Withdraw({ 
                        secret: pBSToData.$(pByteString(secretBytes))
                    })
                }
            }
        ],
        outputs: [
    
            {
                address: order.makerDstAddress as any,
                value: Value.lovelaces(escrowAmount) // Main escrow amount to maker
            }
        ],
        collaterals: [UTxOUtils.convertUtxo(selectedResolverUtxo)],
        changeAddress: cardanoAddress?.toString() as any, // Any remaining fees go to resolver
        requiredSigners: [resolverPkh as any], // Required for before-deadline withdrawal
        invalidBefore: currentSlot,
        invalidAfter: currentSlot + 100
    });

      console.log('Transaction built:', tx);
  
      // Sign transaction
      const signedTx = await cardanoWallet?.signTx(tx.toCbor().toString(),true);
      console.log('Transaction signed:', signedTx);
  
      // Submit transaction
      const txHash = await cardanoWallet?.submitTx(signedTx as any);
      console.log('Transaction submitted. Hash:', txHash);

      const response = await fetch(`http://localhost:3000/api/orders/${order.id}/tx-hash`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dstWithdrawTxHash: txHash }),
      });
      const data = await response.json();
      console.log(data);
      setOrder((prevOrder) => {
        if (!prevOrder) return null;
        return { ...prevOrder,dstWithdrawTxHash: txHash as any };
      });
    }
    else{
      //withdraw will be done on evm side

      const secret = order.secret as string;

      const immutables = {
        orderHash: `0x${order.orderHash}`,
        hashlock: `${order.hashlock}`,
        maker: order.makerDstAddress,
        taker: evmAddress,
        token: order.toToken,
        amount: parseEther(order.toAmount.toString()),
        safetyDeposit: parseEther("0.01"),
        timelocks: "0x0000000000000000000000000000000000000000000000000000000000000000" // No timelocks for this demo
      };

      const withdrawTx = await writeContract(config,{
        abi: EscrowDst.abi,
        address: order.escrowDstAddress as `0x${string}`,
        functionName: 'withdraw',
        args: [`0x${secret}`,immutables],
      });
      console.log(`📋 Transaction hash: ${withdrawTx}`);

      const receipt = await waitForTransactionReceipt(config, {
        hash: withdrawTx,
      });
      console.log(`✅ Withdraw completed in block ${receipt.blockNumber}`);

      const response = await fetch(`http://localhost:3000/api/orders/${order.id}/tx-hash`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dstWithdrawTxHash: withdrawTx }),
      });
      const data = await response.json();
      console.log(data);
      setOrder((prevOrder) => {
        if (!prevOrder) return null;
        return { ...prevOrder,dstWithdrawTxHash: withdrawTx as any };
      });
    }

    
  }

  const handleWithdrawResolver = async () => {
    //withdraw will be done Cardano side

  if(order.fromChain === "Cardano"){
    const secret = order.secret as string;
    const secretBytes =  Buffer.from(secret, 'hex')

    console.log('Secret Bytes:', secretBytes);
    console.log('Secret:', secret);
    console.log(pBSToData.$(pByteString(secretBytes)));
    const Blockfrost = blockfrost();
    const txBuilder = await getTxBuilder(Blockfrost);

    const utxos = await Blockfrost.addressUtxos(scriptAddr.toString());
    const utxo = utxos.find(utxo => utxo.utxoRef.id.toString() === order.escrowSrcAddress);
    console.log('UTXO:', utxo);
  

 

    const resolver =  Address.fromString(
      await cardanoWallet?.getChangeAddress() as any
    );
  
    console.log('Resolver:', resolver);
    const resolverPkh =  resolver.paymentCreds.hash.toBuffer()


    const resolverUtxos = (await cardanoWallet?.getUtxos())?.map(toPlutsUtxo);
    console.log('Retrieved UTXOs:', resolverUtxos);

    const selectedResolverUtxo = UTxOUtils.findUtxoWithFunds(resolverUtxos, 5_000_000);//safetydeposit + fee
    console.log('Resolver UTXO:', selectedResolverUtxo);

    const totalEscrowValue = UTxOUtils.getLovelaces(utxo?.resolved.value);
    const escrowAmount = totalEscrowValue

    const chainTip = await Blockfrost.getChainTip();
    const currentSlot = chainTip.slot!;

    const tx = await txBuilder.buildSync({
      inputs: [
          { 
              utxo: UTxOUtils.convertUtxo(utxo),
              inputScript: {
                  script: script,
                  datum: "inline",
                  redeemer: EscrowRedeemer.Withdraw({ 
                      secret: pBSToData.$(pByteString(secretBytes))
                  })
              }
          },
          {
            utxo: UTxOUtils.convertUtxo(selectedResolverUtxo) // for fee
          }
      ],
      outputs: [
  
          {
              address: cardanoAddress?.toString() as any,
              value: Value.lovelaces(escrowAmount) // Main escrow amount to maker
          }
      ],
      collaterals: [UTxOUtils.convertUtxo(selectedResolverUtxo)],
      changeAddress: cardanoAddress?.toString() as any, // Any remaining fees go to resolver
      requiredSigners: [resolverPkh as any], // Required for before-deadline withdrawal
      invalidBefore: currentSlot,
      invalidAfter: currentSlot + 100
  });

    console.log('Transaction built:', tx);

    // Sign transaction
    const signedTx = await cardanoWallet?.signTx(tx.toCbor().toString(),true);
    console.log('Transaction signed:', signedTx);

    // Submit transaction
    const txHash = await cardanoWallet?.submitTx(signedTx as any);
    console.log('Transaction submitted. Hash:', txHash);

    const response = await fetch(`http://localhost:3000/api/orders/${order.id}/tx-hash`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ srcWithdrawTxHash: txHash }),
    });
    const data = await response.json();
    console.log(data);
    setOrder((prevOrder) => {
      if (!prevOrder) return null;
      return { ...prevOrder,srcWithdrawTxHash: txHash as any };
    });
  }
  else{
    //withdraw will be done on evm side

    const secret = order.secret as string;

    const immutables = {
      orderHash: order.orderHash,
      hashlock: order.hashlock,
      maker: order.makerSrcAddress,
      taker: evmAddress,
      token: order.fromToken,
      amount: parseEther(order.fromAmount.toString()),
      safetyDeposit: parseEther("0.01"),
      timelocks: "0x0000000000000000000000000000000000000000000000000000000000000000" // No timelocks for this demo
    };

    const withdrawTx = await writeContract(config,{
      abi: EscrowSrc.abi,
      address: order.escrowSrcAddress as `0x${string}`,
      functionName: 'withdraw',
      args: [`0x${secret}`,immutables],
    });
    console.log(`📋 Transaction hash: ${withdrawTx}`);

    const receipt = await waitForTransactionReceipt(config, {
      hash: withdrawTx,
    });
    console.log(`✅ Withdraw completed in block ${receipt.blockNumber}`);
  

  const response = await fetch(`http://localhost:3000/api/orders/${order.id}//tx-hash`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ srcWithdrawTxHash: withdrawTx }),
  });
  const data = await response.json();
  console.log(data);

  setOrder((prevOrder) => {
    if (!prevOrder) return null;
    return { ...prevOrder,srcWithdrawTxHash: withdrawTx as any };
  });
}
}




  const handleDeploySrcEscrow = async () => {

    if (order.fromChain === "EVM") {
      const immutables = {
        orderHash: `${order.orderHash}`,
        hashlock: order.hashlock,
        maker: order.makerSrcAddress,
        taker: evmAddress, // Resolver becomes the taker
        token: order.fromToken,
        amount: parseEther(order.fromAmount.toString()),
        safetyDeposit: parseEther("0.01"),
        timelocks: "0x0000000000000000000000000000000000000000000000000000000000000000"
      };
      const srcEscrowAddress = await readContract(config,{
        abi: EscrowFactory.abi,
        address: ADDRESSES.cardanoEscrowFactory as `0x${string}`,
        functionName: 'addressOfEscrowSrc',
        args: [immutables],
      });
      
      const preFundTx = await sendTransaction(config, {
        to: srcEscrowAddress as `0x${string}`,
        value: parseEther("0.01"),
      })
      console.log(`📋 Transaction hash: ${preFundTx}`);

      const receipt = await waitForTransactionReceipt(config, {
        hash: preFundTx,
      });
      console.log(`✅ PreFund completed in block ${receipt.blockNumber}`);

      const postInteractionTx = await writeContract(config,{
        abi: LimitOrderProtocol.abi,
        address: ADDRESSES.limitOrderProtocol as `0x${string}`,
        functionName: 'postInteraction',
        args: [`${order.orderHash}`,
          ADDRESSES.cardanoEscrowFactory,
          parseEther("0.01")],
      });
      console.log(`📋 Transaction hash: ${postInteractionTx}`);

      const receipt2 = await waitForTransactionReceipt(config, {
        hash: postInteractionTx,
      });
      console.log(`✅ PostFund completed in block ${receipt2.blockNumber}`);

      const response = await fetch(`http://localhost:3000/api/orders/${order.id}/escrow-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ escrowSrcAddress: srcEscrowAddress }),
      });
      const data = await response.json();
      console.log(data);


      const response2 = await fetch(`http://localhost:3000/api/orders/${order.id}/tx-hash`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ srcEscrowTxHash: postInteractionTx }),
      });
      const data2 = await response2.json();
      console.log(data2);

      setOrder((prevOrder) => {
        if (!prevOrder) return null;
        return { ...prevOrder,srcEscrowTxHash: postInteractionTx as any };
      });
    }
    else{

      const Blockfrost = blockfrost();
      const txBuilder = await getTxBuilder(Blockfrost);

      const authVaultUtxos = await Blockfrost.addressUtxos(authVaultAddr.toString());
      const authVaultUtxo = authVaultUtxos.find(utxo => 
        utxo.utxoRef.id.toString() === order.orderHash && 
        utxo.utxoRef.index === 0
    );
      const escrowAmount = UTxOUtils.getLovelaces(authVaultUtxo?.resolved.value);
      const authVaultDatum = authVaultUtxo?.resolved.datum;

      const resolver =  Address.fromString(
        await cardanoWallet?.getChangeAddress() as any
      );
    
      console.log('Resolver:', resolver);
      const resolverPkh =  resolver.paymentCreds.hash.toBuffer()

      const maker =  Address.fromString(order.makerSrcAddress);
      const makerPkh =  maker.paymentCreds.hash.toBuffer()

      const resolverUtxos = (await cardanoWallet?.getUtxos())?.map(toPlutsUtxo);
      console.log('Retrieved UTXOs:', resolverUtxos);

      const selectedResolverUtxo = UTxOUtils.findUtxoWithFunds(resolverUtxos, 15_000_000);//safetydeposit + fee
      console.log('Resolver UTXO:', selectedResolverUtxo);

      const now = Date.now();
      const resolverDeadline = now + (1 * 3600000);
      const cancelDeadline = now + (2 * 3600000);
      const publicDeadline = now + (3 * 3600000);


      const totalEscrowValue = BigInt(escrowAmount) + BigInt(10_000_000);
      // Build transaction
      const tx = txBuilder.buildSync({
        inputs: [
            { 
                utxo: UTxOUtils.convertUtxo(authVaultUtxo),
                inputScript: {
                    script: authVaultScript,
                    datum: "inline",
                    redeemer: (() => {
                        const redeemer = AuthVaultRedeemer.CreateEscrow({
                            resolver_pkh: pBSToData.$(pByteString(resolverPkh)),
                            safety_deposit_amount: pIntToData.$(Number(10_000_000))
                        });
                       
                        return redeemer;
                    })()
                }
            },
            { 
                utxo: UTxOUtils.convertUtxo(selectedResolverUtxo)
            }
        ],
        collaterals: [UTxOUtils.convertUtxo(selectedResolverUtxo)],
        outputs: [
            // Output 1: Create the final escrow UTXO
            {
                address: scriptAddr.toString(),
                value: Value.lovelaces(totalEscrowValue),
                datum: (() => {
                    const datum = EscrowDatum.EscrowDatum({
                        hashlock: pBSToData.$(pByteString(order.hashlock.replace("0x", ""))),
                        maker_pkh: pBSToData.$(pByteString(makerPkh)),
                        resolver_pkh: pBSToData.$(pByteString(resolverPkh)),
                        resolver_unlock_deadline: pIntToData.$(resolverDeadline),
                        resolver_cancel_deadline: pIntToData.$(cancelDeadline),
                        public_cancel_deadline: pIntToData.$(publicDeadline),
                        safety_deposit: pIntToData.$(Number(10_000_000))
                    });
                    return datum;
                })()
            }
        ],
        changeAddress: cardanoAddress as any,
        requiredSigners: [resolverPkh as any] // Only resolver needs to sign
    });

      console.log('Transaction built:', tx);
  
      // Sign transaction
      const signedTx = await cardanoWallet?.signTx(tx.toCbor().toString(),true);
      console.log('Transaction signed:', signedTx);
  
      // Submit transaction
      const txHash = await cardanoWallet?.submitTx(signedTx as any);
      console.log('Transaction submitted. Hash:', txHash);
  
      if (!txHash) {
        throw new Error("Failed to submit transaction to Cardano network");
      }
  
      console.log("Cardano transaction submitted successfully", { txHash });

      const response = await fetch(`http://localhost:3000/api/orders/${order.id}/escrow-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ escrowSrcAddress: txHash }),
      });
      const data = await response.json();
      console.log(data);

      const response2 = await fetch(`http://localhost:3000/api/orders/${order.id}/tx-hash`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ srcEscrowTxHash: txHash }),
      });
      const data2 = await response2.json();
      console.log(data2);

      setOrder((prevOrder) => {
        if (!prevOrder) return null;
        return { ...prevOrder,srcEscrowTxHash: txHash as any };
      });

    }

    // const response = await fetch(`http://localhost:3000/api/orders/${orderId}/deploy-src-escrow`);
    // const data = await response.json();
    // console.log(data);
  }


  const handleDeployDstEscrow = async () => {
    console.log("handleDeployDstEscrow",order);
    if (order.toChain === "EVM") {
      const immutables = {
        orderHash: `0x${order.orderHash}`,
        hashlock: order.hashlock,
        maker: order.makerDstAddress,
        taker: evmAddress, // Resolver becomes the taker
        token: order.toToken,
        amount: parseEther(order.toAmount.toString()),
        safetyDeposit: parseEther("0.01"),
        timelocks: "0x0000000000000000000000000000000000000000000000000000000000000000"
      };

      const dstEscrowAddress = await readContract(config,{
        abi: EscrowFactory.abi,
        address: ADDRESSES.cardanoEscrowFactory as `0x${string}`,
        functionName: 'addressOfEscrowDst',
        args: [immutables],
      });

      const dstEscrowCreationTx = await writeContract(config,{
        abi: EscrowFactory.abi,
        address: ADDRESSES.cardanoEscrowFactory as `0x${string}`,
        functionName: 'createDstEscrow',
        args: [immutables],
        value: parseEther((Number(order.toAmount) + 0.01).toString()),
      });
      console.log(`📋 Transaction hash: ${dstEscrowCreationTx}`);

      const receipt2 = await waitForTransactionReceipt(config, {
        hash: dstEscrowCreationTx,
      })
      console.log(`✅ Escrow created in block ${receipt2.blockNumber}`);

      const response = await fetch(`http://localhost:3000/api/orders/${order.id}/escrow-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ escrowDstAddress: dstEscrowAddress }),
      });
      const data = await response.json();
      console.log(data);

      const response2 = await fetch(`http://localhost:3000/api/orders/${order.id}/tx-hash`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dstEscrowTxHash: dstEscrowCreationTx }),
      });
      const data2 = await response2.json();
      console.log(data2);

      setOrder((prevOrder) => {
        if (!prevOrder) return null;
        return { ...prevOrder,dstEscrowTxHash: dstEscrowCreationTx as any };
      });
    }
    else{
      const Blockfrost = blockfrost();
      const txBuilder = await getTxBuilder(Blockfrost);

      const resolver =  Address.fromString(
        await cardanoWallet?.getChangeAddress() as any
      );
    
      console.log('Resolver:', resolver);
      const resolverPkh =  resolver.paymentCreds.hash.toBuffer()

      const maker =  Address.fromString(order.makerDstAddress);
      const makerPkh =  maker.paymentCreds.hash.toBuffer()

      const resolverUtxos = (await cardanoWallet?.getUtxos())?.map(toPlutsUtxo);
      console.log('Retrieved UTXOs:', resolverUtxos);

      const selectedResolverUtxo = UTxOUtils.findUtxoWithFunds(resolverUtxos, BigInt(Number(order.toAmount)*1000000 + 10_000_000 + 2_000_000));//safetydeposit + fee
      console.log('Resolver UTXO:', selectedResolverUtxo);

      const now = Date.now();
      const resolverDeadline = now + (1 * 3600000);
      const cancelDeadline = now + (2 * 3600000);
      const publicDeadline = now + (3 * 3600000);


      // Build transaction
      const tx = txBuilder.buildSync({
        inputs: [
          
            { 
                utxo: UTxOUtils.convertUtxo(selectedResolverUtxo)
            }
        ],
        collaterals: [UTxOUtils.convertUtxo(selectedResolverUtxo)],
        outputs: [
            // Output 1: Create the final escrow UTXO
            {
                address: scriptAddr.toString(),
                value: Value.lovelaces(BigInt(Number(order.toAmount)*1000000 + 10_000_000)),
                datum: (() => {
                    const datum = EscrowDatum.EscrowDatum({
                        hashlock: pBSToData.$(pByteString(order.hashlock.replace("0x", ""))),
                        maker_pkh: pBSToData.$(pByteString(makerPkh)),
                        resolver_pkh: pBSToData.$(pByteString(resolverPkh)),
                        resolver_unlock_deadline: pIntToData.$(resolverDeadline),
                        resolver_cancel_deadline: pIntToData.$(cancelDeadline),
                        public_cancel_deadline: pIntToData.$(publicDeadline),
                        safety_deposit: pIntToData.$(Number(10_000_000))
                    });
                    return datum;
                })()
            }
        ],
        changeAddress: cardanoAddress as any,
        requiredSigners: [resolverPkh as any] // Only resolver needs to sign
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

      const response = await fetch(`http://localhost:3000/api/orders/${order.id}/escrow-addresses`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ escrowDstAddress: txHash }),
      });
      const data = await response.json();
      console.log(data);

      const response2 = await fetch(`http://localhost:3000/api/orders/${order.id}/tx-hash`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dstEscrowTxHash: txHash }),
      });
      const data2 = await response2.json();
      console.log(data2);

      setOrder((prevOrder) => {
        if (!prevOrder) return null;
        return { ...prevOrder,dstEscrowTxHash: txHash as any };
      }); 
    }
  }
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
              <div className="text-sm text-slate-400">{order.fromChain === "EVM" ? "ETH" : "ADA"}</div>
              <div className="text-xs text-slate-500">{order.fromChain}</div>
            </div>
            <ArrowUpDown className="w-6 h-6 text-slate-400" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{order.toAmount}</div>
              <div className="text-sm text-slate-400">{order.toChain === "EVM" ? "ETH" : "ADA"}</div>
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
                  <span className="text-white font-mono text-sm">{order.makerSrcAddress.slice(0, 6)}...{order.makerSrcAddress.slice(-4)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(order.makerSrcAddress)}
                    className="h-6 w-6 p-0 text-slate-400 hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-slate-400 text-sm">To Address:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">{order.makerDstAddress.slice(0, 6)}...{order.makerDstAddress.slice(-4)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(order.makerDstAddress)}
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
                {step.status === "completed" && step.href !== "" && <a href={step.href} target="_blank" className="text-slate-400 text-xs mt-1">verify on chain</a>}
                {!isMaker && step.status !== "completed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-xs border-slate-600 text-slate-300 bg-transparent hover:bg-slate-700"
                    onClick={() => handleStepAction(step.action)}
                  >
                    Complete Step
                  </Button>
                )}
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
  );
}