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
export function calcBfKey(songId: string): Buffer {
  const md5hex = createHash('md5').update(songId).digest('hex');
  const secret = Buffer.from('g4el58wc0zvf9na1', 'ascii');
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
    return false;
  }
}

export function createBlockDecryptor(key: Buffer): (block: Buffer) => Buffer {
  if (nativeBlowfishAvailable()) {
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
        const isEncrypted = blockIndex % 3 === 0;
        output.push(isEncrypted ? decrypt(block) : block);
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
