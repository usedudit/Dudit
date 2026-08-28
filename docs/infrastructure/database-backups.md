# Backups do PostgreSQL da Dudit

Esta solução faz um backup lógico diário do PostgreSQL do Supabase e o envia para um bucket privado do Cloudflare R2.

```text
cron-job.org (1x por dia)
  -> POST /api/internal/jobs/backup-database
  -> validação do BACKUP_CRON_SECRET + rate limit + lock Redis
  -> pg_dump --format=custom
  -> gzip nível 9
  -> AES-256-GCM em streaming
  -> Cloudflare R2 (bucket de backup privado)
  -> retenção: 30 diários + 4 semanais
```

O dump não altera schema, migrations nem o fluxo da aplicação. Ele é um backup lógico do banco. Arquivos do Supabase Storage não fazem parte do dump do PostgreSQL; este job cobre o banco, enquanto os objetos do R2 continuam sendo responsabilidade do fluxo de storage existente.

## Por que esta arquitetura

O Supabase recomenda que projetos Free façam exportações lógicas e mantenham cópias externas. Para `pg_dump`, a conexão direta é a opção indicada; em rede IPv4 sem acesso IPv6, use o pooler Supavisor em modo session na porta 5432. Não use o pooler transaction na porta 6543 para o dump.

O endpoint usa runtime Node.js e o Railway instala os binários do PostgreSQL 17 via `railpack.json`. Isso é adequado ao deploy atual do projeto, porque o cron apenas dispara uma execução e o processo Node pode manter o stream aberto durante o dump. Em uma hospedagem serverless com timeout rígido, mova a mesma rotina para um worker/serviço Railway dedicado.

## Configuração

Configure estes segredos apenas no ambiente do Railway. Não os coloque no frontend, em `NEXT_PUBLIC_*`, no cron-job.org ou no repositório:

| Variável | Obrigatória | Uso |
| --- | --- | --- |
| `BACKUP_DATABASE_URL` | Não* | URL PostgreSQL direta/session usada pelo `pg_dump` |
| `DATABASE_URL` | Não* | Fallback para a URL do banco |
| `POSTGRES_URL_NON_POOLING` | Não* | Fallback já usado por este projeto |
| `CLOUDFLARE_ACCOUNT_ID` | Sim | Account ID do R2 |
| `CLOUDFLARE_BACKUP_R2_ACCESS_KEY_ID` | Sim | Chave de API R2 exclusiva do bucket de backup |
| `CLOUDFLARE_BACKUP_R2_SECRET_ACCESS_KEY` | Sim | Segredo da chave R2 exclusiva do backup |
| `CLOUDFLARE_BACKUP_BUCKET` | Sim | Bucket exclusivo para backups |
| `BACKUP_CRON_SECRET` | Sim | Bearer token exclusivo deste endpoint |
| `BACKUP_ENCRYPTION_KEY_BASE64` | Sim | Chave aleatória de 32 bytes para AES-256-GCM |

`*` Pelo menos uma das três variáveis de conexão deve existir; recomenda-se usar `BACKUP_DATABASE_URL` para deixar explícita a conexão de backup.

Variáveis opcionais:

| Variável | Padrão | Uso |
| --- | --- | --- |
| `BACKUP_R2_PREFIX` | `backups/` | Prefixo dos objetos no bucket |
| `BACKUP_RETENTION_DAILY` | `30` | Quantidade de backups recentes mantidos |
| `BACKUP_RETENTION_WEEKLY` | `4` | Uma cópia adicional por semana |
| `BACKUP_TIMEOUT_MS` | `1800000` | Timeout do `pg_dump` |
| `PG_DUMP_BINARY` | `pg_dump` | Caminho alternativo do binário |

Gere os segredos em uma máquina confiável:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use a primeira saída em `BACKUP_CRON_SECRET` e a segunda em `BACKUP_ENCRYPTION_KEY_BASE64`. Guarde a chave de criptografia em um gerenciador de segredos separado do R2. Sem ela, um arquivo baixado do R2 não pode ser restaurado.

## Configuração do Cloudflare R2

