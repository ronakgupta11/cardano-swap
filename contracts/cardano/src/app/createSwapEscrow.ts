import { 
    Address, 
    Credential, 
    PrivateKey, 
    Value, 
    pBSToData, 
    pByteString, 
    pIntToData,
    CredentialType,
    PublicKey,
    Script,
    ScriptType
} from "@harmoniclabs/plu-ts";

import { EscrowDatum } from "../MyDatum";
import getTxBuilder from "./getTxBuilder";
import blockfrost from "./blockfrost";
import { createHash, randomBytes } from "crypto";

// Import utilities
import { Logger } from "./utils/logger";
import { SwapError, NetworkError, InsufficientFundsError } from "./utils/errors";
import { UTxOUtils } from "./utils/utxo";
import { FileUtils } from "./utils/fileUtils";

/**
 * Configuration for swap creation
 */
interface SwapConfig {
    secret: string;
    escrowAmount: bigint;        // Amount to lock in escrow (lovelaces)
    safetyDeposit: bigint;       // Safety deposit amount (lovelaces)
    deadlineOffset: number;      // Hours from now for resolver deadline
    cancelOffset: number;        // Additional hours for cancel deadline
    publicOffset: number;        // Additional hours for public deadline
}

/**
 * Generate a cryptographically secure random secret
 */
function generateRandomSecret(): string {
    // Generate 32 random bytes and convert to hex
    const randomHex = randomBytes(32).toString('hex');
    
    // Create a human-readable secret with timestamp for uniqueness
    const timestamp = Date.now();
    const secret = `atomic-swap-${timestamp}-${randomHex.substring(0, 16)}`;
    
    Logger.debug(`Generated random secret: ${secret}`);
    return secret;
}

/**
 * Create a new atomic swap escrow
 */
