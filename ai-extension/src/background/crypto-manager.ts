/**
 * Crypto Manager
 * Implements Web Crypto API encryption with AES-256-GCM and PBKDF2 key derivation
 * Requirements: 5.2, 19.1
 */

import { logger } from "./monitoring.js";

/**
 * Crypto error types
 */
export enum CryptoErrorType {
  ENCRYPTION_FAILED = "ENCRYPTION_FAILED",
  DECRYPTION_FAILED = "DECRYPTION_FAILED",
  KEY_DERIVATION_FAILED = "KEY_DERIVATION_FAILED",
  KEY_GENERATION_FAILED = "KEY_GENERATION_FAILED",
  INVALID_DATA = "INVALID_DATA",
  NOT_INITIALIZED = "NOT_INITIALIZED",
  UNKNOWN = "UNKNOWN",
}

/**
 * Crypto error class
 */
export class CryptoError extends Error {
  constructor(
    public type: CryptoErrorType,
    message: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = "CryptoError";
  }
}

/**
 * Encrypted data structure
 * Contains all information needed to decrypt data
 */
export interface EncryptedData {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded salt (used for key derivation) */
  salt: string;
  /** Algorithm used for encryption */
  algorithm: "AES-GCM";
  /** Version for future compatibility */
  version: number;
}

/**
 * Key derivation configuration
 */
interface KeyDerivationConfig {
  /** Number of PBKDF2 iterations (OWASP recommends 100,000+) */
  iterations: number;
  /** Hash algorithm for PBKDF2 */
  hash: string;
  /** Salt length in bytes */
  saltLength: number;
}

/**
 * Encryption configuration
 */
interface EncryptionConfig {
  /** Algorithm name */
  algorithm: "AES-GCM";
  /** Key length in bits */
  keyLength: 256;
  /** IV length in bytes */
  ivLength: 12;
  /** Tag length in bits (for GCM authentication) */
  tagLength: 128;
}

/**
 * Default configurations
 */
const DEFAULT_KEY_DERIVATION_CONFIG: KeyDerivationConfig = {
  iterations: 100000, // OWASP recommendation
  hash: "SHA-256",
  saltLength: 16, // 128 bits
};

const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: "AES-GCM",
  keyLength: 256,
  ivLength: 12, // 96 bits (recommended for GCM)
  tagLength: 128, // 128 bits (recommended for GCM)
};

/**
 * Crypto Manager
 * Provides encryption/decryption services using Web Crypto API
 *
 * Features:
 * - AES-256-GCM authenticated encryption
 * - PBKDF2 key derivation with 100,000 iterations
 * - Secure random IV generation for each encryption
 * - Base64 encoding for storage compatibility
 */
export class CryptoManager {
  private masterKey: CryptoKey | null = null;
  private initialized = false;
  private keyDerivationConfig: KeyDerivationConfig;
  private encryptionConfig: EncryptionConfig;

  constructor(
    keyDerivationConfig: Partial<KeyDerivationConfig> = {},
    encryptionConfig: Partial<EncryptionConfig> = {},
  ) {
    this.keyDerivationConfig = {
      ...DEFAULT_KEY_DERIVATION_CONFIG,
      ...keyDerivationConfig,
    };
    this.encryptionConfig = {
      ...DEFAULT_ENCRYPTION_CONFIG,
      ...encryptionConfig,
    };
  }

