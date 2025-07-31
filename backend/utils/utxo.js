import{Value} from "@harmoniclabs/plu-ts"

/**
 * Utility functions for UTXO operations
 */
class UTxOUtils {
    /**
     * Extract lovelaces from a Value object
     */
    static getLovelaces(value) {
        return BigInt(value.lovelaces || 0);
    }

    /**
     * Find a UTXO with sufficient funds
     */
    static findUtxoWithFunds(utxos, minAmount) {
        
        const suitableUtxo = utxos.find(utxo => this.getLovelaces(utxo.resolved.value) >= minAmount);
        
        if (!suitableUtxo) {
            throw new Error(
                `No UTXO found with sufficient funds (need at least ${Number(minAmount) / 1_000_000} ADA)`
            );
        }
        
        return suitableUtxo;
    }

    /**
     * Convert a raw UTXO to the format expected by the transaction builder
     */
    static convertUtxo(utxo) {
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
    static getTotalValue(utxos){
        return utxos.reduce((total, utxo) => total + this.getLovelaces(utxo.resolved.value), BigInt(0));
    }

}


export default UTxOUtils;