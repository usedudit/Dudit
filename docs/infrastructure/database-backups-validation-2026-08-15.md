# Validação operacional dos backups — 15/08/2026

## Status

**Não aprovado para fechamento do MVP.** A validação foi interrompida antes de enviar dados reais ao R2 porque as credenciais atuais retornam `403 AccessDenied`. O restore também não foi declarado válido.

## Configuração revisada

| Item | Resultado |
| --- | --- |
| Conexão PostgreSQL | `POSTGRES_URL_NON_POOLING` presente, SSL `require`, Supavisor session na porta `5432` |
| Direct connection | `BACKUP_DATABASE_URL` e `DATABASE_URL` não configuradas localmente |
| R2 account/access key/secret | As credenciais específicas do backup ainda não estavam configuradas; as credenciais existentes são do bucket de imagens/arquivos |
| Bucket de backup | Presente localmente |
| `BACKUP_CRON_SECRET` | Ausente |
| `BACKUP_ENCRYPTION_KEY_BASE64` | Ausente |
| `pg_dump`/`pg_restore` no host | Ausentes; o Docker foi iniciado para a validação controlada |
| Endpoint publicado | `POST https://dudit.com.br/api/internal/jobs/backup-database` respondeu `404`; a versão com o endpoint ainda não está publicada |

O Supabase recomenda conexão direta para ferramentas PostgreSQL como `pg_dump`; a conexão session em `5432` é a alternativa quando a rede não suporta IPv6. A URL disponível no ambiente de validação é a alternativa session, não a direct connection.

## Execuções realizadas

### Tentativa do fluxo completo

O endpoint local foi executado com `BACKUP_CRON_SECRET` e `BACKUP_ENCRYPTION_KEY_BASE64` efêmeros, gerados somente no processo e não gravados no `.env`.

- primeira execução: iniciou às `2026-08-15T16:22:40Z`, falhou em aproximadamente `654 ms`;
- segunda execução, após preparar o cliente PostgreSQL Docker: falhou em aproximadamente `418 ms`;
- resposta: `500 Database backup failed`;
- nenhum objeto de backup foi confirmado no R2;
- o caminho de erro chamou o logger estruturado, `captureError` e `flushMonitoring`.

### R2

As sondas foram limitadas a duas operações sem dados do banco:

- `ListObjectsV2` no prefixo de backup: `403 AccessDenied`;
- `PutObject` de um arquivo de validação descartável: `403 AccessDenied`.

Conclusão: as credenciais/account/bucket atuais não têm autorização efetiva para o bucket, ou não pertencem ao mesmo account/bucket configurado. Não foram feitas novas tentativas depois disso.

### PostgreSQL

Um teste isolado do wrapper Docker conseguiu executar `pg_dump` contra a conexão session e terminou com código `0` em aproximadamente `98,4 s`, mas o stdout não foi persistido em arquivo; isso confirma conectividade/processo, não a validade de um artefato restaurável.

Uma tentativa seguinte com stdout direcionado a arquivo ficou sem progresso, com arquivo temporário de `0 bytes`, e foi interrompida. O harness Windows com wrapper `.cmd` não é adequado para aprovar a execução; a validação deve ser repetida no Railway/Linux, onde `postgresql-client` é instalado diretamente pelo Nixpacks.

## Retenção

Não foi possível validar retenção contra o bucket real porque o primeiro `ListObjectsV2` retornou `403`. A rotina só considera chaves no padrão `dudit-db-backup-*.dump.gz.enc`, mantém os backups diários mais recentes e seleciona uma cópia por semana para a retenção semanal. A confirmação operacional de que objetos recentes não são removidos continua pendente de acesso ao R2.

## Restore

**Não executado com sucesso.** Não houve download de um backup real, portanto não há resultado válido para:

- descriptografia AES-256-GCM;
- descompressão gzip;
- `pg_restore` em banco temporário;
- tabelas `auth.users`, `partners`, `customers`, `products`, `orders`, `transactions` e `supabase_migrations.schema_migrations`.

O restore não tocou no banco Supabase de produção.

## Ajustes necessários antes de repetir

1. Criar uma API token R2 exclusiva para o bucket de backup, com permissões efetivas de listar, ler, gravar e remover objetos, e configurar `CLOUDFLARE_BACKUP_R2_ACCESS_KEY_ID` + `CLOUDFLARE_BACKUP_R2_SECRET_ACCESS_KEY`; não substituir as credenciais do bucket de imagens/arquivos.
2. Configurar no Railway, fora do repositório:
   - `BACKUP_CRON_SECRET`;
   - `BACKUP_ENCRYPTION_KEY_BASE64` com 32 bytes aleatórios;
   - `BACKUP_DATABASE_URL` usando a direct connection `db.<project>.supabase.co:5432` se o Railway tiver IPv6;
   - caso contrário, manter a session connection `5432` validada neste teste.
3. Publicar a versão que contém `/api/internal/jobs/backup-database`.
4. Executar o primeiro backup no Railway/Linux e registrar tamanho final, duração, key do objeto e logs.
5. Baixar o objeto e restaurar em um projeto Supabase temporário ou banco PostgreSQL descartável compatível, verificando as sete tabelas solicitadas.
6. Só então testar retenção com backups sintéticos antigos no prefixo dedicado e confirmar que os recentes permanecem.

Como medida adicional, o `.env` local contém credenciais sensíveis e está ignorado pelo Git. Se esse arquivo já tiver sido compartilhado fora da máquina, as credenciais devem ser rotacionadas.
