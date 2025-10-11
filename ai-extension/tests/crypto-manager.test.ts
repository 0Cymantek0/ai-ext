/**
 * Crypto Manager Tests
 * Tests for encryption/decryption functionality
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CryptoManager,
  CryptoError,
  CryptoErrorType,
  type EncryptedData,
} from "../src/background/crypto-manager";

describe("CryptoManager", () => {
  let cryptoManager: CryptoManager;

  beforeEach(() => {
    cryptoManager = new CryptoManager();
  });

  describe("Initialization", () => {
    it("should initialize with generated key", async () => {
      await cryptoManager.initialize();
      expect(cryptoManager.isInitialized()).toBe(true);
    });

    it("should initialize with password-based key", async () => {
      const password = "test-password-123";
      const salt = cryptoManager.generateSalt();

      await cryptoManager.initialize(password, salt);
      expect(cryptoManager.isInitialized()).toBe(true);
    });

    it("should throw error when password provided without salt", async () => {
      const password = "test-password-123";

      await expect(cryptoManager.initialize(password)).rejects.toThrow(
        CryptoError,
      );
    });

    it("should not be initialized before calling initialize()", () => {
      expect(cryptoManager.isInitialized()).toBe(false);
    });
  });

  describe("Encryption", () => {
    beforeEach(async () => {
      await cryptoManager.initialize();
    });

    it("should encrypt string data", async () => {
      const plaintext = "Hello, World!";
      const encrypted = await cryptoManager.encrypt(plaintext);

      expect(encrypted).toHaveProperty("ciphertext");
      expect(encrypted).toHaveProperty("iv");
      expect(encrypted).toHaveProperty("salt");
      expect(encrypted.algorithm).toBe("AES-GCM");
      expect(encrypted.version).toBe(1);
      expect(encrypted.ciphertext).not.toBe(plaintext);
    });

    it("should encrypt object data", async () => {
      const data = { name: "John", age: 30, active: true };
      const encrypted = await cryptoManager.encrypt(data);

      expect(encrypted).toHaveProperty("ciphertext");
      expect(encrypted.ciphertext).not.toBe(JSON.stringify(data));
    });

    it("should generate unique IV for each encryption", async () => {
      const plaintext = "Same data";
      const encrypted1 = await cryptoManager.encrypt(plaintext);
      const encrypted2 = await cryptoManager.encrypt(plaintext);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it("should throw error when not initialized", async () => {
      const uninitializedManager = new CryptoManager();
      await expect(uninitializedManager.encrypt("test")).rejects.toThrow(
        CryptoError,
      );
    });
  });

  describe("Decryption", () => {
    beforeEach(async () => {
      await cryptoManager.initialize();
    });

    it("should decrypt string data", async () => {
      const plaintext = "Hello, World!";
      const encrypted = await cryptoManager.encrypt(plaintext);
      const decrypted = await cryptoManager.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should decrypt object data", async () => {
      const data = { name: "John", age: 30, active: true };
      const encrypted = await cryptoManager.encrypt(data);
      const decrypted = await cryptoManager.decrypt<typeof data>(
        encrypted,
        true,
      );

      expect(decrypted).toEqual(data);
    });

    it("should handle complex nested objects", async () => {
      const data = {
        user: {
          name: "John",
          profile: {
            age: 30,
            tags: ["developer", "tester"],
          },
        },
        metadata: {
          created: Date.now(),
          updated: Date.now(),
        },
      };

      const encrypted = await cryptoManager.encrypt(data);
      const decrypted = await cryptoManager.decrypt<typeof data>(
        encrypted,
        true,
      );

      expect(decrypted).toEqual(data);
    });

    it("should throw error when decrypting invalid data", async () => {
      const invalidData: EncryptedData = {
        ciphertext: "invalid",
        iv: "invalid",
        salt: "invalid",
        algorithm: "AES-GCM",
        version: 1,
      };

      await expect(cryptoManager.decrypt(invalidData)).rejects.toThrow(
        CryptoError,
      );
    });

    it("should throw error when not initialized", async () => {
      const uninitializedManager = new CryptoManager();
      const encrypted: EncryptedData = {
        ciphertext: "test",
        iv: "test",
        salt: "test",
        algorithm: "AES-GCM",
        version: 1,
      };

      await expect(uninitializedManager.decrypt(encrypted)).rejects.toThrow(
        CryptoError,
      );
    });
  });

  describe("Key Derivation", () => {
    it("should derive same key from same password and salt", async () => {
      const password = "test-password-123";
      const salt = cryptoManager.generateSalt();

      const manager1 = new CryptoManager();
      await manager1.initialize(password, salt);

      const manager2 = new CryptoManager();
      await manager2.initialize(password, salt);

      const plaintext = "Test data";
      const encrypted = await manager1.encrypt(plaintext);
      const decrypted = await manager2.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should derive different keys from different passwords", async () => {
      const salt = cryptoManager.generateSalt();

      const manager1 = new CryptoManager();
      await manager1.initialize("password1", salt);

      const manager2 = new CryptoManager();
      await manager2.initialize("password2", salt);

      const plaintext = "Test data";
      const encrypted = await manager1.encrypt(plaintext);

      await expect(manager2.decrypt(encrypted)).rejects.toThrow();
    });

    it("should derive different keys from different salts", async () => {
      const password = "test-password";

      const manager1 = new CryptoManager();
      await manager1.initialize(password, cryptoManager.generateSalt());

      const manager2 = new CryptoManager();
      await manager2.initialize(password, cryptoManager.generateSalt());

      const plaintext = "Test data";
      const encrypted = await manager1.encrypt(plaintext);

      await expect(manager2.decrypt(encrypted)).rejects.toThrow();
    });
  });

  describe("Key Management", () => {
    it("should export and import master key", async () => {
      await cryptoManager.initialize();

      const plaintext = "Test data";
      const encrypted = await cryptoManager.encrypt(plaintext);

      const exportedKey = await cryptoManager.exportMasterKey();
      expect(exportedKey).toBeTruthy();
      expect(typeof exportedKey).toBe("string");

      const newManager = new CryptoManager();
      await newManager.importMasterKey(exportedKey);

      const decrypted = await newManager.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should clear master key from memory", async () => {
      await cryptoManager.initialize();
      expect(cryptoManager.isInitialized()).toBe(true);

      cryptoManager.clear();
      expect(cryptoManager.isInitialized()).toBe(false);

      await expect(cryptoManager.encrypt("test")).rejects.toThrow(CryptoError);
    });
  });

  describe("Salt Generation", () => {
    it("should generate random salts", () => {
      const salt1 = cryptoManager.generateSalt();
      const salt2 = cryptoManager.generateSalt();

      expect(salt1).toBeInstanceOf(Uint8Array);
      expect(salt2).toBeInstanceOf(Uint8Array);
      expect(salt1).not.toEqual(salt2);
    });

    it("should generate salts of correct length", () => {
      const salt = cryptoManager.generateSalt();
      expect(salt.length).toBe(16); // Default salt length
    });
  });

  describe("Error Handling", () => {
    it("should throw CryptoError with correct type", async () => {
      const uninitializedManager = new CryptoManager();

      try {
        await uninitializedManager.encrypt("test");
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(CryptoError);
        expect((error as CryptoError).type).toBe(
          CryptoErrorType.NOT_INITIALIZED,
        );
      }
    });

    it("should handle invalid encrypted data structure", async () => {
      await cryptoManager.initialize();

      const invalidData = {
        ciphertext: "",
        iv: "",
        salt: "",
        algorithm: "AES-GCM" as const,
        version: 1,
      };

      try {
        await cryptoManager.decrypt(invalidData);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(CryptoError);
        expect((error as CryptoError).type).toBe(CryptoErrorType.INVALID_DATA);
      }
    });
  });

  describe("Large Data", () => {
    beforeEach(async () => {
      await cryptoManager.initialize();
    });

    it("should handle large strings", async () => {
      const largeString = "A".repeat(100000); // 100KB
      const encrypted = await cryptoManager.encrypt(largeString);
      const decrypted = await cryptoManager.decrypt(encrypted);

      expect(decrypted).toBe(largeString);
    });

    it("should handle large objects", async () => {
      const largeObject = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          data: "x".repeat(100),
        })),
      };

      const encrypted = await cryptoManager.encrypt(largeObject);
      const decrypted = await cryptoManager.decrypt<typeof largeObject>(
        encrypted,
        true,
      );

      expect(decrypted).toEqual(largeObject);
    });
  });

  describe("Special Characters", () => {
    beforeEach(async () => {
      await cryptoManager.initialize();
    });

    it("should handle unicode characters", async () => {
      const unicode = "你好世界 🌍 مرحبا العالم";
      const encrypted = await cryptoManager.encrypt(unicode);
      const decrypted = await cryptoManager.decrypt(encrypted);

      expect(decrypted).toBe(unicode);
    });

    it("should handle special characters", async () => {
      const special = "!@#$%^&*()_+-=[]{}|;:'\",.<>?/\\`~";
      const encrypted = await cryptoManager.encrypt(special);
      const decrypted = await cryptoManager.decrypt(encrypted);

      expect(decrypted).toBe(special);
    });

    it("should handle newlines and tabs", async () => {
      const text = "Line 1\nLine 2\tTabbed\r\nWindows newline";
      const encrypted = await cryptoManager.encrypt(text);
      const decrypted = await cryptoManager.decrypt(encrypted);

      expect(decrypted).toBe(text);
    });
  });
});
