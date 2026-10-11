# Validação operacional dos backups - 15/08/2026

## Status

**Ainda não aprovado para fechamento do MVP.** O acesso ao R2 e a camada de criptografia foram validados, mas o primeiro artefato revelou que a execução local com o wrapper Windows não produziu payload PostgreSQL. O restore rejeitou corretamente o artefato vazio.

Foi corrigido o fluxo para:

- usar upload multipart para streams de tamanho desconhecido no R2;
- não consumir o stream antes do upload;
- falhar explicitamente se `pg_dump` produzir zero bytes.

Essa correção precisa ser publicada e validada no Railway/Linux antes da aprovação final.

## Configuração revisada

| Item | Resultado |
| --- | --- |
| Conexão PostgreSQL | `POSTGRES_URL_NON_POOLING` presente, SSL `require`, Supabase session pooler na porta `5432` |
| Conectividade Docker → PostgreSQL | Confirmada com `psql`, retornando o banco `postgres` |
| Direct connection | Não configurada localmente; deve ser preferida no Railway se disponível |
| R2 account/access key/secret | Credenciais exclusivas do backup configuradas e autorizadas |
| Bucket de backup | Privado, com permissão de objeto para listar, ler, gravar e remover |
| `BACKUP_CRON_SECRET` | Configurada fora do repositório |
| `BACKUP_ENCRYPTION_KEY_BASE64` | Configurada fora do repositório; chave de 32 bytes |
| `pg_dump`/`pg_restore` no host | Ausentes; Docker usado somente para a validação controlada |

## Primeiro backup controlado

O primeiro teste local executou a rota de backup com Docker, criptografia AES-256-GCM, gzip e upload para o R2. O upload e a retenção responderam com sucesso:

- duração: aproximadamente `102 s`;
- tamanho reportado: `176 bytes`;
- retenção: `0` removidos, `1` retido.

O download posterior, a descriptografia e a autenticação GCM funcionaram, mas o conteúdo descompactado não começou com `PGDMP`; o dump PostgreSQL estava vazio. O objeto inválido foi removido do bucket. Portanto, esse resultado não é considerado um backup restaurável.

## Restore

O restore foi executado em um PostgreSQL descartável local, sem tocar no banco de produção. A descriptografia falhou na validação do conteúdo PostgreSQL porque o payload estava vazio; nenhuma tabela foi restaurada.

As tabelas abaixo continuam pendentes de confirmação em um artefato válido:

- `auth.users`;
- `partners`;
- `customers`;
- `products`;
- `orders`;
- `transactions`;
- `supabase_migrations.schema_migrations`.

## Retenção

O primeiro upload demonstrou que a rotina consegue listar o bucket e manter o objeto recente. A validação de exclusão de objetos antigos ainda deve ser repetida com backups sintéticos no prefixo dedicado depois que um backup válido for publicado.

## Próximos passos para aprovação

1. Publicar a correção no Railway.
2. Executar o endpoint protegido usando `BACKUP_CRON_SECRET`.
3. Confirmar nos logs: início, sucesso/falha, duração e tamanho sem exibir credenciais ou dados.
4. Baixar o objeto válido do R2, descriptografar e restaurar no PostgreSQL descartável.
5. Confirmar as sete tabelas principais listadas acima.
6. Testar retenção com objetos sintéticos antigos e confirmar que os recentes permanecem.
7. Registrar o resultado final e só então fechar o backup para o MVP.

O `.env` local permanece ignorado pelo Git. Se qualquer credencial tiver sido compartilhada fora do ambiente seguro, ela deve ser rotacionada.
