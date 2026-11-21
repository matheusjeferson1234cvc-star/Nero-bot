'use strict';

// Atualização idempotente de um painel público já cadastrado.
// Uma mensagem existente de outro bot nunca é editada nem apagada.
const missingMessage = err => Number(err?.code ?? err?.rawError?.code) === 10008 || Number(err?.status) === 404;

async function synchronizePanel({ guild, ref, payload, botUserId, fetchChannel, save }) {
  if (!ref?.channelId) return { state: 'unregistered' };
  const channel = await fetchChannel(guild, ref.channelId);
  let oldMessage = null;
  if (ref.messageId) {
    try { oldMessage = await channel.messages.fetch(ref.messageId); }
    catch (err) { if (!missingMessage(err)) throw err; }
  }
  if (oldMessage && oldMessage.author?.id === botUserId) {
    // Remover anexos antigos para trocar o GIF, inclusive ao migrar de mensagens legadas.
    await oldMessage.edit({ ...payload(), content: null, embeds: [], attachments: [] });
    return { state: 'updated', messageId: oldMessage.id };
  }
  // Caso a mensagem tenha sido excluída ou pertença a outro aplicativo,
  // publicar UMA substituta no canal configurado e persistir o ID para evitar duplicatas.
  const posted = await channel.send(payload());
  ref.messageId = posted.id;
  save();
  return { state: oldMessage ? 'replaced-foreign' : 'recreated', messageId: posted.id };
}

module.exports = { synchronizePanel, missingMessage };
