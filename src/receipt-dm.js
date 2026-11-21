'use strict';
// Comprovante em mensagem do Discord (embed sem anexos ou imagens).
// Nunca interfere no encerramento do ponto caso o PV esteja fechado.
async function sendReceiptDM({user,card,member,notifications={},logger=console},deps={}) {
 const ui=deps.ui||require('./ui');
 if(notifications.pointDm===false)return {sent:false,mode:'disabled'};
 try {
  const payload={embeds:[ui.pointReceipt(card,member)],allowedMentions:ui.mentions};
  if(typeof ui.receiptActions==='function')payload.components=ui.receiptActions();
  await user.send(payload);
  return {sent:true,mode:'text'};
 }catch(err){
  const blocked=Number(err?.code)===50007;
  logger.warn(`[Comprovante] ${blocked?'PV bloqueado':'Erro ao enviar mensagem'} para ${user?.id||'usuário'}: ${err?.message||err}`);
  return {sent:false,mode:blocked?'dm-blocked':'failed',error:err?.message||String(err)};
 }
}
module.exports={sendReceiptDM};
