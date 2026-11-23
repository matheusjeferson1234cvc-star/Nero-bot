# Nero Bot V4.0 — Pacote Discloud (23/11/2026)

## Horas obrigatórias (atualização de 22/11)
- Nova opção **Configurações → ⏱️ Horas obrigatórias**.
- A meta padrão é **2 horas** e pode ser alterada de **1 a 12 horas**; vale igualmente para manhã, tarde, noite e madrugada.
- Cartões individuais encerram automaticamente após cumprir a meta; cartões de equipe encerram quando **todos os integrantes válidos** completarem o tempo, com verificações a cada 15 segundos.
- Pausas e horas canceladas não entram na meta. A nova meta é salva nos novos cartões, sem editar cartões antigos.
- O encerramento registra auditoria, atualiza os cartões, remove o cargo em serviço e envia comprovantes, quando habilitados.
- Relatórios de presença e avaliação de horas passam a usar a meta global configurada.

## Logs com emojis
- Categoria **📁 LOG BATE-PONTO** com 8 canais identificados por emojis: 📌 gerais, 🌅 manhã, ☀️ tarde, 🌙 noite, 🌌 madrugada, ❌ cancelamentos, 📋 presença e 🛡️ auditoria.
- Botões da aba de logs: 📁 criar canais, 🔎 ver canais e ↩️ voltar.
- Canal e categoria existentes são reaproveitados, sem duplicações.

## Discloud
- Pacote: **Nero-Discloud-v4.0.0.zip** (gerado automaticamente em Actions).
- Configure **Gerenciar Canais** para o bot e mantenha o banco de dados e variáveis de ambiente já existentes.
- O bot atualiza as configurações no Discord; para publicar basta atualizar os arquivos no aplicativo já criado na Discloud.
- Não substitua `data/database.json` nem envie `.env` público.

---

# Nero Bot V4 — Logs Bate-Ponto (23/11/2026)

- Em **Bate-Ponto → Configurações → Logs Bate-Ponto**, a administração pode usar **Criar logs automaticamente**.
- A criação gera a categoria privada **LOG BATE-PONTO** e oito canais: eventos gerais, quatro turnos, cancelamentos, presença e auditoria.
- Canais existentes com o mesmo nome dentro da categoria são reutilizados. Clicar novamente não gera duplicatas.
- As configurações do bot passam a apontar para os novos canais; cartões já registrados continuam nos canais antigos e mantêm o histórico.
- Eventos de início, pausa, retorno e encerramento são copiados para **#logs-bate-ponto**; cancelamentos vão para **#logs-cancelamentos** e para a auditoria geral.
- **#logs-presenca** recebe os relatórios já existentes de presença. Não é alterado o cálculo de horas, as metas ou o gerenciamento de equipes.
- O bot precisa da permissão **Gerenciar Canais**. Administradores podem ver os logs; membros comuns não recebem acesso por padrão.
- O código novo precisa ser testado no servidor e publicado na Discloud antes de entrar em produção.

---

# Central de Horas — Bot v3.7.5

- A opção **Ativar equipes** está mais clara no menu de configurações do Discord, e a mesma opção pode ser salva no site.
- Quando ativada, a equipe usa convites e aguarda aceites; quando desativada, o ponto é individual. A mudança não altera cartões antigos.
- O bot agora solicita sincronização antecipada e agrupada após início de ponto individual/em equipe, pausa, retorno, encerramento, cancelamentos e entrada de novos integrantes.
- A restrição de responsáveis no site fica na API da Vercel: cargos de turno são checados diretamente no Discord e dados de outros turnos não são enviados.
- Mantidos comprovantes por mensagem no PV e convites aceitos dentro do servidor.
- Nenhuma alteração nas horas registradas nem no banco local do bot.

**Atenção:** atualizar este ZIP na Discloud para que as alterações do bot tenham efeito. A Vercel recebe o site por GitHub separadamente.
