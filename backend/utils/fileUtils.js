import { Address, PrivateKey, PublicKey, Script } from "@harmoniclabs/plu-ts";
import { readFile } from "fs/promises";

/**
 * Utility functions for file operations and key management
 */
export class FileUtils {
    /**
     * Read and parse a JSON file
     */
    static async readJsonFile(filePath){
        try {
            const content = await readFile(filePath, { encoding: "utf-8" });
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error}`);
        }
    }

    /**
     * Read a plain text file
     */
    static async readTextFile(filePath){
        try {
            return await readFile(filePath, { encoding: "utf-8" });
        } catch (error) {
            throw new Error(`Failed to read text file ${filePath}: ${error}`);
        }
    }

    /**
     * Load a private key from file
     */
    static async loadPrivateKey(filePath){
        try {
            const keyData = await this.readJsonFile(filePath);
            return PrivateKey.fromCbor(keyData.cborHex);
        } catch (error) {
            throw new Error(`Failed to load private key from ${filePath}: ${error}`);
        }
    }

    /**
     * Load a public key from file
     */
    static async loadPublicKey(filePath){
        try {
            const keyData = await this.readJsonFile(filePath);
            return PublicKey.fromCbor(keyData.cborHex);
        } catch (error) {
            throw new Error(`Failed to load public key from ${filePath}: ${error}`);
        }
    }

    /**
     * Load an address from file
     */
    static async loadAddress(filePath){
        try {
            const addressStr = await this.readTextFile(filePath);
            return Address.fromString(addressStr.trim());
        } catch (error) {
            throw new Error(`Failed to load address from ${filePath}: ${error}`);
        }
    }

    /**
     * Load a compiled script from file
     */
    static async loadScript(filePath, scriptType) {
        try {
            const scriptData = await this.readJsonFile(filePath);
            return Script.fromCbor(scriptData.cborHex, scriptType);
        } catch (error) {
            throw new Error(`Failed to load script from ${filePath}: ${error}`);
        }
    }
}
