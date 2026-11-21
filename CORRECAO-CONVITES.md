# Convites de hora extra — revisão

No cartão ativo, o líder clica em **Gerenciar equipe → Hora extra**. A lista agora identifica o turno original e, quando vazia, informa quantos membros de outros turnos foram encontrados e quantos estão ocupados, com convite pendente ou já no cartão.

## Se alguém não aparecer
1. Configure o cargo de cada turno em **Configurações → Turnos → Cargos**.
2. A pessoa precisa ter um cargo de OUTRO turno, sem ter o cargo do turno atual.
3. A pessoa não pode estar trabalhando em outro cartão nem com convite pendente.
4. O líder precisa ter um cartão ATIVO (não pendente, pausado ou encerrado).
5. Habilite **Server Members Intent** no Discord Developer Portal para o aplicativo do bot e reinicie o bot na Discloud.
6. O convidado precisa permitir mensagens privadas do bot para receber e aceitar o convite.

As horas extras são separadas das horas normais, e o turno original é preservado. Nenhum token ou senha foi incluído no pacote.

## Verificação local
`node --check src/bot.js`, `node --check src/ui.js` e `npm test`: 35 testes passaram. Teste real no Discord ainda necessário.