async function createSwapEscrow(config?: Partial<SwapConfig>): Promise<void> {
    const defaultConfig: SwapConfig = {
        secret: generateRandomSecret(), // Generate random secret each time
        escrowAmount: BigInt(10_000_000), // 10 ADA
        safetyDeposit: BigInt(5_000_000), // 5 ADA safety deposit,
        deadlineOffset: 1,    // 1 hour
        cancelOffset: 2,      // 2 hours total
        publicOffset: 3       // 3 hours total
    };

    const finalConfig = { ...defaultConfig, ...config };
    
    Logger.info("🚀 Starting atomic swap escrow creation");
    Logger.info(`🎲 Generated random secret: ${finalConfig.secret}`);
    Logger.info(`📦 Escrow amount: ${Number(finalConfig.escrowAmount) / 1_000_000} ADA`);
    Logger.info(`💰 Safety deposit: ${Number(finalConfig.safetyDeposit) / 1_000_000} ADA`);
    Logger.info(`⏰ Resolver deadline: ${finalConfig.deadlineOffset} hour(s) from now`);

    try {
        // Initialize services
        const Blockfrost = blockfrost();
        const txBuilder = await getTxBuilder(Blockfrost);
        
        // Load script and addresses
        const script = await FileUtils.loadScript("./testnet/atomic-swap.plutus.json", ScriptType.PlutusV3);
        const scriptAddr = new Address("testnet", new Credential(CredentialType.Script, script.hash));
        Logger.info(`📜 Script address: ${scriptAddr.toString()}`);

        // Load maker's credentials
        const makerPrivateKey = await FileUtils.loadPrivateKey("./testnet/payment1.skey");
        const makerAddress = await FileUtils.loadAddress("./testnet/address1.addr");
        Logger.info(`👤 Maker address: ${makerAddress.toString()}`);

        // Load taker's public key
        const takerPublicKey = await FileUtils.loadPublicKey("./testnet/payment2.vkey");
        const takerPkh = takerPublicKey.hash;
        Logger.info(`🎯 Taker PKH: ${takerPkh.toString()}`);

        // Generate hashlock
        const hashlock = createHash('keccak256').update(finalConfig.secret).digest();
        Logger.info(`🔒 Generated hashlock: ${hashlock.toString('hex')}`);

        // Fetch and validate UTXOs
        Logger.info("🔍 Fetching UTXOs for maker address...");
        const utxos = await Blockfrost.addressUtxos(makerAddress.toString());
        
        if (utxos.length === 0) {
            throw new NetworkError("No UTXOs found at the maker address. Ensure the address has funds.");
        }

        UTxOUtils.logUtxoInfo(utxos, makerAddress.toString());

        // Find suitable UTXO for escrow
        const requiredAmount = finalConfig.escrowAmount + finalConfig.safetyDeposit + BigInt(5_000_000); // Add buffer for fees
        const selectedUtxo = UTxOUtils.findUtxoWithFunds(utxos, requiredAmount);
        
        Logger.success(`Selected UTXO with ${Number(UTxOUtils.getLovelaces(selectedUtxo.resolved.value)) / 1_000_000} ADA`);

        // Calculate deadlines
        const now = Date.now();
        const resolverDeadline = now + (finalConfig.deadlineOffset * 3600000);
        const cancelDeadline = now + (finalConfig.cancelOffset * 3600000);
        const publicDeadline = now + (finalConfig.publicOffset * 3600000);

        Logger.info("📅 Swap timeline:");
        Logger.info(`  - Resolver deadline: ${new Date(resolverDeadline).toISOString()}`);
        Logger.info(`  - Cancel deadline: ${new Date(cancelDeadline).toISOString()}`);
        Logger.info(`  - Public deadline: ${new Date(publicDeadline).toISOString()}`);

        // Build transaction
        Logger.info("🏗️  Building escrow transaction...");
        
        const tx = txBuilder.buildSync({
            inputs: [{ 
                utxo: UTxOUtils.convertUtxo(selectedUtxo)
            }],
            collaterals: [UTxOUtils.convertUtxo(selectedUtxo)],
            outputs: [{
                address: scriptAddr.toString(),
                value: Value.lovelaces(finalConfig.escrowAmount + finalConfig.safetyDeposit),
                datum: EscrowDatum.EscrowDatum({
                    hashlock: pBSToData.$(pByteString(hashlock)),
                    maker_pkh: pBSToData.$(pByteString(makerAddress.paymentCreds.hash.toBuffer())),
                    resolver_pkh: pBSToData.$(pByteString(takerPkh.toBuffer())),
                    resolver_unlock_deadline: pIntToData.$(resolverDeadline),
                    resolver_cancel_deadline: pIntToData.$(cancelDeadline),
                    public_cancel_deadline: pIntToData.$(publicDeadline),
                    safety_deposit: pIntToData.$(Number(finalConfig.safetyDeposit))
                })
            }],
            changeAddress: makerAddress.toString()
        });

        // Sign and submit transaction
        Logger.info("✍️  Signing transaction...");
        await tx.signWith(makerPrivateKey);
        
        Logger.info("📡 Submitting transaction to network...");
        const submittedTx = await Blockfrost.submitTx(tx.toCbor().toString());
        
        // Success output
        Logger.success("🎉 Swap escrow created successfully!");
        Logger.info(`📝 Transaction hash: ${submittedTx}`);
        Logger.warn("⚠️  IMPORTANT: Save this secret - you'll need it to withdraw funds!");
        Logger.info(`🔑 SECRET: ${finalConfig.secret}`);
        Logger.info(`🔒 Hashlock: ${hashlock.toString('hex')}`);
        Logger.info(`📍 Escrow address: ${scriptAddr.toString()}`);
        Logger.warn("⚠️  Store the secret securely - losing it means losing access to funds!");
        
    } catch (error) {
        Logger.error("❌ Failed to create swap escrow", error as Error);
        
        if (error instanceof InsufficientFundsError) {
            Logger.error("💰 Insufficient funds:");
            Logger.error(`   Required: ${Number(error.details.required) / 1_000_000} ADA`);
            Logger.error(`   Available: ${Number(error.details.available) / 1_000_000} ADA`);
        } else if (error instanceof NetworkError) {
            Logger.error("🌐 Network error - check your connection and Blockfrost configuration");
        } else if (error instanceof Error) {
            if (error.message.includes("404") || error.message.includes("Not Found")) {
                Logger.error("🔍 Address not found. Possible causes:");
                Logger.error("   1. Network mismatch (testnet address with preprod Blockfrost)");
                Logger.error("   2. Address hasn't been funded yet");
                Logger.error("   3. Invalid Blockfrost project ID");
            }
        }
        
        process.exit(1);
    }
}

// Run if called directly
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
    createSwapEscrow();
}

export default createSwapEscrow;