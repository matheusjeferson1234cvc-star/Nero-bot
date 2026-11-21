'use strict';
// As fotos são apenas arte de documentos FICTÍCIOS do RP. Nunca peça RG real.
const MAX_BYTES = 4 * 1024 * 1024;
const CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

function validateMetadata(attachment) {
  if (!attachment) return null;
  if (!CONTENT_TYPES.has(String(attachment.contentType || '').toLowerCase())) throw new Error('A imagem do RG fictício deve ser PNG, JPG ou WebP.');
  if (!Number.isInteger(attachment.size) || attachment.size <= 0 || attachment.size > MAX_BYTES) throw new Error('A foto do RG RP deve ter até 4 MB.');
  const url = new URL(attachment.url);
  if (url.protocol !== 'https:' || !CDN_HOSTS.has(url.hostname)) throw new Error('Arquivo não veio do CDN do Discord.');
  return { url, contentType: attachment.contentType };
}
function isValidSignature(bytes, mime) {
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/jpeg') return bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}
async function readRpImage(attachment) {
  if (!attachment) return null;
  const metadata = validateMetadata(attachment);
  const response = await fetch(metadata.url, { signal: AbortSignal.timeout(12_000), redirect: 'error' });
  if (!response.ok) throw new Error('Falha ao recuperar a imagem do RP. Tente reenviar.');
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error('A imagem ultrapassa 4 MB.');
  // Streaming limitado evita esgotar a RAM mesmo quando o servidor ignora Content-Length.
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) { await response.body.cancel().catch(() => {}); throw new Error('A foto ultrapassa 4 MB.'); }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (!isValidSignature(bytes, metadata.contentType)) throw new Error('O arquivo não é uma imagem PNG, JPG ou WebP válida.');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[metadata.contentType];
  return { bytes, extension };
}
function imageAttachment(photo, id) {
  const { AttachmentBuilder } = require('discord.js');
  return new AttachmentBuilder(photo.bytes, { name: `rg-rp-${id}.${photo.extension}` });
}
module.exports = { MAX_BYTES, validateMetadata, isValidSignature, readRpImage, imageAttachment };
