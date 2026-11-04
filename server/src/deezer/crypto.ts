import { createDecipheriv, createHash } from 'node:crypto';
import { Transform } from 'node:stream';

import { Blowfish } from 'egoroof-blowfish';

/**
 * Deezer encrypts every third 2048-byte block with Blowfish/CBC. Each block is
 * decrypted independently with the same IV; the IV is not carried over from one
 * encrypted block to the next.
 */
export const BLOCK_SIZE = 2048;
export const BLOWFISH_IV = Buffer.from('0001020304050607', 'hex');
const BLOWFISH_SECRET = 'g4el58wc0zvf9na1';

/**
 * Blowfish key derivation used by Deezer:
 *
 *   key[i] = md5hex(songId)[i] ^ md5hex(songId)[i + 16] ^ "g4el58wc0zvf9na1"[i]
 *
 * All operands are ASCII bytes, so the result is a 16-byte key.
 */
export function calcBfKey(songId: string): Buffer {
  const md5hex = createHash('md5').update(songId).digest('hex');
  const secret = Buffer.from(BLOWFISH_SECRET, 'ascii');
  const key = Buffer.alloc(16);

  for (let index = 0; index < 16; index += 1) {
    const first = md5hex.charCodeAt(index);
    const second = md5hex.charCodeAt(index + 16);
    const secretByte = secret[index] ?? 0;
    key[index] = (first ^ second ^ secretByte) & 0xff;
  }

  return key;
}

function nativeBlowfishAvailable(): boolean {
  try {
    const decipher = createDecipheriv('bf-cbc', Buffer.alloc(16), BLOWFISH_IV);
    decipher.setAutoPadding(false);
    decipher.update(Buffer.alloc(8));
    return true;
  } catch {
    // Node/OpenSSL 3 without --openssl-legacy-provider does not provide bf-cbc.
    return false;
  }
}

const USE_NATIVE_BLOWFISH = nativeBlowfishAvailable();

export function isNativeBlowfishAvailable(): boolean {
  return USE_NATIVE_BLOWFISH;
}

/**
 * Returns a function that decrypts 2048-byte blocks with the given key. The
 * pure-JS fallback is built once per key because its key schedule is costly.
 */
export function createBlockDecryptor(key: Buffer): (block: Buffer) => Buffer {
  if (USE_NATIVE_BLOWFISH) {
    return (block) => {
      const decipher = createDecipheriv('bf-cbc', key, BLOWFISH_IV);
      decipher.setAutoPadding(false);
      return decipher.update(block);
    };
  }

  const blowfish = new Blowfish(key, Blowfish.MODE.CBC, Blowfish.PADDING.NULL);
  blowfish.setIv(BLOWFISH_IV);
  // egoroof-blowfish has no "no padding" mode: NULL padding strips trailing
  // zero bytes from the last 8-byte unit. Append a throwaway unit so only that
  // gets stripped, then cut the result back to the block length. Note that
  // decode() returns a UTF-8 string unless UINT8_ARRAY is passed explicitly.
  const sacrificial = Buffer.alloc(8, 0xff);
  return (block) => {
    const decoded = blowfish.decode(Buffer.concat([block, sacrificial]), Blowfish.TYPE.UINT8_ARRAY);
    return Buffer.from(decoded.buffer, decoded.byteOffset, block.length);
  };
}

export function decryptBlock(block: Buffer, key: Buffer): Buffer {
  return createBlockDecryptor(key)(block);
}

/**
 * Streaming decryptor. Full 2048-byte blocks are decrypted only when their
 * zero-based index is divisible by three; everything else is passed through.
 * A short trailing block is always copied as-is, matching Deezer's format.
 */
export function createDecryptTransform(key: Buffer): Transform {
  let remainder = Buffer.alloc(0);
  let blockIndex = 0;
  const decrypt = createBlockDecryptor(key);

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      remainder = remainder.length === 0 ? Buffer.from(chunk) : Buffer.concat([remainder, chunk]);

      const output: Buffer[] = [];
      while (remainder.length >= BLOCK_SIZE) {
        const block = remainder.subarray(0, BLOCK_SIZE);
        remainder = remainder.subarray(BLOCK_SIZE);
        output.push(blockIndex % 3 === 0 ? decrypt(block) : block);
        blockIndex += 1;
      }

      if (output.length > 0) {
        this.push(Buffer.concat(output));
      }
      callback();
    },
    flush(callback) {
      if (remainder.length > 0) {
        this.push(remainder);
      }
      callback();
    },
  });
}
