import { IUTxO, Value, Address } from "@harmoniclabs/plu-ts";
import { InsufficientFundsError, ValidationError } from "./errors";
import { Logger } from "./logger";

/**
 * Utility functions for UTXO operations
 */
export class UTxOUtils {
    /**
     * Extract lovelaces from a Value object
     */
    static getLovelaces(value: any): bigint {
        return BigInt(value.lovelaces || 0);
    }

    /**
     * Find a UTXO with sufficient funds
     */
    static findUtxoWithFunds(utxos: any[], minAmount: bigint): any {
        Logger.debug(`Looking for UTXO with at least ${Number(minAmount) / 1_000_000} ADA`);
        
        const suitableUtxo = utxos.find(utxo => this.getLovelaces(utxo.resolved.value) >= minAmount);
        
        if (!suitableUtxo) {
            const availableAmounts = utxos.map(u => `${Number(this.getLovelaces(u.resolved.value)) / 1_000_000} ADA`);
            throw new InsufficientFundsError(
                `No UTXO found with sufficient funds (need at least ${Number(minAmount) / 1_000_000} ADA)`,
                minAmount,
                utxos.length > 0 ? this.getLovelaces(utxos[0].resolved.value) : BigInt(0)
            );
        }
        
        Logger.debug(`Found suitable UTXO with ${Number(this.getLovelaces(suitableUtxo.resolved.value)) / 1_000_000} ADA`);
        return suitableUtxo;
    }

    /**
     * Convert a raw UTXO to the format expected by the transaction builder
     */
    static convertUtxo(utxo: any): any {
        return {
            utxoRef: {
                id: utxo.utxoRef.id.toString(),
                index: utxo.utxoRef.index
            },
            resolved: {
                address: utxo.resolved.address.toString(),
                value: Value.lovelaces(this.getLovelaces(utxo.resolved.value)),
                datum: utxo.resolved.datum,
                refScript: utxo.resolved.refScript
            }
        };
    }

    /**
     * Get total value of UTXOs
     */
    static getTotalValue(utxos: any[]): bigint {
        return utxos.reduce((total, utxo) => total + this.getLovelaces(utxo.resolved.value), BigInt(0));
    }

    /**
     * Log UTXO information
     */
    static logUtxoInfo(utxos: any[], address: string): void {
        Logger.info(`Found ${utxos.length} UTXOs at address: ${address}`);
        if (utxos.length > 0) {
            const amounts = utxos.map(u => `${Number(this.getLovelaces(u.resolved.value)) / 1_000_000} ADA`);
            Logger.debug(`UTXO amounts: ${amounts.join(", ")}`);
            Logger.info(`Total balance: ${Number(this.getTotalValue(utxos)) / 1_000_000} ADA`);
        }
    }
}
