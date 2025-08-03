import { createHash } from "crypto";
import { Logger } from "./logger";
import { ValidationError, TimelockError } from "./errors";

/**
 * Utility functions for swap validation
 */
export class SwapValidation {
    /**
     * Validate secret against hashlock
     */
    static validateSecret(secret: string, expectedHashHex: string): boolean {
        const secretBytes = Buffer.from(secret, 'utf8');
        const providedHash = createHash('sha256').update(secretBytes).digest('hex');
        
        Logger.debug(`Expected hashlock: ${expectedHashHex}`);
        Logger.debug(`Provided hash: ${providedHash}`);
        
        const isValid = expectedHashHex === providedHash;
        Logger.info(`Secret validation: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
        
        return isValid;
    }

    /**
     * Validate PKH match
     */
    static validatePKH(actualPkhHex: string, expectedPkhHex: string, role: string): boolean {
        Logger.debug(`${role} PKH in datum: ${expectedPkhHex}`);
        Logger.debug(`Actual ${role} PKH: ${actualPkhHex}`);
        
        const isValid = expectedPkhHex === actualPkhHex;
        Logger.info(`${role} PKH validation: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
        
        return isValid;
    }

    /**
     * Validate timelock conditions
     */
    static validateTimelock(
        currentTime: number, 
        resolverUnlockDeadline: number, 
        isBeforeDeadlineWithdrawal: boolean = true
    ): boolean {
        Logger.info(`Current time: ${new Date(currentTime).toISOString()}`);
        Logger.info(`Resolver unlock deadline: ${new Date(resolverUnlockDeadline).toISOString()}`);
        Logger.info(`Time until deadline: ${(resolverUnlockDeadline - currentTime) / 1000 / 60} minutes`);

        if (isBeforeDeadlineWithdrawal) {
            const isValid = currentTime <= resolverUnlockDeadline;
            if (!isValid) {
                Logger.warn("⚠️  WARNING: Current time is past the resolver unlock deadline!");
                Logger.warn("The resolver can no longer withdraw with just the secret.");
            } else {
                Logger.success("Within timelock window - resolver can withdraw with secret");
            }
            return isValid;
        } else {
            // After deadline withdrawal logic
            const isValid = currentTime > resolverUnlockDeadline;
            Logger.info(`After deadline withdrawal: ${isValid ? '✅ ALLOWED' : '❌ NOT ALLOWED'}`);
            return isValid;
        }
    }

    /**
     * Extract and convert ByteString to hex
     */
    static byteStringToHex(byteString: any): string {
        if (byteString && byteString._bytes) {
            return Array.from(byteString._bytes as Uint8Array)
                .map((b: number) => b.toString(16).padStart(2, '0'))
                .join('');
        }
        return "";
    }

    /**
     * Parse and validate datum fields
     */
    static parseDatum(datum: any): {
        hashlock: string;
        makerPkh: string;
        resolverPkh: string;
        resolverUnlockDeadline: number;
        resolverCancelDeadline: number;
        publicCancelDeadline: number;
        safetyDeposit: number;
    } {
        if (!datum || !datum.fields || datum.fields.length < 7) {
            throw new ValidationError("Invalid datum structure");
        }

        const fields = datum.fields;
        
        const parsedDatum = {
            hashlock: this.byteStringToHex(fields[0]?.bytes),
            makerPkh: this.byteStringToHex(fields[1]?.bytes),
            resolverPkh: this.byteStringToHex(fields[2]?.bytes),
            resolverUnlockDeadline: Number(fields[3]?.int),
            resolverCancelDeadline: Number(fields[4]?.int),
            publicCancelDeadline: Number(fields[5]?.int),
            safetyDeposit: Number(fields[6]?.int)
        };

        Logger.info("📄 Datum Analysis:");
        Logger.info(`  - Hashlock: ${parsedDatum.hashlock}`);
        Logger.info(`  - Maker PKH: ${parsedDatum.makerPkh}`);
        Logger.info(`  - Resolver PKH: ${parsedDatum.resolverPkh}`);
        Logger.info(`  - Resolver unlock deadline: ${new Date(parsedDatum.resolverUnlockDeadline).toISOString()}`);
        Logger.info(`  - Resolver cancel deadline: ${new Date(parsedDatum.resolverCancelDeadline).toISOString()}`);
        Logger.info(`  - Public cancel deadline: ${new Date(parsedDatum.publicCancelDeadline).toISOString()}`);
        Logger.info(`  - Safety deposit: ${parsedDatum.safetyDeposit / 1_000_000} ADA`);

        return parsedDatum;
    }
}
