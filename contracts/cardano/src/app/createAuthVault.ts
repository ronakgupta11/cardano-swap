// import { 
//     Address, 
//     Credential, 
//     PrivateKey, 
//     Value, 
//     pBSToData, 
//     pByteString, 
//     Script,
//     ScriptType,
//     CredentialType
// } from "@harmoniclabs/plu-ts";

// import getTxBuilder from "./getTxBuilder";
// import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";
// import blockfrost from "./blockfrost";
// import { readFile } from "fs/promises";

// // Simple authorization datum structure
// const AuthDatum = pstruct({
//     AuthDatum: {
//         owner: PPubKeyHash.type
//     }
// });

// async function createAuthVault(Blockfrost: BlockfrostPluts) {
//     const txBuilder = await getTxBuilder(Blockfrost);
    
//     // Read authorization script (you'd need to implement this script too)
//     const authScriptFile = await readFile("./testnet/auth-vault.plutus.json", { encoding: "utf-8" });
//     const authScript = Script.fromCbor(JSON.parse(authScriptFile).cborHex, ScriptType.PlutusV3);
//     const authScriptAddr = new Address("testnet", Credential.script(authScript.hash));

//     // Read user's keys
//     const userPrivateKeyFile = await readFile("./testnet/payment1.skey", { encoding: "utf-8" });
//     const userPrivateKey = PrivateKey.fromCbor(JSON.parse(userPrivateKeyFile).cborHex);
//     const userAddr = await readFile("./testnet/address1.addr", { encoding: "utf-8" });
//     const userAddress = Address.fromString(userAddr);

//     // Get user's UTXOs
//     const utxos = await Blockfrost.addressUtxos(userAddress);
//     const utxo = utxos.find(utxo => utxo.resolved.value.lovelaces >= 20_000_000)!;

//     // Amount to lock in authorization vault
//     const vaultAmount = Value.lovelaces(15_000_000); // 15 ADA + any tokens

//     let tx = await txBuilder.buildSync({
//         inputs: [{ utxo: utxo }],
//         collaterals: [utxo],
//         outputs: [{
//             address: authScriptAddr,
//             value: vaultAmount,
//             datum: AuthDatum.AuthDatum({
//                 owner: pBSToData(pByteString(userAddress.paymentCreds.hash.toBuffer()))
//             })
//         }],
//         changeAddress: userAddress
//     });

//     await tx.signWith(userPrivateKey);
//     const submittedTx = await Blockfrost.submitTx(tx);
    
//     console.log("Authorization vault created:", submittedTx);
//     console.log("Vault address:", authScriptAddr.toString());
// }

// if (process.argv[1].includes("createAuthVault")) {
//     createAuthVault(blockfrost());
// }
