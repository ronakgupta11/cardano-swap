import { Address, PrivateKey, PublicKey, Script } from "@harmoniclabs/plu-ts";
import { readFile } from "fs/promises";
import { NetworkError, ValidationError } from "./errors";
import { Logger } from "./logger";

/**
 * Utility functions for file operations and key management
 */
export class FileUtils {
    /**
     * Read and parse a JSON file
     */
    static async readJsonFile(filePath: string): Promise<any> {
        try {
            Logger.debug(`Reading file: ${filePath}`);
            const content = await readFile(filePath, { encoding: "utf-8" });
            return JSON.parse(content);
        } catch (error) {
            throw new ValidationError(`Failed to read file ${filePath}: ${error}`);
        }
    }

    /**
     * Read a plain text file
     */
    static async readTextFile(filePath: string): Promise<string> {
        try {
            Logger.debug(`Reading text file: ${filePath}`);
            return await readFile(filePath, { encoding: "utf-8" });
        } catch (error) {
            throw new ValidationError(`Failed to read text file ${filePath}: ${error}`);
        }
    }

    /**
     * Load a private key from file
     */
    static async loadPrivateKey(filePath: string): Promise<PrivateKey> {
        try {
            const keyData = await this.readJsonFile(filePath);
            Logger.debug(`Loaded private key from: ${filePath}`);
            return PrivateKey.fromCbor(keyData.cborHex);
        } catch (error) {
            throw new ValidationError(`Failed to load private key from ${filePath}: ${error}`);
        }
    }

    /**
     * Load a public key from file
     */
    static async loadPublicKey(filePath: string): Promise<PublicKey> {
        try {
            const keyData = await this.readJsonFile(filePath);
            Logger.debug(`Loaded public key from: ${filePath}`);
            return PublicKey.fromCbor(keyData.cborHex);
        } catch (error) {
            throw new ValidationError(`Failed to load public key from ${filePath}: ${error}`);
        }
    }

    /**
     * Load an address from file
     */
    static async loadAddress(filePath: string): Promise<Address> {
        try {
            const addressStr = await this.readTextFile(filePath);
            Logger.debug(`Loaded address from: ${filePath}`);
            return Address.fromString(addressStr.trim());
        } catch (error) {
            throw new ValidationError(`Failed to load address from ${filePath}: ${error}`);
        }
    }

    /**
     * Load a compiled script from file
     */
    static async loadScript(filePath: string, scriptType: any): Promise<Script> {
        try {
            const scriptData = await this.readJsonFile(filePath);
            Logger.debug(`Loaded script from: ${filePath}`);
            return Script.fromCbor(scriptData.cborHex, scriptType);
        } catch (error) {
            throw new ValidationError(`Failed to load script from ${filePath}: ${error}`);
        }
    }
}
