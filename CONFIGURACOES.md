# ⚙️ Menus de configuração — Central de Ponto v3.1

Acesso: **painel publicado → ⚙️ Configurações**. Visível apenas a administradores com **Gerenciar Servidor**.

| Menu | O que editar | Efeito |
| --- | --- | --- |
| 🕒 Turnos → 🌅 Manhã | Horário, até 5 cargos, até 5 responsáveis e canal de logs | Filtra e fiscaliza apenas equipes da manhã |
| 🕒 Turnos → ☀️ Tarde | Horário, cargos, responsáveis e logs | Equipes e logs exclusivos da tarde |
| 🕒 Turnos → 🌙 Noite | Horário, cargos, responsáveis e logs | Equipes e logs exclusivos da noite |
| 🕒 Turnos → 🌌 Madrugada | Horário, cargos, responsáveis e logs | Equipes e logs exclusivos da madrugada |
| 🏷️ Cargo em serviço | Um cargo gerenciado pelo bot | Entrar e retornar = adicionar; pausar, encerrar e cancelar = retirar |
| 👥 Equipes e convites | Mínimo/máximo 2–4, validade 5–60 min e fuso | Todos aceitam antes do início; time zone aplicada nas janelas |
| 🛡️ Auditoria geral | Canal de auditoria | Relatório com quem cancelou, quem foi afetado e por quê |
| 🎞️ Visual / GIF | Título, descrição, URL `.gif` ou `padrao` | Atualiza painel principal |
| 🔎 Fiscalizar cartões | Lista de cartões e logs conforme permissão | Consulta de turnos permitidos e cancelamento confirmado |

## Preparação recomendada

1. Crie canais `#ponto`, `#logs-manha`, `#logs-tarde`, `#logs-noite`, `#logs-madrugada` e `#auditoria-geral`.
2. Crie cargos de turno e, se desejar, um cargo de supervisor para cada turno.
3. Crie cargo temporário `@Em Serviço` e deixe o bot acima desse cargo.
4. Configure os 4 turnos, o cargo Em Serviço e auditoria antes de publicar o painel ou iniciar um cartão.
5. Teste com duas contas de RP (líder + um integrante). O convidado acessa o painel no servidor, clica em Meus convites e confirma. Teste também com PV bloqueado.
6. Teste um membro de turno diferente em **Gerenciar equipe → Hora extra**.

As operações do painel abrem janelas privadas. A mensagem fixa do canal do painel continua sendo a central com GIF e cinco botões. Somente os logs por turno e a auditoria são permanentes nos canais de trabalho.

## 🎨 Aparência das mensagens após a atualização

- **PV (opcional):** convites também podem chegar por mensagem privada, mas o aceite principal pode ser feito pelo botão Meus convites no servidor. A confirmação fica visível apenas ao convidado.
- **Logs por turno:** cartão com destaque verde (ativo), âmbar (pausado/pendente), azul (encerrado) ou vermelho (cancelado).
- **Auditoria geral:** texto separado em blocos de ação, participantes e motivo, com link para abrir o cartão original.
- **Painel fixo:** layout azul com GIF “CENTRAL DE PONTO” e cinco botões, sem mensagens extras no canal público.

A aparência pode ser ajustada no código `src/ui.js`. Pelo painel, a administração edita apenas título, descrição e link do GIF, não a paleta de cores.


## Hora extra (v3.2)

**Não precisa criar cargos específicos de hora extra.** Configure os cargos dos quatro turnos em ⚙️ Configurações → Turnos. Depois, ao usar **👥 Gerenciar equipe → Hora extra**, o bot encontra somente membros de *outro* turno. O participante recebe a DM e suas horas extras começam no aceite.

Quem tem cargo do turno do cartão é classificado como **normal**, mesmo se tiver também cargo de outro turno. Quem não tem cargo de turno não aparece. Em **Meus pontos**, cada pessoa vê suas próprias horas normais e extras; o cartão de logs mostra as horas de todos, individualmente.

**Observação:** o site que exibirá essas horas ainda precisa ser integrado separadamente.
