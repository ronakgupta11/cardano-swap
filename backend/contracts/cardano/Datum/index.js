

import { pstruct, bs, PPubKeyHash, int } from "@harmoniclabs/plu-ts";

/**
 * On-chain data for the source escrow on Cardano
 */
export const EscrowDatum = pstruct({
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


export const AuthVaultDatum = pstruct({
    AuthVaultDatum: {
        maker_pkh: PPubKeyHash.type,
        expected_escrow_script_hash: bs,
        maker_input_value: int
    }
});




