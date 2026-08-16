# Runbook de backup e restore do PostgreSQL

Este documento descreve o procedimento operacional do backup do banco Supabase para o Cloudflare R2 e o teste de restauração.

O fluxo não altera schema, migrations ou o fluxo da aplicação. O backup é lógico, feito com `pg_dump` em formato custom, gzip e AES-256-GCM.

## 1. Variáveis necessárias

As variáveis ficam no Railway e, para os testes locais, no `.env` ignorado pelo Git:

```text
BACKUP_CRON_SECRET=
BACKUP_ENCRYPTION_KEY_BASE64=
BACKUP_DATABASE_URL=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_BACKUP_R2_ACCESS_KEY_ID=
CLOUDFLARE_BACKUP_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_BACKUP_BUCKET=
BACKUP_R2_PREFIX=backups/
BACKUP_RETENTION_DAILY=30
BACKUP_RETENTION_WEEKLY=4
```

`BACKUP_DATABASE_URL` deve preferir a conexão direta do Supabase, quando disponível. A URL não deve ser colocada em logs, tickets, screenshots ou comandos compartilhados.

As credenciais `CLOUDFLARE_BACKUP_R2_*` devem ser exclusivas do bucket privado de backup e ter somente as permissões necessárias para listar, ler, gravar e remover objetos desse bucket.

## 2. Executar backup manual

No PowerShell, a partir da raiz do projeto:

```powershell
Set-Location "C:\Users\MURILO\Downloads\Dudit"

$secret = ((Get-Content .env |
  Where-Object { $_ -match "^BACKUP_CRON_SECRET=" } |
  Select-Object -First 1) -split "=", 2)[1].Trim().Trim('"').Trim("'")

Invoke-RestMethod `
  -Uri "https://SEU_DOMINIO/api/internal/jobs/backup-database" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $secret" } `
  -ContentType "application/json" `
  -Body "{}"
```

O endpoint deve responder sucesso. No Railway, confirme os logs de início, sucesso, duração, tamanho do arquivo e retenção.

O arquivo deve aparecer no R2 com nome semelhante a:

```text
backups/dudit-db-backup-2026-08-16T18-02-55Z.dump.gz.enc
```

Um arquivo de aproximadamente 176 bytes é inválido: normalmente representa apenas o cabeçalho e um gzip vazio. Um backup válido deve ter tamanho compatível com o banco e ser rejeitado pelo job caso o payload do `pg_dump` esteja vazio.

## 3. Baixar e descriptografar

O bucket deve continuar privado. No painel do Cloudflare R2:

1. abra o bucket de backup;
2. selecione o objeto mais recente;
3. faça o download para uma máquina segura;
4. não publique o arquivo nem a chave de criptografia.

O arquivo baixado pode receber um prefixo como `backups_` pelo navegador. Isso não altera o conteúdo.

Na raiz do projeto, execute:

```powershell
node scripts/decrypt-database-backup.mjs `
  "C:\Users\MURILO\Downloads\arquivo-baixado.dump.gz.enc" `
  "C:\Users\MURILO\Downloads\dudit-restore.dump"
```

O script lê `BACKUP_ENCRYPTION_KEY_BASE64` do `.env`, valida o cabeçalho, autentica o AES-GCM, descomprime o gzip e confirma o formato custom do PostgreSQL.

O resultado precisa conter:

```text
algorithm: aes-256-gcm
compression: gzip
dumpBytes: valor maior que zero
```

O dump descriptografado deve começar com a assinatura `PGDMP`. Se a autenticação falhar ou o conteúdo não for `PGDMP`, o arquivo deve ser descartado e o restore não deve continuar.

## 4. Restore recomendado em Supabase de teste

O teste deve usar um projeto Supabase separado e descartável. Nunca use o projeto de produção.

Um projeto Supabase de teste é preferível ao PostgreSQL Docker puro porque já possui extensões Supabase, como `pg_cron` e `supabase_vault`. Se o projeto de teste já tiver dados importantes, crie um projeto novo em vez de restaurar nele.

Não é necessário instalar PostgreSQL no Windows: o container Docker `dudit-backup-restore-mvp` já possui `pg_restore` e `psql`.

Copie o dump para o container:

