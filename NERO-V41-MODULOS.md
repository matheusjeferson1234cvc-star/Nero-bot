# Nero V4.1 — módulos administrativos (MVP)

Branch de desenvolvimento; não publicar na Discloud antes de validar. Mantém os comandos e o banco local existentes, adicionando `neroModules` por servidor. Não substitui o sistema de ausência.

## Como testar em servidor de teste

1. Execute `npm ci` e `npm run verify`. Preserve `data/database.json` e seu backup. Use token privado de um bot de teste; não publique segredos.
2. Execute `/painelreuniao`, crie uma reunião futura em horário de Brasília, confirme com outro membro, informe ausência e encerre. A confirmação não comprova presença. Uma justificativa aprovada na data é consultada no sistema existente; não há advertência automática.
3. Execute `/painelatendimento atendentes:@Suporte` (categoria e canal opcionais). Confirme com uma conta comum que apenas solicitante e equipe têm acesso ao canal (administradores do Discord mantêm acesso). Teste duplicidade, assumir e encerrar. O canal encerrado fica preservado para a equipe; defina política de retenção antes da produção.
4. Execute `/painelcurso`, crie um curso com limite de vagas, inscreva e cancele com contas comuns, registre resultado como administrador e confira Meus cursos. Encerrar bloqueia novas inscrições.
5. Reinicie o bot e confira persistência; verifique se o bate-ponto, justificativas e sincronização preexistentes continuam funcionando.

## Próximas etapas (ainda não implementadas)

- Site: telas e API autenticadas por servidor, autorização real, sincronização com o bot, sem duplicar a fonte dos dados.
- Reuniões: cargos convocados, lembretes, presença efetiva, ata, relatório de faltantes com escopo definido; validar semântica de justificativas por turno antes de dispensar automaticamente.
- Atendimento: categorias múltiplas, transferência, motivo de fechamento, avaliação, relatórios, retenção e logs configuráveis.
- Cursos: instrutores delegados, agenda, provas, correção, certificados e cargos após revisão.
- Configurações, banners personalizados e publicação de logs em canais. Atualmente há auditoria local, sem envio a canais de logs.

Não há implantação nem testes ao vivo confirmados nesta branch.
