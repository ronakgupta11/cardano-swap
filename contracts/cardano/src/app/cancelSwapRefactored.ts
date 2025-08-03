import { 
    Address, 
    Credential, 
    PrivateKey, 
    Script,
    ScriptType
} from "@harmoniclabs/plu-ts";

import { EscrowRedeemer } from "../MyRedeemer";
import getTxBuilder from "./getTxBuilder";
import blockfrost from "./blockfrost";

// Import utilities
import { Logger } from "./utils/logger";
import { SwapError, NetworkError, ValidationError, TimelockError } from "./utils/errors";
import { UTxOUtils } from "./utils/utxo";
import { FileUtils } from "./utils/fileUtils";
import { SwapValidation } from "./utils/validation";

/**
 * Configuration for cancellation
 */
interface CancelConfig {
    validityWindowSlots?: number;
}

/**
 * Cancel an atomic swap escrow (resolver/taker cancellation)
 */
async function cancelSwap(config?: Partial<CancelConfig>): Promise<void> {
    const defaultConfig: CancelConfig = {
        validityWindowSlots: 100
    };

    const finalConfig = { ...defaultConfig, ...config };
    
    Logger.info("🚫 Starting swap cancellation");

    try {
        // Initialize services
        const Blockfrost = blockfrost();
        const txBuilder = await getTxBuilder(Blockfrost);
        
        // Load script and addresses
        const script = await FileUtils.loadScript("./testnet/atomic-swap.plutus.json", ScriptType.PlutusV3);
        const scriptAddr = new Address("testnet", Credential.script(script.hash));
        Logger.info(`📜 Script address: ${scriptAddr.toString()}`);

        // Load resolver's credentials (payment2 is the resolver/taker)
        const resolverPrivateKey = await FileUtils.loadPrivateKey("./testnet/payment2.skey");
        const resolverAddress = await FileUtils.loadAddress("./testnet/address2.addr");
        Logger.info(`👤 Resolver address: ${resolverAddress.toString()}`);

        // Find the swap UTXO at the script address
        Logger.info("🔍 Fetching UTXOs from script address...");
        const scriptUtxos = await Blockfrost.addressUtxos(scriptAddr.toString());
        
        if (scriptUtxos.length === 0) {
            throw new NetworkError("No UTXOs found at script address. Ensure the escrow exists.");
        }
        
        Logger.success(`Found ${scriptUtxos.length} UTXO(s) at script address`);
        const swapUtxo = scriptUtxos[0]; // Use the first swap UTXO

        // Get resolver UTXOs for fees and collateral
        Logger.info("🔍 Fetching resolver UTXOs for fees...");
        const resolverUtxos = await Blockfrost.addressUtxos(resolverAddress.toString());
        
        if (resolverUtxos.length === 0) {
            throw new NetworkError("No UTXOs found at resolver address for fees and collateral.");
        }
        
        UTxOUtils.logUtxoInfo(resolverUtxos, resolverAddress.toString());
        
        const collateralUtxo = UTxOUtils.findUtxoWithFunds(resolverUtxos, BigInt(5_000_000));
        Logger.success("Selected collateral UTXO");

        // Parse and validate datum
        Logger.info("📄 Analyzing escrow datum...");
        const parsedDatum = SwapValidation.parseDatum(swapUtxo.resolved.datum);

        // Validate resolver PKH
        Logger.info("🔑 Validating resolver credentials...");
        const resolverPkh = resolverPrivateKey.derivePublicKey().hash;
        if (!SwapValidation.validatePKH(
            resolverPkh.toString(), 
            parsedDatum.resolverPkh, 
            "Resolver"
        )) {
            throw new ValidationError(
                "The resolver private key doesn't match the one in the datum! " +
                "Only the designated resolver can cancel the swap."
            );
        }

        // Build cancellation transaction
        Logger.info("🏗️  Building cancellation transaction...");
        
        // Get current slot for validity interval
        const chainTip = await Blockfrost.getChainTip();
        const currentSlot = chainTip.slot!;
        const validityWindow = finalConfig.validityWindowSlots!;
        
        Logger.info(`⏰ Setting transaction validity from slot ${currentSlot} to ${currentSlot + validityWindow}`);
        
        const tx = await txBuilder.buildSync({
            inputs: [
                { 
                    utxo: UTxOUtils.convertUtxo(swapUtxo),
                    inputScript: {
                        script: script,
                        datum: "inline",
                        redeemer: EscrowRedeemer.Cancel({})
                    }
                }
            ],
            collaterals: [UTxOUtils.convertUtxo(collateralUtxo)],
            changeAddress: resolverAddress.toString(),
            requiredSigners: [resolverPrivateKey.derivePublicKey().hash], // Required for cancellation
            invalidBefore: currentSlot,
            invalidAfter: currentSlot + validityWindow
        });

        // Sign and submit transaction
        Logger.info("✍️  Signing transaction...");
        await tx.signWith(resolverPrivateKey);
        
        Logger.info("📡 Submitting transaction to network...");
        const submittedTx = await Blockfrost.submitTx(tx.toCbor().toString());
        
        // Success output
        Logger.success("🎉 Swap cancellation successful!");
        Logger.info(`📝 Transaction hash: ${submittedTx}`);
        Logger.info(`🚫 Resolver successfully cancelled the swap`);
        Logger.info(`💰 Funds returned to appropriate parties`);
        
    } catch (error) {
        Logger.error("❌ Failed to cancel swap", error as Error);
        
        if (error instanceof ValidationError) {
            Logger.error("🔍 Validation failed:");
            Logger.error(`   ${error.message}`);
        } else if (error instanceof NetworkError) {
            Logger.error("🌐 Network error:");
            if (error.message.includes("No UTXOs found at script address")) {
                Logger.error("   Make sure:");
                Logger.error("   1. The escrow exists and hasn't been spent");
                Logger.error("   2. The script address is correct");
            } else if (error.message.includes("No UTXOs found at resolver address")) {
                Logger.error("   Make sure the resolver address has funds for fees and collateral");
            }
        } else if (error instanceof Error) {
            if (error.message.includes("script execution failed")) {
                Logger.error("💻 Script validation failed. Check:");
                Logger.error("   1. The resolver is authorized to cancel");
                Logger.error("   2. Cancellation conditions are met");
            }
        }
        
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    cancelSwap();
}

export default cancelSwap;
