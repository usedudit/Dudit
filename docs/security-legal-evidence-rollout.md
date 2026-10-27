# Rollout de logs e prova jurídica

Este checklist acompanha as mudanças de logs de acesso, exclusão e documentos legais. As migrations e o app precisam ser implantados juntos; a publicação dos novos termos deve esperar o preenchimento da identificação da operadora.

## Antes de publicar

1. Preencher nome civil, CPF (após validar a forma de divulgação com advogado), endereço completo e e-mail de privacidade/contato em `app/institucional/termos/page.tsx`, `app/institucional/privacidade/page.tsx` e nos documentos em `docs/`. A operadora atual é pessoa física.
2. Conferir os textos `.txt` com o conteúdo efetivamente exibido nas páginas. O script de aceite calcula SHA-256 do arquivo de texto; não registrar o hash até a cópia textual representar a versão exibida.
3. Após essa conferência, registrar as versões `terms 1.1` e `privacy 1.2` com `npm run seed:legal -- terms 1.1 ./docs/termos-v1.1-outubro-2026.txt` e `npm run seed:legal -- privacy 1.2 ./docs/privacidade-v1.2-outubro-2026.txt`. O primeiro documento entra em vigor dez dias após ser publicado; a política, imediatamente.
4. Aplicar `migrations/20261027_application_access_logs.sql`, `migrations/20261027_deletion_evidence_retention.sql` e `migrations/20261027_security_incident_register.sql` antes de publicar o código. Confirmar que `pg_cron` está habilitado e que os três jobs semanais de limpeza aparecem ativos; sem isso, os prazos de expurgo não são automáticos.
5. Em produção, definir `TRUSTED_PROXY_HEADERS=true` somente se o origin aceitar tráfego exclusivamente do Cloudflare e os cabeçalhos forem sobrescritos na borda. Validar que acessos diretos ao origin são bloqueados. Sem isso, IP e país podem ficar como desconhecidos; não confiar em `X-Forwarded-For`.
6. Configurar e verificar logs de borda do Cloudflare com horário, IP, porta lógica de origem quando necessária para identificação inequívoca e Ray ID; proteger o acesso e configurar expurgo após seis meses. O app registra Ray ID para correlação, mas não captura a porta lógica de origem. Confirmar que o plano e o destino de Logpush dão suporte aos campos e retenção necessários.
7. Conferir no provedor de backup a rotina efetiva, ciclo de cópias e criptografia antes de manter a descrição “30 diários + 4 semanais” como política vigente.
8. Fazer um fluxo controlado de aceite e exclusão em ambiente de homologação: conferir hash, IP/horário/user-agent, documento e versão aceitos, task enfileirada, remoção/anonimização e preservação do certificado sem `user_id` direto.

## Registro de incidentes

A tabela `security_incident_records` guarda informações mínimas para documentar a data de conhecimento, circunstâncias, categorias e número de titulares, avaliação de risco, mitigação e decisões/comunicações. Registrar também incidentes não comunicados; o prazo legal mínimo é de cinco anos a partir do registro. Essa tabela não detecta ou abre ocorrências sozinha: a equipe precisa preencher e acompanhar o registro pelo fluxo interno, e avaliar comunicação em até três dias úteis quando o caso se enquadrar. Não anexar conteúdo bruto de dados expostos.

## Limites do que a aplicação registra

`application_access_logs` registra horário, IP confiável quando disponível, país aproximado, método, rota sem query string, resposta, user-agent e Ray ID; não registra corpo, cookies ou cabeçalhos de autorização. Geolocalização por IP não equivale a coordenada GPS. A porta lógica de origem depende dos logs de borda do provedor e não é criada pelo log da aplicação.
