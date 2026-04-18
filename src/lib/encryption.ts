import CryptoJS from 'crypto-js';

// In a real app, this should be a client-side master password not stored on the server
// For this applet, we'll derive it from the UID or a provided secret.
const DEFAULT_SALT = 'veda-finance-v1';

export const encrypt = (text: string, secret: string) => {
  return CryptoJS.AES.encrypt(text, secret + DEFAULT_SALT).toString();
};

export const decrypt = (ciphertext: string, secret: string) => {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secret + DEFAULT_SALT);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    console.error('Decryption failed', e);
    return '';
  }
};

export interface EncryptedPayload {
  description: string;
  notes?: string;
  metadata?: Record<string, any>;
}

export const encryptPayload = (payload: EncryptedPayload, secret: string): string => {
  return encrypt(JSON.stringify(payload), secret);
};

export const decryptPayload = (ciphertext: string, secret: string): EncryptedPayload => {
  const decrypted = decrypt(ciphertext, secret);
  if (!decrypted) return { description: 'Decryption Error' };
  try {
    return JSON.parse(decrypted);
  } catch (e) {
    return { description: 'Format Error' };
  }
};
