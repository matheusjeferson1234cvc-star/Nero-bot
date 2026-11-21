'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_BYTES, validateMetadata, isValidSignature, readRpImage } = require('../src/uploads');

test('validação de uploads aceita apenas imagens pequenas do CDN do Discord', () => {
  const attachment = { contentType: 'image/png', size: 2048, url: 'https://cdn.discordapp.com/attachments/1/2/id.png' };
  assert.ok(validateMetadata(attachment));
  assert.equal(validateMetadata(null), null);
  assert.throws(() => validateMetadata({ ...attachment, size: MAX_BYTES + 1 }), /4 MB/);
  assert.throws(() => validateMetadata({ ...attachment, contentType: 'application/pdf' }), /PNG/);
  assert.throws(() => validateMetadata({ ...attachment, url: 'https://example.com/rg.png' }), /CDN/);
  assert.throws(() => validateMetadata({ ...attachment, url: 'http://cdn.discordapp.com/rg.png' }), /CDN/);
});
test('assinaturas de imagem básicas são conferidas independentemente da extensão', () => {
  assert.equal(isValidSignature(Buffer.from([137,80,78,71,13,10,26,10,0]), 'image/png'), true);
  assert.equal(isValidSignature(Buffer.from([255,216,255,0]), 'image/jpeg'), true);
  assert.equal(isValidSignature(Buffer.from('RIFF0000WEBP', 'ascii'), 'image/webp'), true);
  assert.equal(isValidSignature(Buffer.from('EXE'), 'image/png'), false);
});
test('upload sem anexo é opcional e não baixa arquivos', async () => {
  assert.equal(await readRpImage(null), null);
});
