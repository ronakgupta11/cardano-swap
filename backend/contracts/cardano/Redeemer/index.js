import { bs, pstruct,PPubKeyHash,int } from "@harmoniclabs/plu-ts";

/**
 * Redeemer structure for the source escrow on Cardano
 */

export const EscrowRedeemer = pstruct({
  // Action to claim the funds using the secret.
  Withdraw: { secret: bs },
  // Action to cancel the swap after a timeout.
  Cancel: {}
}); 


export const AuthVaultRedeemer = pstruct({
    CreateEscrow: {
        resolver_pkh: PPubKeyHash.type,
        safety_deposit_amount: int
    }
});

