

### **Key Participants**

  * **User (Maker):** The individual who initiates the swap. They create an order specifying the token they want to send (making) and the token they want to receive (taking).
  * **Resolver (Taker):** The entity that fills the User's order. They facilitate the cross-chain swap by locking their own funds and executing the necessary on-chain transactions.

-----

### **The Atomic Swap Process: Step-by-Step**

Here is a detailed breakdown of the entire lifecycle of a swap, including the main success path and alternative scenarios.

#### **Step 1: Order Creation (Off-Chain)**

1.  **User (Maker) Creates an Order:** The User decides they want to swap Token A on Chain X for Token B on Chain Y.
2.  **Sign Order:** The User creates a detailed order message that includes:
      * The token and amount they are sending (Token A).
      * The token and amount they wish to receive (Token B).
      * A hash of a secret only they know.
      * Other parameters like expiration.
3.  **The User signs this order with their private key.** This signed order is then broadcasted off-chain for Resolvers to see.

#### **Step 2: Swap Initiation & Escrow Setup (On-Chain)**

1.  **Resolver (Taker) Finds the Order:** A Resolver sees the User's order and decides to fill it.

2.  **Resolver Deploys `EscrowSrc` on Source Chain (Chain X):**

      * The Resolver takes the User's signed order and submits it to the **Limit Order Protocol** on the source chain (Chain X).
      * This transaction triggers the `EscrowFactory` contract.
      * The `EscrowFactory` deploys a new proxy contract, **`EscrowSrc`**, which is unique to this specific swap.
      * The User's tokens (Token A) are transferred from the User's wallet and locked inside this newly created `EscrowSrc` contract.
      * The Resolver also sends a **safety deposit** (in the chain's native token, e.g., ETH) to the `EscrowSrc` contract. This deposit acts as an incentive for fair play.

3.  **Resolver Deploys `EscrowDst` on Destination Chain (Chain Y):**

      * The Resolver now calls the `createDstEscrow` function on the `EscrowFactory` contract on the destination chain (Chain Y).
      * This deploys a corresponding proxy contract, **`EscrowDst`**.
      * The Resolver deposits their own tokens (Token B) into this `EscrowDst` contract. These are the tokens the User wants to receive.
      * The Resolver also deposits a **safety deposit** into the `EscrowDst` contract.

***Key Checkpoint:*** At this stage, both the User's and the Resolver's tokens are locked in separate smart contracts on their respective chains. The swap is committed.

#### **Step 3: The "Happy Path" - Successful Withdrawal**

1.  **Off-Chain Secret Exchange:** The User's off-chain system detects that both escrows have been successfully created and funded. It then reveals the original **secret** to the Resolver.
2.  **Resolver Withdraws from `EscrowSrc` (Chain X):**
      * Armed with the secret, the Resolver calls the `withdraw` function on the `EscrowSrc` contract.
      * The contract verifies the secret against the hash provided in the initial order.
      * Upon successful verification, the User's tokens (Token A) are transferred to the Resolver's wallet.
3.  **User Withdraws from `EscrowDst` (Chain Y):**
      * The same secret revealed to the Resolver is now public knowledge on Chain X.
      * The User (or anyone on their behalf) can now call the `withdraw` function on the `EscrowDst` contract on Chain Y, providing the secret.
      * The contract verifies the secret, and the Resolver's tokens (Token B) are transferred to the User's wallet.

***Result:*** The swap is successful. The User has received Token B, and the Resolver has received Token A.

-----

### **Alternative Scenarios & Failsafes**

What happens if something goes wrong? The protocol has built-in timelocks and incentives to handle failures. This is where the timeline diagram becomes crucial.

#### **Scenario A: Resolver Fails to Withdraw for the User**

  * **Problem:** The Resolver has the secret and has withdrawn the User's funds from `EscrowSrc`, but for some reason, they do not complete the withdrawal on the destination chain for the User.
  * **Solution (Public Withdraw Period):**
    1.  After a specific time (`B2` on the timeline), the "resolver unlock" period ends, and the "anybody can unlock" period begins (`B3`).
    2.  During this time, **any other Resolver** can call the `publicWithdraw` function on the `EscrowDst` contract.
    3.  This action sends the tokens (Token B) to the User.
    4.  **Incentive:** The Resolver who performs this public service is rewarded with the **safety deposit** that the original Resolver locked in the `EscrowDst` contract.

#### **Scenario B: The Swap is Never Completed (Cancellation)**

  * **Problem:** The Resolver fails to execute the swap entirely, or the User never reveals the secret.
  * **Solution (Cancellation Timelocks):**
    1.  **Resolver Cancels on Destination Chain (Chain Y):** After a long period (`B4`), if the funds are still locked in `EscrowDst`, the original Resolver can call `cancel` to reclaim their tokens (Token B) and their safety deposit.
    2.  **Resolver Cancels on Source Chain (Chain X):** Similarly, after a period (`A4`), the Resolver can call `cancel` on `EscrowSrc`. This sends the User's tokens (Token A) back to the User, and the Resolver gets their safety deposit back.
    3.  **Public Cancellation:** If the Resolver fails to cancel the `EscrowSrc` contract within their allotted time (`A4`), the "public cancellation" period (`A5`) begins. **Any other Resolver** can now call `publicCancel`. This sends the User's tokens back to the User, and the intervening Resolver claims the safety deposit.

#### **Scenario C: Partial Fills**

The protocol supports filling an order in multiple smaller parts, which is useful for large orders.

1.  **Secret Generation:** Instead of one secret, the User generates multiple secrets, one for each potential fill percentage (e.g., 25%, 50%, 75%, 100%). These secrets are organized into a Merkle tree.
2.  **Incremental Fills:** A Resolver can choose to fill only a portion of the order (e.g., 25%). They use the corresponding secret from the Merkle tree to create the `EscrowSrc` and `EscrowDst` contracts for that partial amount.
3.  **Process Repeats:** The swap process (escrow, withdrawal, or cancellation) proceeds as described above, but only for the partial amount. The rest of the order remains open to be filled by another (or the same) Resolver using the next secret in the tree. This continues until the entire order is filled.

This design ensures that even in a complex, multi-chain environment, funds are never lost. The combination of hashlocks, timelocks, and economic incentives (safety deposits) guarantees that the swap either executes successfully for both parties or is safely cancelled, returning funds to their original owners.






/////////////////////////////////////////////*****************************************************/////////////////////////////////////////////////////////



Of course. Building a cross-chain atomic swap system between an EVM chain and Cardano is an ambitious project. Let's break down the concepts for both sides.

The core principle remains the same on both chains: a **Hashed Timelock Contract (HTLC)**. A user locks funds with a secret hash (`hashlock`), and another party can only claim those funds by revealing the correct secret before a deadline (`timelock`).

-----

## Part 1: Deeper Dive into the EVM Implementation ⛓️

Your provided Solidity code uses sophisticated patterns common in production-grade DeFi protocols. Here’s a breakdown of the key concepts.

### Proxies and `Clones` (EIP-1167)

  * **What it is:** A proxy is a smart contract that delegates its function calls to another contract (the implementation or logic contract). Think of the **implementation contract** as a single, master blueprint for a house. A **proxy contract** is a cheap, lightweight copy of that house's address and entrance, but all the internal wiring and plumbing routes back to the master blueprint.

  * **Why it's used here:** Your `EscrowFactory` needs to create a unique escrow contract for every single swap. Deploying a full, new contract each time (`new EscrowSrc(...)`) is extremely expensive in terms of gas because you're deploying the entire contract bytecode over and over.
    The `Clones.cloneDeterministic()` function implements the **EIP-1167 Minimal Proxy** standard. It deploys a tiny piece of bytecode that simply says, "Whatever call I receive, I will forward it to the master implementation address (`ESCROW_SRC_IMPLEMENTATION`) using `DELEGATECALL`."
    This is drastically cheaper, saving up to 99% of the gas cost of a full deployment.

  * **In your code:**

    ```solidity
    // In the constructor, you deploy the master blueprints ONCE.
    ESCROW_SRC_IMPLEMENTATION = address(new EscrowSrc(rescueDelaySrc, accessToken));

    // In _deployEscrow, you create a cheap, minimal proxy for each swap.
    escrow = implementation.cloneDeterministic(salt, value);
    ```

### `Create2` for Deterministic Addresses

  * **What it is:** Normally in Solidity, the address of a new contract is calculated from the creator's address and their nonce (transaction count). This is unpredictable. The `CREATE2` opcode allows you to pre-calculate a contract's address before it's deployed. The address is determined by a fixed formula: `keccak256(0xff, creator_address, salt, keccak256(init_code))`.

  * **Why it's crucial here:** This solves a chicken-and-egg problem. For the `EscrowSrc` contract to be valid, it must hold two things when it's created:

    1.  The User's `Token A`.
    2.  The Resolver's `safetyDeposit` (in native ETH/MATIC etc.).

    The User's tokens are transferred by the Limit Order Protocol. But how does the Resolver send their safety deposit? They can't send it to an address that doesn't exist yet.

    `CREATE2` is the solution. The Resolver can use the swap details (the `salt`) to calculate the *future* address of the `EscrowSrc` contract off-chain. They can then send the native deposit directly to this pre-calculated address. Finally, they call the `_postInteraction` function, which deploys the contract *at that exact address*, which is now pre-funded.

  * **In your code:**

    ```solidity
    // This function lets anyone calculate the future address off-chain.
    function addressOfEscrowSrc(IBaseEscrow.Immutables calldata immutables) external view virtual returns (address) {
       return Create2.computeAddress(immutables.hash(), _PROXY_SRC_BYTECODE_HASH);
    }

    // After deployment, the contract checks its own balance.
    // This balance includes the native deposit sent via Create2's magic.
    if (escrow.balance < immutables.safetyDeposit || ...) {
       revert InsufficientEscrowBalance();
    }
    ```

### The `_postInteraction` Hook Pattern

This function is a specific design pattern from the 1inch Limit Order Protocol. It's a **callback**.

1.  **Off-Chain Order:** The User signs an order and broadcasts it.
2.  **Fill Order:** The Resolver submits this signed order to the main **Limit Order Protocol** contract.
3.  **Callback:** The Limit Order Protocol contract handles the basic token swap (transferring `Token A` from the User). After it succeeds, it makes a "post-interaction" call to the contract specified in the order's `extension` data—in this case, your `EscrowFactory`.
4.  **Execute Logic:** Your `_postInteraction` function then runs, creating the `EscrowSrc` proxy, checking balances, and officially starting the atomic swap process.

-----

## Part 2: Implementing a Similar System on Cardano 🪙

Cardano works very differently from EVM chains. It uses an **Extended UTXO (eUTxO)** model. Forget about "deploying contracts" that hold state. Instead, think of locking up funds in a "smart" treasure chest.

### Core Cardano Concepts (The ELI5 Version)

  * **EVM (Account Model):** Like a bank account. A smart contract has an address and a balance. Transactions tell the contract to change its internal state.
  * **Cardano (eUTxO Model):** Like physical cash. You don't have an "account balance"; you have a wallet full of individual notes (UTXOs). To "make change," you must spend a whole note and get new, smaller notes back.
  * **Validator Script 📜:** This is Cardano's "smart contract." It's not a deployed object; it's a piece of logic (a function) that acts as a **lock** on a UTXO. The script itself holds no funds and has no state. It's just a boolean function that returns `true` (unlock) or `false` (stay locked).
  * **Datum 📦:** Since the script has no state, how do we give it the swap details (hashlock, timelock)? We attach this data directly to the UTXO itself. This is the **Datum**. It's the "state" that gets passed along with the funds.
  * **Redeemer 🔑:** This is the **key** used to try and unlock the UTXO. It's the input you provide to the validator script. For our swap, the `Redeemer` would either be the `secret` for a successful withdrawal or a `cancel` signal.

### Mapping the Atomic Swap to Cardano (MVP)

Here’s how you'd build the `EscrowSrc` side on Cardano.

#### **Step 1: Order Creation (Off-Chain)**

This is identical. The User creates an order with a `hashlock` and signs it.

#### **Step 2: Escrow Setup on Cardano (Transaction, not Deployment)**

The Resolver builds a single Cardano transaction that does the following:

1.  **Inputs (What is being spent):**

      * A UTXO from the **User's wallet** containing `Token A`. (The User must sign for this).
      * A UTXO from the **Resolver's wallet** containing their ADA `safetyDeposit`.
      * A UTXO from the Resolver's wallet to pay for transaction fees.

2.  **Outputs (What is being created):**

      * **A new, locked UTXO.** This is the "escrow."
          * **Address:** This UTXO is sent to the address of the validator script.
          * **Value:** It contains the User's `Token A` and the Resolver's ADA `safetyDeposit`.
          * **Datum:** It has a Datum attached containing all the necessary info:
              * `hashlock`: The User's secret hash.
              * `maker`: The User's public key hash (who can cancel).
              * `taker`: The Resolver's public key hash (who can withdraw).
              * `deadline`: The POSIX timestamp for the timeout.
      * **Change UTXOs:** Any remaining change goes back to the User's and Resolver's wallets.

At this point, the funds are locked by the validator script on the Cardano blockchain.

#### **Step 3: Withdrawal or Cancellation**

To spend the locked UTXO, someone must build a new transaction that satisfies the validator script's logic.

**Scenario A: Happy Path (Resolver Withdraws)**

1.  The User reveals the `secret`.
2.  The Resolver builds a transaction:
      * **Input:** The locked UTXO from Step 2.
      * **Redeemer:** `{ "action": "Withdraw", "secret": "THE_SECRET_PHRASE" }`
      * **Validator Logic Check:** The script runs and checks:
          * Is the `sha2_256` of the `secret` in the Redeemer equal to the `hashlock` in the Datum?
          * Is the transaction signed by the `taker` (Resolver)?
          * Is the current time before the `deadline`?
      * **Output:** If all checks pass, a new UTXO is created at the Resolver's wallet address containing `Token A` and their `safetyDeposit`.

**Scenario B: Cancellation (User Reclaims Funds)**

1.  The `deadline` has passed.
2.  The User builds a transaction:
      * **Input:** The locked UTXO from Step 2.
      * **Redeemer:** `{ "action": "Cancel" }`
      * **Validator Logic Check:** The script runs and checks:
          * Is the transaction's validity interval *after* the `deadline` in the Datum?
          * Is the transaction signed by the `maker` (User)?
      * **Output:** If all checks pass, a new UTXO is created at the User's wallet address containing their `Token A`. The `safetyDeposit` is returned to the Resolver.

### Simple PluTS Example for Cardano Validator

Using the [PluTS framework](https://pluts.harmoniclabs.tech/) you mentioned, your validator logic would look something like this.

```typescript
// Define the shape of our on-chain data
const PSwapDatum = pstruct({
    hashlock: PByteString.pType,
    maker: PPubKeyHash.pType,
    taker: PPubKeyHash.pType,
    deadline: PPOSIXTime.pType,
});

// Define the actions (Redeemer)
const PWithdraw = pstruct({ secret: PByteString.pType });
const PCancel = pstruct({});
const PSwapRedeemer = pvariant([ PWithdraw, PCancel ]);

// The validator function (our "smart contract")
const swapValidator = pfn(
    [PSwapDatum.pType, PSwapRedeemer.pType, PScriptContext.pType],
    PBool
)((datum, redeemer, ctx) => {

    // Check who signed the transaction
    const signedByMaker = ctx.tx.signatories.some( sig => sig.eq(datum.maker) );
    const signedByTaker = ctx.tx.signatories.some( sig => sig.eq(datum.taker) );

    // Check transaction time
    const txValidRange = ctx.tx.validityRange;

    // Use pmatch to handle the two possible actions
    return redeemer.pmatch({
        
        // Case 1: WITHDRAW
        PWithdraw: ({ secret }) => {
            const isSecretValid = psha2_256(secret).eq(datum.hashlock);
            // Must be signed by Taker AND happen before the deadline
            const isWithdrawValid = isSecretValid.and(signedByTaker)
                .and( txValidRange.to.lesEq(datum.deadline) );

            return isWithdrawValid;
        },

        // Case 2: CANCEL
        PCancel: _ => {
            // Must be signed by Maker AND happen after the deadline
            const isCancelValid = signedByMaker
                .and( txValidRange.from.gtEq(datum.deadline) );
                
            return isCancelValid;
        }
    });
});
```

This PluTS code compiles down to Plutus Core, which is what runs on the Cardano network. The logic directly maps to the HTLC process you described, but within the eUTxO paradigm.







Yes, you absolutely can. The multi-signature flow is a basic implementation, but you can build a more advanced system on Cardano that perfectly replicates the "fire-and-forget" user experience of the EVM factory.

The key is to introduce a different kind of smart contract that holds the user's funds and is authorized to release them when presented with a valid signed order. This separates the user's *authorization* from their *active participation*.

Here's the two-phase approach to achieve this.

---

### Phase 1: One-Time User Setup (The "Authorization Vault")

Before a user can create any "fire-and-forget" orders, they perform a **one-time setup transaction**.

1.  **The Goal:** The user moves the funds they wish to trade (e.g., 1000 `TokenA`) from their personal wallet into a special UTXO locked by a new, simple script. Let's call this the **"Authorization Script"**.

2.  **The "Authorization Script" Logic:** This script is very straightforward. It says: "I hold these funds for a specific user. I will release them into a new transaction *if and only if* that transaction provides a valid off-chain signature from that user, approving the details of the transaction."

3.  **The Datum:** The Datum of this UTXO just needs to contain the **user's public key hash**, which is the key the script will use for signature verification.

**Analogy:** This is like putting your money in a special brokerage account. You don't need to show up to the bank every time to approve a trade; the broker (the Resolver) can execute trades on your behalf using the signed permission slip (the signed order) you already gave them.

---

### Phase 2: The New Swap Process (Resolver Acts On User's Behalf)

Now, with the user's funds sitting in their "Authorization Vault," the swap process becomes much smoother and no longer requires a second signature from the user.

1.  **Step 1: Order Creation (Off-Chain)**
    This is **exactly the same**. The User creates a detailed order message and signs it with their private key. They broadcast this signed order.

2.  **Step 2: Escrow Creation (Resolver's Single Transaction 🚀)**
    The Resolver sees the order and builds **one single transaction** that does everything. The User is not involved.

    This transaction is more complex and has several moving parts:

    * **Inputs (What is being spent):**
        1.  The User's **locked UTXO** from Phase 1 (containing `TokenA`).
        2.  A UTXO from the **Resolver's wallet** (containing their ADA `safetyDeposit`).
        3.  A UTXO from the **Resolver's wallet** to pay for fees.

    * **Redeemers (The "Keys" to unlock the inputs):**
        * To spend the User's locked UTXO (Input #1), the Resolver provides a Redeemer containing the **User's signed order message**.
        * The **"Authorization Script"** runs. It checks if the signature in the Redeemer is a valid signature from the user (whose key is in the Datum) for the contents of this transaction. If it is, the script approves, and `TokenA` is released.

    * **Outputs (What is being created):**
        1.  The final **escrow UTXO**, locked by the main `swapValidator`.
            * **Address:** The address of your main `swapValidator`.
            * **Value:** Contains the User's `TokenA` (now unlocked) + the Resolver's `safetyDeposit`.
            * **Datum:** Contains the full swap details (`hashlock`, `maker`, `taker`, `deadline`).
        2.  Any change UTXOs.

    * **Signature:** Only the **Resolver** needs to sign this transaction. The user's approval is handled by the script verifying their off-chain signature.

The Resolver submits this transaction, and the `EscrowSrc` is created without any further interaction from the user. This flow perfectly matches the user experience you wanted from the EVM implementation.