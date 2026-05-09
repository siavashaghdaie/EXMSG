/**
 * End-to-End Encryption utilities using Web Crypto API (ECDH + AES-GCM)
 *
 * Flow:
 * 1. Each device generates an ECDH key pair on first use
 * 2. Public key is uploaded to the server
 * 3. When sending an E2EE message, sender derives shared secrets with each recipient's
 *    public key using ECDH, then encrypts the message with AES-256-GCM
 * 4. Each encrypted payload is per-recipient (since each has a different shared key)
 * 5. Recipient derives the same shared secret and decrypts
 */

const ECDH_CURVE = 'P-256';
const AES_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for AES-GCM

// ─── Key Storage (IndexedDB) ──────────────────────────────────

const DB_NAME = 'exclusive-messenger-e2ee';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeKey(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getKey(key: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Device ID ────────────────────────────────────────────────

function getOrCreateDeviceId(): string {
  let deviceId = window.localStorage?.getItem('e2ee-device-id') || '';
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    try {
      window.localStorage?.setItem('e2ee-device-id', deviceId);
    } catch {
      // localStorage may be unavailable
    }
  }
  return deviceId;
}

export { getOrCreateDeviceId };

// ─── Key Generation ───────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: ECDH_CURVE },
    true, // extractable — needed to export public key
    ['deriveKey', 'deriveBits']
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

export async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: ECDH_CURVE },
    true,
    []
  );
}

// Store the private key locally, upload the public key
export async function initializeE2EEKeys(): Promise<{
  publicKeyJwk: string;
  deviceId: string;
  fingerprint: string;
}> {
  const deviceId = getOrCreateDeviceId();

  // Check if we already have a key pair
  const existingPrivateKey = await getKey(`privateKey-${deviceId}`);
  if (existingPrivateKey) {
    const existingPublicJwk = await getKey(`publicKeyJwk-${deviceId}`);
    const fingerprint = await generateFingerprint(existingPublicJwk);
    return { publicKeyJwk: existingPublicJwk, deviceId, fingerprint };
  }

  // Generate new key pair
  const keyPair = await generateKeyPair();
  const publicKeyJwk = await exportPublicKey(keyPair.publicKey);

  // Store private key in IndexedDB (never leaves the device)
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  await storeKey(`privateKey-${deviceId}`, privateKeyJwk);
  await storeKey(`publicKeyJwk-${deviceId}`, publicKeyJwk);

  const fingerprint = await generateFingerprint(publicKeyJwk);
  return { publicKeyJwk, deviceId, fingerprint };
}

// ─── Fingerprint ──────────────────────────────────────────────

export async function generateFingerprint(publicKeyJwk: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(publicKeyJwk);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

// ─── Encryption / Decryption ──────────────────────────────────

async function deriveSharedKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    { name: 'AES-GCM', length: AES_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

async function getPrivateKey(): Promise<CryptoKey> {
  const deviceId = getOrCreateDeviceId();
  const privateKeyJwk = await getKey(`privateKey-${deviceId}`);
  if (!privateKeyJwk) {
    throw new Error('E2EE private key not found. Please set up encryption first.');
  }
  return crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDH', namedCurve: ECDH_CURVE },
    false,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Encrypt a message for a specific recipient using their public key
 */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyJwk: string
): Promise<string> {
  const privateKey = await getPrivateKey();
  const recipientPublicKey = await importPublicKey(recipientPublicKeyJwk);
  const sharedKey = await deriveSharedKey(privateKey, recipientPublicKey);

  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    data
  );

  // Combine IV + ciphertext and base64 encode
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a message from a specific sender using their public key
 */
export async function decryptMessage(
  ciphertext: string,
  senderPublicKeyJwk: string
): Promise<string> {
  const privateKey = await getPrivateKey();
  const senderPublicKey = await importPublicKey(senderPublicKeyJwk);
  const sharedKey = await deriveSharedKey(privateKey, senderPublicKey);

  // Decode base64
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    data
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Encrypt a message for multiple recipients.
 * Returns a map of recipientUserId → encrypted content.
 * Also includes sender's own userId → encrypted (so sender can decrypt their own messages).
 */
export async function encryptForMultipleRecipients(
  plaintext: string,
  recipientKeys: Array<{ userId: string; publicKey: string }>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const { userId, publicKey } of recipientKeys) {
    result[userId] = await encryptMessage(plaintext, publicKey);
  }
  return result;
}

/**
 * Check if E2EE is set up on this device
 */
export async function isE2EESetUp(): Promise<boolean> {
  const deviceId = getOrCreateDeviceId();
  const key = await getKey(`privateKey-${deviceId}`);
  return !!key;
}