1. Crie um bucket privado, por exemplo `dudit-backups`.
2. Crie uma API token R2 com acesso limitado a esse bucket e somente as permissões necessárias de listar, ler e gravar objetos.
3. Configure as quatro variáveis `CLOUDFLARE_*` acima no Railway. As credenciais com prefixo `CLOUDFLARE_BACKUP_R2_*` são diferentes das credenciais usadas pelo bucket de imagens/arquivos.
4. Não configure domínio público, CORS ou URL pública para esse bucket.

O endpoint S3-compatible usado internamente é:

```text
https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
```

O bucket de backup é separado do bucket usado pelas imagens do sistema. Portanto, a integração existente de uploads não precisa ser alterada.

## Configuração do cron-job.org

Crie um job diário, em um horário de baixo uso:

- URL: `https://SEU_DOMINIO/api/internal/jobs/backup-database`
- método: `POST`
- frequência: uma vez por dia, por exemplo `03:00 UTC`
- header: `Authorization: Bearer <BACKUP_CRON_SECRET>`
- header: `Content-Type: application/json`
- corpo: vazio
- timeout do cliente: maior que a duração máxima esperada do backup

Respostas esperadas:

- `200`: backup enviado e retenção aplicada;
- `200` com `skipped: true`: outra execução já está ativa;
- `401`: segredo ausente/incorreto;
- `429`: limite de chamadas excedido;
- `503`: Redis/rate limiter indisponível;
- `500`: falha no dump, compressão, criptografia, upload ou retenção.

O endpoint aceita somente POST, valida o segredo com comparação constant-time, aplica rate limit, impede execuções concorrentes com lock Redis e não registra URL, senha, payload ou stderr do PostgreSQL.

## Nome, compressão e criptografia

Os arquivos seguem o padrão:

```text
backups/dudit-db-backup-2026-08-15T03-00-00Z.dump.gz.enc
```

O conteúdo é produzido como `pg_dump --format=custom`, comprimido com gzip e criptografado em streaming com AES-256-GCM. A tag de autenticação é validada na restauração; um arquivo adulterado ou corrompido falha antes de ser aplicado ao banco.

## Backup manual

O backup manual usa o mesmo caminho protegido do cron:

```bash
curl -X POST "https://SEU_DOMINIO/api/internal/jobs/backup-database" \
  -H "Authorization: Bearer $BACKUP_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Não passe a senha do PostgreSQL, a chave R2 ou a chave de criptografia na URL ou no corpo da requisição.

## Restauração manual

Faça a restauração em um projeto Supabase novo ou banco vazio primeiro. A rotina não usa `--clean`, portanto não é uma operação destrutiva sobre tabelas existentes e pode falhar se o alvo já tiver objetos conflitantes.

1. Baixe o objeto do bucket privado para uma máquina segura.
2. Exporte a chave de criptografia e a URL do banco de destino:

```bash
export BACKUP_ENCRYPTION_KEY_BASE64='...'
export BACKUP_RESTORE_DATABASE_URL='postgresql://usuario:senha@host:5432/postgres?sslmode=require'
```

3. Rode:

```bash
node scripts/restore-database.mjs ./dudit-db-backup-2026-08-15T03-00-00Z.dump.gz.enc
```

O script remove a senha da URL antes de iniciar `pg_restore`, passa a senha somente por `PGPASSWORD`, valida AES-GCM, descomprime o gzip e restaura o formato custom pelo stdin.

## Teste de restore antes do MVP

Antes do lançamento:

1. execute um backup manual;
2. confirme no R2 que o objeto existe e que o tamanho retornado é maior que zero;
3. configure um projeto Supabase temporário ou PostgreSQL descartável;
4. baixe o arquivo e rode o script de restauração;
5. verifique tabelas, contagens e alguns registros não sensíveis com `psql`;
6. registre a data do teste e o tempo total de restauração;
7. repita mensalmente e sempre que mudar a versão do PostgreSQL ou o processo de backup.

## Monitoramento

Cada execução registra somente início, sucesso/falha, nome do arquivo, tamanho, duração e contagem da retenção. Falhas geram evento no Sentry com o tipo de erro e duração, sem credenciais ou dados de clientes/financeiro.

Para o MVP, configure também um alerta no cron-job.org para qualquer resposta diferente de `200` e um alerta no Sentry para o módulo `database-backup`.