  /**
   * Initialize the crypto manager with a master key
   * The master key can be derived from a password or generated randomly
   *
   * @param password - Optional password to derive key from
   * @param salt - Optional salt for key derivation (required if password provided)
   */
  async initialize(password?: string, salt?: Uint8Array): Promise<void> {
    try {
      if (password) {
        if (!salt) {
          throw new CryptoError(
            CryptoErrorType.KEY_DERIVATION_FAILED,
            "Salt is required when deriving key from password",
          );
        }
        this.masterKey = await this.deriveKey(password, salt);
      } else {
        this.masterKey = await this.generateMasterKey();
      }

      this.initialized = true;
      logger.info("CryptoManager", "Initialized", {
        keyDerivation: password ? "password-based" : "generated",
      });
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.KEY_GENERATION_FAILED,
        "Failed to initialize crypto manager",
        error,
      );
    }
  }

  /**
   * Check if the crypto manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.masterKey !== null;
  }

  /**
   * Generate a new random master key
   * Uses Web Crypto API to generate a cryptographically secure key
   */
  async generateMasterKey(): Promise<CryptoKey> {
    try {
      const key = await crypto.subtle.generateKey(
        {
          name: this.encryptionConfig.algorithm,
          length: this.encryptionConfig.keyLength,
        },
        true, // extractable
        ["encrypt", "decrypt"],
      );

      logger.debug("CryptoManager", "Master key generated");
      return key;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.KEY_GENERATION_FAILED,
        "Failed to generate master key",
        error,
      );
    }
  }

  /**
   * Derive a key from a password using PBKDF2
   *
   * @param password - Password to derive key from
   * @param salt - Salt for key derivation
   * @returns Derived CryptoKey
   */
  async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    try {
      // Import password as key material
      const passwordKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"],
      );

      // Derive key using PBKDF2
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: new Uint8Array(salt.buffer as ArrayBuffer),
          iterations: this.keyDerivationConfig.iterations,
          hash: this.keyDerivationConfig.hash,
        },
        passwordKey,
        {
          name: this.encryptionConfig.algorithm,
          length: this.encryptionConfig.keyLength,
        },
        false, // not extractable for security
        ["encrypt", "decrypt"],
      );

      logger.debug("CryptoManager", "Key derived from password", {
        iterations: this.keyDerivationConfig.iterations,
      });
      return derivedKey;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.KEY_DERIVATION_FAILED,
        "Failed to derive key from password",
        error,
      );
    }
  }

  /**
   * Generate a random salt for key derivation
   */
  generateSalt(): Uint8Array {
    return crypto.getRandomValues(
      new Uint8Array(this.keyDerivationConfig.saltLength),
    );
  }

  /**
   * Generate a random initialization vector (IV)
   */
  private generateIV(): Uint8Array {
    return crypto.getRandomValues(
      new Uint8Array(this.encryptionConfig.ivLength),
    );
  }

  /**
   * Encrypt data using AES-256-GCM
   *
   * @param data - Data to encrypt (string or object)
   * @returns Encrypted data with IV and salt
   */
  async encrypt(data: string | object): Promise<EncryptedData> {
    if (!this.isInitialized()) {
      throw new CryptoError(
        CryptoErrorType.NOT_INITIALIZED,
        "Crypto manager not initialized. Call initialize() first.",
      );
    }

    try {
      // Convert data to string if it's an object
      const plaintext = typeof data === "string" ? data : JSON.stringify(data);
      const plaintextBuffer = new TextEncoder().encode(plaintext);

      // Generate random IV for this encryption
      const iv = this.generateIV();

      // Generate salt (for future key rotation support)
      const salt = this.generateSalt();

      // Encrypt using AES-GCM
      const ciphertextBuffer = await crypto.subtle.encrypt(
        {
          name: this.encryptionConfig.algorithm,
          iv: new Uint8Array(iv.buffer as ArrayBuffer),
          tagLength: this.encryptionConfig.tagLength,
        },
        this.masterKey!,
        plaintextBuffer,
      );

      // Convert to base64 for storage
      const encryptedData: EncryptedData = {
        ciphertext: this.arrayBufferToBase64(ciphertextBuffer),
        iv: this.arrayBufferToBase64(iv.buffer as ArrayBuffer),
        salt: this.arrayBufferToBase64(salt.buffer as ArrayBuffer),
        algorithm: this.encryptionConfig.algorithm,
        version: 1,
      };

      logger.debug("CryptoManager", "Data encrypted", {
        plaintextSize: plaintextBuffer.length,
        ciphertextSize: ciphertextBuffer.byteLength,
      });

      return encryptedData;
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.ENCRYPTION_FAILED,
        "Failed to encrypt data",
        error,
      );
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   *
   * @param encryptedData - Encrypted data with IV and salt
   * @param returnAsObject - If true, parse result as JSON object
   * @returns Decrypted data
   */
  async decrypt<T = string>(
    encryptedData: EncryptedData,
    returnAsObject = false,
  ): Promise<T> {
    if (!this.isInitialized()) {
      throw new CryptoError(
        CryptoErrorType.NOT_INITIALIZED,
        "Crypto manager not initialized. Call initialize() first.",
      );
    }

    try {
      // Validate encrypted data structure
      if (
        !encryptedData.ciphertext ||
        !encryptedData.iv ||
        !encryptedData.algorithm
      ) {
        throw new CryptoError(
          CryptoErrorType.INVALID_DATA,
          "Invalid encrypted data structure",
        );
      }

      // Convert from base64
      const ciphertextBuffer = this.base64ToArrayBuffer(
        encryptedData.ciphertext,
      );
      const iv = this.base64ToArrayBuffer(encryptedData.iv);

      // Decrypt using AES-GCM
      const plaintextBuffer = await crypto.subtle.decrypt(
        {
          name: encryptedData.algorithm,
          iv,
          tagLength: this.encryptionConfig.tagLength,
        },
        this.masterKey!,
        ciphertextBuffer,
      );

      // Convert to string
      const plaintext = new TextDecoder().decode(plaintextBuffer);

      logger.debug("CryptoManager", "Data decrypted", {
        ciphertextSize: ciphertextBuffer.byteLength,
        plaintextSize: plaintextBuffer.byteLength,
      });

      // Parse as JSON if requested
      if (returnAsObject) {
        try {
          return JSON.parse(plaintext) as T;
        } catch (error) {
          throw new CryptoError(
            CryptoErrorType.DECRYPTION_FAILED,
            "Failed to parse decrypted data as JSON",
            error,
          );
        }
      }

      return plaintext as T;
    } catch (error) {
      if (error instanceof CryptoError) {
        throw error;
      }
      throw new CryptoError(
        CryptoErrorType.DECRYPTION_FAILED,
        "Failed to decrypt data",
        error,
      );
    }
  }

  /**
   * Export the master key as a base64 string
   * WARNING: Only use this for secure storage or key backup
   */
  async exportMasterKey(): Promise<string> {
    if (!this.isInitialized()) {
      throw new CryptoError(
        CryptoErrorType.NOT_INITIALIZED,
        "Crypto manager not initialized",
      );
    }

    try {
      const exportedKey = await crypto.subtle.exportKey("raw", this.masterKey!);
      return this.arrayBufferToBase64(exportedKey);
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.KEY_GENERATION_FAILED,
        "Failed to export master key",
        error,
      );
    }
  }

  /**
   * Import a master key from a base64 string
   */
  async importMasterKey(keyBase64: string): Promise<void> {
    try {
      const keyBuffer = this.base64ToArrayBuffer(keyBase64);
      this.masterKey = await crypto.subtle.importKey(
        "raw",
        keyBuffer,
        {
          name: this.encryptionConfig.algorithm,
          length: this.encryptionConfig.keyLength,
        },
        true,
        ["encrypt", "decrypt"],
      );

      this.initialized = true;
      logger.info("CryptoManager", "Master key imported");
    } catch (error) {
      throw new CryptoError(
        CryptoErrorType.KEY_GENERATION_FAILED,
        "Failed to import master key",
        error,
      );
    }
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Clear the master key from memory
   * Call this when encryption is no longer needed
   */
  clear(): void {
    this.masterKey = null;
    this.initialized = false;
    logger.info("CryptoManager", "Cleared master key from memory");
  }
}

/**
 * Singleton instance for convenience
 */
let _cryptoManager: CryptoManager | null = null;

/**
 * Get the singleton crypto manager instance
 */
export function getCryptoManager(): CryptoManager {
  if (!_cryptoManager) {
    _cryptoManager = new CryptoManager();
  }
  return _cryptoManager;
}

/**
 * Initialize the singleton crypto manager
 */
export async function initializeCrypto(
  password?: string,
  salt?: Uint8Array,
): Promise<void> {
  const manager = getCryptoManager();
  await manager.initialize(password, salt);
}

/**
 * Encrypt data using the singleton crypto manager
 */
export async function encryptData(
  data: string | object,
): Promise<EncryptedData> {
  const manager = getCryptoManager();
  return manager.encrypt(data);
}

/**
 * Decrypt data using the singleton crypto manager
 */
export async function decryptData<T = string>(
  encryptedData: EncryptedData,
  returnAsObject = false,
): Promise<T> {
  const manager = getCryptoManager();
  return manager.decrypt<T>(encryptedData, returnAsObject);
}
