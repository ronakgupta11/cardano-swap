/**
 * Atomic Swap Implementation for Cardano
 * 
 * This project implements a hash-time-locked contract (HTLC) for atomic swaps
 * on the Cardano blockchain using Plutus v3.
 * 
 * Features:
 * - Create atomic swap escrows
 * - Withdraw using secret (time-locked)
 * - Cancel swaps (resolver-only)
 * - Comprehensive logging and error handling
 * - Type-safe utilities
 */

// Export main contract
export { escrow, compiledEscrow, scriptEscrow, scriptMainnetAddr, scriptTestnetAddr } from "./contract";

// Export datum and redeemer types
export { EscrowDatum } from "./MyDatum";
export { EscrowRedeemer } from "./MyRedeemer";

// Export main functions
export { default as createSwapEscrow } from "./app/createSwapEscrow";
export { default as withdrawFromSwap } from "./app/withdrawFromSwap";
export { default as cancelSwap } from "./app/cancelSwapRefactored";

// Export utilities
export { Logger } from "./app/utils/logger";
export { UTxOUtils } from "./app/utils/utxo";
export { SwapValidation } from "./app/utils/validation";
export { FileUtils } from "./app/utils/fileUtils";
export * from "./app/utils/errors";

// Export configuration functions
export { default as blockfrost } from "./app/blockfrost";
export { default as getTxBuilder } from "./app/getTxBuilder";

// Main execution when run directly
import { scriptEscrow } from "./contract";
import { scriptLOP } from "./lopContract";
import { Logger } from "./app/utils/logger";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";

async function main() {
    try {
        Logger.success("Validator compiled successfully! 🎉");
        
        console.log(
            JSON.stringify(
                scriptEscrow.toJson(),
                undefined,
                2
            )
        );

        // Ensure testnet directory exists and write script file
        if (!existsSync("./testnet")) {
            await mkdir("./testnet");
            Logger.info("📁 Created testnet directory");
        }
        
        await writeFile(
            "./testnet/atomic-swap.plutus.json", 
            JSON.stringify(scriptEscrow.toJson(), undefined, 4)
        );
        await writeFile(
            "./testnet/auth-vault.plutus.json", 
            JSON.stringify(scriptLOP.toJson(), undefined, 4)
        );

        Logger.success("📜 Compiled script saved to ./testnet/atomic-swap.plutus.json");
        Logger.success("📜 Compiled script saved to ./testnet/lock-in-auth-vault.plutus.json");

    } catch (error) {
        Logger.error("❌ Failed to compile or save script", error as Error);
        process.exit(1);
    }
}

// Run main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

/**
 * Example usage:
 * 
 * ```typescript
 * import { createSwapEscrow, withdrawFromSwap, cancelSwap } from './src';
 * 
 * // Create a swap
 * await createSwapEscrow({
 *   secret: "my-secret",
 *   escrowAmount: BigInt(10_000_000), // 10 ADA
 *   deadlineOffset: 1 // 1 hour
 * });
 * 
 * // Withdraw from swap
 * await withdrawFromSwap({
 *   secret: "my-secret"
 * });
 * 
 * // Cancel swap
 * await cancelSwap();
 * ```
 */

// Enable debug logging with environment variable
if (process.env.DEBUG === 'true') {
    Logger.debug('🐛 Debug mode enabled');
}