```powershell
docker cp `
  "C:\Users\MURILO\Downloads\dudit-restore.dump" `
  dudit-backup-restore-mvp:/tmp/dudit-restore.dump
```

Preencha os dados do projeto de teste apenas na sessão atual do PowerShell. Não use a senha nem o host de produção:

```powershell
$testHost = "db.PROJETO_DE_TESTE.supabase.co"
$testPort = "5432"
$testUser = "postgres"
$testDatabase = "postgres"
$testPassword = Read-Host "Senha do banco Supabase de teste"
```

Execute o restore no projeto de teste. `--clean --if-exists` só deve ser usado porque o destino é descartável:

```powershell
docker exec -e "PGPASSWORD=$testPassword" `
  dudit-backup-restore-mvp `
  pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl `
  -h $testHost -p $testPort -U $testUser -d $testDatabase `
  /tmp/dudit-restore.dump
```

Depois da execução:

```powershell
Remove-Variable testPassword
```

Se o projeto de teste estiver vazio e o restore terminar sem erro, o backup está operacionalmente restaurável.

## 5. Validar tabelas principais

Execute no mesmo container, usando novamente a senha do projeto de teste:

```powershell
$testPassword = Read-Host "Senha do banco Supabase de teste"

docker exec -e "PGPASSWORD=$testPassword" `
  dudit-backup-restore-mvp `
  psql -h $testHost -p $testPort -U $testUser -d $testDatabase -c "
SELECT table_schema || '.' || table_name AS table_name
FROM information_schema.tables
WHERE (table_schema, table_name) IN
(
  ('auth','users'),
  ('public','partners'),
  ('public','customers'),
  ('public','products'),
  ('public','orders'),
  ('public','transactions'),
  ('supabase_migrations','schema_migrations')
)
ORDER BY 1;"

Remove-Variable testPassword
```

O resultado deve listar as tabelas esperadas. Para validar dados sem imprimir informações pessoais ou financeiras, use apenas contagens:

```sql
SELECT 'partners' AS table_name, count(*) FROM public.partners
UNION ALL SELECT 'customers', count(*) FROM public.customers
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'orders', count(*) FROM public.orders
UNION ALL SELECT 'transactions', count(*) FROM public.transactions;
```

As contagens do banco de teste devem ser compatíveis com o momento em que o backup foi executado. Não copie registros reais para mensagens, screenshots ou tickets.

## 6. Retenção

Após cada backup, a rotina lista o prefixo configurado no R2 e aplica:

- mantém os 30 objetos mais recentes;
- mantém até 4 objetos semanais adicionais, um por semana ISO;
- remove os demais objetos que possuem nome de backup reconhecido;
- não remove arquivos recentes que estejam dentro das janelas de retenção.

Confirme nos logs `retentionDeleted` e `retentionRetained`. Para um teste controlado, use objetos sintéticos no prefixo de backup e confirme que um objeto recente permanece.

Importante: com várias execuções por dia, `BACKUP_RETENTION_DAILY=30` significa 30 execuções, não 30 dias corridos. Por exemplo, com 3 backups por dia, use pelo menos 90 objetos para aproximadamente 30 dias ou implemente retenção por data-calendário.

## 7. Automatização

No cron-job.org, configure um `POST` diário para:

```text
https://SEU_DOMINIO/api/internal/jobs/backup-database
```

Headers:

```text
Authorization: Bearer BACKUP_CRON_SECRET
Content-Type: application/json
```

Body:

```json
{}
```

Configure alerta para qualquer resposta diferente de HTTP 200. O endpoint também aplica autenticação, rate limit e bloqueio de execuções concorrentes.

Para executar várias vezes por dia, ajuste a retenção proporcionalmente e monitore duração, tamanho e custo de armazenamento antes de aumentar a frequência.

## 8. Critérios de aprovação do MVP

O backup pode ser considerado fechado quando houver evidência de:

1. backup manual concluído no Railway;
2. objeto privado presente no R2;
3. tamanho do objeto registrado;
4. descriptografia e autenticação AES-GCM concluídas;
5. dump `PGDMP` validado;
6. restore concluído em Supabase de teste separado;
7. tabelas principais presentes;
8. retenção confirmada;
9. falha de teste registrada no Sentry;
10. nenhum comando de restore executado no banco de produção.
