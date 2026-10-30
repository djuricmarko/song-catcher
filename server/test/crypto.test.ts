import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { buffer as consumeBuffer } from 'node:stream/consumers';

import { describe, expect, it } from 'vitest';

import {
  BLOCK_SIZE,
  calcBfKey,
  createDecryptTransform,
  decryptBlock,
} from '../src/deezer/crypto.js';

const cipherBlock = Buffer.from(
  readFileSync(new URL('./fixtures/block-2048.b64', import.meta.url), 'utf8').trim(),
  'base64',
);
const key = calcBfKey('3135556');

describe('calcBfKey', () => {
  it('matches the key derived by the Python implementation', () => {
    expect(key.toString('hex')).toBe('6c6c666b39662c37652575603c643439');
  });
});

describe('decryptBlock', () => {
  it('decrypts a 2048-byte Blowfish/CBC block', () => {
    const plaintext = decryptBlock(cipherBlock, key);

    expect(plaintext).toHaveLength(BLOCK_SIZE);
    expect(plaintext.every((byte) => byte === 0x41)).toBe(true);
  });
});

describe('createDecryptTransform', () => {
  const plainA = Buffer.alloc(BLOCK_SIZE, 0x41);
  const plainB = Buffer.alloc(BLOCK_SIZE, 0x42);
  const plainC = Buffer.alloc(BLOCK_SIZE, 0x43);
  const tail = Buffer.alloc(100, 0x44);

  it('decrypts only every third full block and copies the rest', async () => {
    const input = Buffer.concat([cipherBlock, plainB, plainC, cipherBlock, tail]);
    const output = await consumeBuffer(Readable.from([input]).pipe(createDecryptTransform(key)));

    expect(output.equals(Buffer.concat([plainA, plainB, plainC, plainA, tail]))).toBe(true);
  });

  it('handles arbitrary chunk boundaries', async () => {
    const input = Buffer.concat([cipherBlock, plainB, plainC, cipherBlock, tail]);
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < input.length; offset += 777) {
      chunks.push(input.subarray(offset, offset + 777));
    }

    const output = await consumeBuffer(Readable.from(chunks).pipe(createDecryptTransform(key)));

    expect(output.equals(Buffer.concat([plainA, plainB, plainC, plainA, tail]))).toBe(true);
  });

  it('does not decrypt a short block in an encrypted slot', async () => {
    const input = Buffer.concat([cipherBlock, plainB, plainC, tail]);
    const output = await consumeBuffer(Readable.from([input]).pipe(createDecryptTransform(key)));

    expect(output.equals(Buffer.concat([plainA, plainB, plainC, tail]))).toBe(true);
  });
});
