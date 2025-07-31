import FileUtils from '../utils/fileUtils.js';
import { ScriptType, CredentialType, Address, Credential } from '@harmoniclabs/plu-ts';

        const loadValues = async () => {
        const script = await FileUtils.loadScript("./testnet/atomic-swap.plutus.json", ScriptType.PlutusV3);
        const scriptAddr = new Address("testnet", new Credential(CredentialType.Script, script.hash));


         const authVaultScript = await FileUtils.loadScript("./testnet/auth-vault.plutus.json", ScriptType.PlutusV3);
         const authVaultAddr = new Address("testnet", new Credential(CredentialType.Script, authVaultScript.hash));



       const makerPrivateKey = await FileUtils.loadPrivateKey("./testnet/payment1.skey");
        const makerPublicKey = await FileUtils.loadPublicKey("./testnet/payment1.vkey");
        const makerPkh = makerPublicKey.hash;
        const makerAddress = await FileUtils.loadAddress("./testnet/address1.addr");

        const takerPrivateKey = await FileUtils.loadPrivateKey("./testnet/payment2.skey");
        const takerPublicKey = await FileUtils.loadPublicKey("./testnet/payment2.vkey");
        const takerPkh = takerPublicKey.hash;
        const takerAddress = await FileUtils.loadAddress("./testnet/address2.addr");

        return {
            script,
            scriptAddr,
            authVaultScript,
            authVaultAddr,
            makerPrivateKey,
            makerPublicKey,
            makerPkh,
            makerAddress,
            takerPrivateKey,
            takerPublicKey,
            takerPkh,
            takerAddress
        };

        }

        loadValues();

        export {
            loadValues
        };