# Auditoria local • Bot RP v5.0

- Apenas quatro comandos slash, com sincronização automática por servidor.
- 8 combinações de painel independentes e 8 banners GIF próprios, sem marca antiga.
- Recrutamento: editor de perguntas, editor de mensagens, revisão, upload de documento fictício.
- Registro: seleção de turno antes do modal, cargo correspondente e logs privados.
- Gestão: patentes ordenadas, advertências 1/2/3, exoneração, histórico e canais distintos.
- Ponto: equipes 2–4 pessoas, convite, aceite obrigatório, cargo em serviço, pausa exclusiva da liderança e cancelamento com confirmação.
- Banco JSON com salvamento atômico e backup (herdado do projeto anterior).
- Testes automatizados de regras e verificação de configuração incluídos.

**Limites do teste:** `discord.js` não foi instalado neste ambiente, devido à indisponibilidade do registro npm. Por isso, testes de interação Discord real, permissões reais e implantação Discloud ainda são pendentes. Erro `node:undefined` visto anteriormente ocorre na etapa de build da hospedagem e não foi comprovadamente resolvido.

**Atenção à migração:** os cartões individuais anteriores não se tornam equipes automaticamente. Preserve backup do banco anterior. O novo pacote foca em quatro painéis, sem manter suporte, whitelist, ausências e outros painéis da versão antiga.
