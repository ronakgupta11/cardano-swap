import { 
    Address, 
    Credential, 
    PrivateKey, 
    Value, 
    pBSToData, 
    pByteString, 
    Script,
    ScriptType
} from "@harmoniclabs/plu-ts";

import { EscrowRedeemer } from "../MyRedeemer";
import getTxBuilder from "./getTxBuilder";
import blockfrost from "./blockfrost";
import { createHash } from "crypto";

// Import utilities
import { Logger } from "./utils/logger";
import { SwapError, NetworkError, ValidationError, TimelockError } from "./utils/errors";
import { UTxOUtils } from "./utils/utxo";
import { FileUtils } from "./utils/fileUtils";
import { SwapValidation } from "./utils/validation";

/**
 * Configuration for withdrawal
 */
interface WithdrawConfig {
    secret: string;
    validityWindowSlots?: number;
}

/**
 * Withdraw funds from an atomic swap escrow
 */
async function withdrawFromSwap(config?: Partial<WithdrawConfig>): Promise<void> {
    const defaultConfig: WithdrawConfig = {
        secret: "atomic-swap-1753383645915-684062194fe9b44a",
        validityWindowSlots: 100
    };

    const finalConfig = { ...defaultConfig, ...config };
    
    Logger.info("💰 Starting withdrawal from atomic swap escrow");
    Logger.info(`🔑 Using secret: ${finalConfig.secret}`);

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

        // Prepare secret
        const secretBytes = Buffer.from(finalConfig.secret, 'utf8');
        Logger.debug(`Secret bytes length: ${secretBytes.length}`);

        // Find the swap UTXO at the script address
        Logger.info("🔍 Fetching UTXOs from script address...");
        const scriptUtxos = await Blockfrost.addressUtxos(scriptAddr.toString());
        
        if (scriptUtxos.length === 0) {
            throw new NetworkError("No UTXOs found at script address. Ensure the escrow was created successfully.");
        }
        
        Logger.success(`Found ${scriptUtxos.length} UTXO(s) at script address`);
        
        // Find the swap UTXO that matches our secret's hashlock
        Logger.info("🔍 Looking for UTXO with matching hashlock...");
        
        // Generate the hashlock from our secret to match against
        //const secretHash = createHash('sha256').update(secretBytes).digest('hex'); // for testing we will place the hashloack here
        const secretHash= "1dfed0c7f0e5583c2b60141f773359f74a8dda442daa59c41269926b567f4c4d"
        Logger.debug(`Secret hash: ${secretHash}`);
        
        const swapUtxo = scriptUtxos.find(utxo => {
            try {
                // Parse the datum to check if the hashlock matches
                const parsedDatum = SwapValidation.parseDatum(utxo.resolved.datum);
                const utxoHashlock = parsedDatum.hashlock.toLowerCase();
                const matches = utxoHashlock === secretHash.toLowerCase();
                
                Logger.debug(`UTXO hashlock: ${utxoHashlock}, Match: ${matches ? '✅' : '❌'}`);
                return matches;
            } catch (error) {
                Logger.debug(`Failed to parse UTXO datum: ${error}`);
                return false;
            }
        });
        
        if (!swapUtxo) {
            throw new ValidationError(
                `No UTXO found with matching hashlock for the provided secret. ` +
                `Expected hashlock: ${secretHash}. ` +
                `Make sure you're using the correct secret for this swap.`
            );
        }
        
        Logger.success(`Found matching UTXO with hashlock: ${secretHash}`);

        Logger.debug("Swap UTXO structure validated");

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

        // Validate secret
        Logger.info("🔐 Validating secret...");
        if (!SwapValidation.validateSecret(finalConfig.secret, parsedDatum.hashlock)) {
            throw new ValidationError(
                `Secret hash mismatch! Expected: ${parsedDatum.hashlock}, ` +
                `Got hash of provided secret. Check if the secret is correct.`
            );
        }

        // Check timelock conditions
        Logger.info("⏰ Checking timelock conditions...");
        const now = Date.now();
        const isWithinWindow = SwapValidation.validateTimelock(
            now, 
            parsedDatum.resolverUnlockDeadline, 
            true
        );

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
                "This transaction will fail because the contract requires the correct resolver to sign."
            );
        }

        // Build withdrawal transaction
        Logger.info("🏗️  Building withdrawal transaction...");
        
        // Get current slot for validity interval
        const chainTip = await Blockfrost.getChainTip();
        const currentSlot = chainTip.slot!;
        const validityWindow = finalConfig.validityWindowSlots!;
        
        Logger.info(`⏰ Setting transaction validity from slot ${currentSlot} to ${currentSlot + validityWindow}`);

        // Load maker's address to send escrow amount back
        const makerAddress = await FileUtils.loadAddress("./testnet/address1.addr");
        Logger.info(`📍 Maker address: ${makerAddress.toString()}`);

        // Calculate distribution amounts
        const safetyDepositAmount = BigInt(parsedDatum.safetyDeposit) // Subtract fees
        const totalEscrowValue = UTxOUtils.getLovelaces(swapUtxo.resolved.value);
        const escrowAmount = totalEscrowValue - safetyDepositAmount;

        Logger.info("💰 Fund distribution:");
        Logger.info(`   Safety deposit to resolver: ${Number(safetyDepositAmount) / 1_000_000} ADA`);
        Logger.info(`   Escrow amount to maker: ${Number(escrowAmount) / 1_000_000} ADA`);
        Logger.info(`   Total: ${Number(totalEscrowValue) / 1_000_000} ADA`);
        
        const tx = await txBuilder.buildSync({
            inputs: [
                { 
                    utxo: UTxOUtils.convertUtxo(swapUtxo),
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
                    address: makerAddress.toString(),
                    value: Value.lovelaces(escrowAmount) // Main escrow amount to maker
                }
            ],
            collaterals: [UTxOUtils.convertUtxo(collateralUtxo)],
            changeAddress: resolverAddress.toString(), // Any remaining fees go to resolver
            requiredSigners: [resolverPrivateKey.derivePublicKey().hash], // Required for before-deadline withdrawal
            invalidBefore: currentSlot,
            invalidAfter: currentSlot + validityWindow
        });

        // Sign and submit transaction
        Logger.info("✍️  Signing transaction...");
        await tx.signWith(resolverPrivateKey);
        
        Logger.info("📡 Submitting transaction to network...");
        const submittedTx = await Blockfrost.submitTx(tx.toCbor().toString());
        
        // Success output
        Logger.success("🎉 Withdrawal successful!");
        Logger.info(`📝 Transaction hash: ${submittedTx}`);
        Logger.info(`� Secret used: ${finalConfig.secret}`);
        Logger.info("💰 Funds distributed:");
        Logger.info(`   ✅ Safety deposit (${Number(safetyDepositAmount) / 1_000_000} ADA) → Resolver: ${resolverAddress.toString()}`);
        Logger.info(`   ✅ Escrow amount (${Number(escrowAmount) / 1_000_000} ADA) → Maker: ${makerAddress.toString()}`);
        Logger.success("Atomic swap completed successfully! 🎊");
        
    } catch (error) {
        Logger.error("❌ Failed to withdraw from swap", error as Error);
        
        if (error instanceof ValidationError) {
            Logger.error("🔍 Validation failed:");
            Logger.error(`   ${error.message}`);
        } else if (error instanceof TimelockError) {
            Logger.error("⏰ Timelock validation failed:");
            Logger.error(`   Current time: ${new Date(error.details.currentTime).toISOString()}`);
            Logger.error(`   Deadline: ${new Date(error.details.deadline).toISOString()}`);
        } else if (error instanceof NetworkError) {
            Logger.error("🌐 Network error:");
            if (error.message.includes("No UTXOs found at script address")) {
                Logger.error("   Make sure:");
                Logger.error("   1. The escrow was created successfully");
                Logger.error("   2. The script address is correct");
                Logger.error("   3. The transaction hasn't been spent already");
            } else if (error.message.includes("No UTXOs found at resolver address")) {
                Logger.error("   Make sure the resolver address has funds for fees and collateral");
            }
        } else if (error instanceof Error) {
            if (error.message.includes("script execution failed")) {
                Logger.error("💻 Script validation failed. Check:");
                Logger.error("   1. The secret is correct");
                Logger.error("   2. The timelock conditions are met");
                Logger.error("   3. The resolver is allowed to withdraw");
            }
        }
        
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    withdrawFromSwap();
}

export default withdrawFromSwap;

