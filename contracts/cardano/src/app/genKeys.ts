import { existsSync } from "fs";
import { Address, Credential, PublicKey, PrivateKey, PubKeyHash } from "@harmoniclabs/plu-ts";
import { config } from "dotenv";
import { mkdir, writeFile } from "fs/promises";

import pkg from 'blakejs';
const { blake2b } = pkg;

config();

async function genKeys()
{
    const nKeys = 2;

    const promises: Promise<any>[] = [];

    if( !existsSync("./testnet") )
    {
        await mkdir("./testnet");
    }
    
    for( let i = 1; i <= nKeys; i++ )
    {
        // generate public-private keypair
        let keyPair = await globalThis.crypto.subtle.generateKey(
            {
                name: "Ed25519",
                namedCurve: "Ed25519"
              },
              true,
              ["sign", "verify"]
          );
        

        // convert keyPair.(publicKey|privateKey)<CryptoKeyPair> ultimately to PublicKey which can be converted to cborString to store it for future reference

        // Export public key in a way compatible to Cardano CLI
        const publicKeyArrayBuffer = await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey); 
        const publicKeyUint8Array = new Uint8Array(publicKeyArrayBuffer);
        const publicKey = new PublicKey(publicKeyUint8Array);
        const publicKeyHash = new PubKeyHash(blake2b(publicKeyUint8Array, undefined, 28)); // to build Credential
        const pubKeyJsonObj = {
            type: "PaymentVerificationKeyShelley_ed25519",
            description: "Payment Verification Key",
            cborHex: publicKey.toCbor().toString()
        }; // JSON structure similar to the one generated when by Cardano CLI
        const pubKeyJsonStr = JSON.stringify(pubKeyJsonObj, null, 4);
        await writeFile(`./testnet/payment${i}.vkey`, pubKeyJsonStr);

        // Export of the private key in a way that's compatible with the Cardano CLI
        const privateKeyArrayBuffer = await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey); // privateKey cannot be exported 'raw' hence 'pkcs8'
        const privateKeyUint8Array = new Uint8Array(privateKeyArrayBuffer.slice(-32));
        const privateKey = new PrivateKey(privateKeyUint8Array);
        const pvtKeyJsonObj = {
            type: "PaymentSigningKeyShelley_ed25519",
            description: "Payment Signing Key",
            cborHex: privateKey.toCbor().toString()
        }; // JSON structure similar to the one generated when by Cardano CLI
        const pvtKeyJsonStr = JSON.stringify(pvtKeyJsonObj, null, 4);
        await writeFile(`./testnet/payment${i}.skey`, pvtKeyJsonStr);

        // Check that the derivations went fine
        const pubKeyfromPriv = privateKey.derivePublicKey();
        if (pubKeyfromPriv.toString() !== publicKey.toString()) {
            throw new Error("\tPublic key derivation from private key failed");
        }
        else {
            console.log("\tPublic key derivation from private key succeeded");
        }

        // Create the address
        const credential = Credential.keyHash(publicKeyHash);
        const address = new Address("testnet", credential);
        await writeFile(`./testnet/address${i}.addr`, address.toString());
    }   

    // wait for all files to be copied
    await Promise.all( promises );
}
genKeys();