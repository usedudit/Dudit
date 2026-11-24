/**
 * Email template for Store/Branch Deletion Confirmation Code (2-step verification).
 * Clean, accessible and secure responsive layout for SMTP2GO.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function getStoreDeletionEmailHtml(
  code: string,
  storeName: string,
  expirationMinutes: number = 15,
): string {
  const safeStoreName = escapeHtml(storeName || "Filial")

  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirme a exclusão da filial ${safeStoreName} - Dudit</title>
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');

    body, table, td, p, a, li {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      font-family: 'Montserrat', Arial, sans-serif;
    }
    body {
      margin: 0;
      padding: 0;
      background-color: #F4F4F5;
      width: 100% !important;
    }
    #bodyCell {
      padding: 30px 15px;
      border-top: 4px solid #DC2626;
    }
    #templateContainer {
      max-width: 560px;
      width: 100%;
      background-color: #FFFFFF;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .headerContent {
      padding: 28px 32px 20px;
      text-align: center;
      border-bottom: 1px solid #F3F4F6;
    }
    .bodyContent {
      padding: 32px;
      color: #1F2937;
      font-size: 15px;
      line-height: 1.6;
    }
    h1 {
      color: #111827;
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 16px;
      text-align: center;
    }
    .storePill {
      background-color: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 10px 14px;
      text-align: center;
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      margin: 16px 0;
    }
    .codeContainer {
      background-color: #FEF2F2;
      border: 2px dashed #F87171;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin: 24px 0;
    }
    .codeText {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 8px;
      color: #DC2626;
      margin: 0;
      line-height: 1;
    }
    .codeLabel {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #991B1B;
      margin-top: 8px;
      margin-bottom: 0;
    }
    .warningBox {
      background-color: #FFFBEB;
      border-left: 4px solid #F59E0B;
      border-radius: 6px;
      padding: 14px 16px;
      margin: 24px 0;
      font-size: 13px;
      color: #92400E;
      line-height: 1.5;
    }
    .footerContent {
      background-color: #F9FAFB;
      padding: 20px 32px;
      text-align: center;
      color: #9CA3AF;
      font-size: 12px;
      border-top: 1px solid #F3F4F6;
    }
    @media only screen and (max-width: 480px) {
      .bodyContent {
        padding: 24px 20px !important;
      }
      .codeText {
        font-size: 28px !important;
        letter-spacing: 6px !important;
      }
    }
  </style>
</head>
<body>
  <center>
    <table align="center" border="0" cellpadding="0" cellspacing="0" height="100%" width="100%" id="bodyTable">
      <tr>
        <td align="center" valign="top" id="bodyCell">
          <table border="0" cellpadding="0" cellspacing="0" id="templateContainer">
            <tr>
              <td class="headerContent">
                <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" style="max-width: 120px; height: auto;" />
              </td>
            </tr>
            <tr>
              <td class="bodyContent">
                <h1>Confirmação de Exclusão de Filial</h1>
                <p style="margin-top: 0;">
                  Recebemos uma solicitação para excluir definitivamente a filial abaixo e todos os dados vinculados a ela no ERP e no Marketplace:
                </p>

                <div class="storePill">${safeStoreName}</div>

                <p>
                  Para confirmar que você realmente deseja prosseguir com a exclusão desta filial, utilize o código de verificação abaixo:
                </p>

                <div class="codeContainer">
                  <p class="codeText">${code}</p>
                  <p class="codeLabel">Válido por ${expirationMinutes} minutos</p>
                </div>

                <div class="warningBox">
                  <strong>⚠️ Atenção:</strong> Esta ação é definitiva e irreversível. Todos os produtos, serviços, pedidos, clientes, registros financeiros e anúncios desta filial serão excluídos permanentemente. Sua conta principal e demais lojas não serão afetadas.
                </div>

                <p style="font-size: 13px; color: #6B7280; margin-top: 28px; line-height: 1.5;">
                  <strong>Não solicitou a exclusão?</strong> Ignore este e-mail imediatamente. A filial continuará ativa e nenhum dado será apagado. Caso suspeite de acesso não autorizado, recomendamos alterar sua senha imediatamente.
                </p>
              </td>
            </tr>
            <tr>
              <td class="footerContent">
                <p style="margin: 0 0 6px 0;">© 2026 Dudit - Descubra. Anuncie. Organize.</p>
                <p style="margin: 0;">Esta é uma mensagem automática de segurança. Não responda a este e-mail.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`
}

export function getStoreDeletionEmailText(
  code: string,
  storeName: string,
  expirationMinutes: number = 15,
): string {
  const name = storeName || "Filial"
  return `Confirmação de Exclusão de Filial - Dudit

Recebemos uma solicitação para excluir definitivamente a filial "${name}" e todos os dados vinculados a ela no ERP e no Marketplace.

Seu código de confirmação é:
${code}

Este código é válido por ${expirationMinutes} minutos.

ATENÇÃO: Esta ação é definitiva e irreversível. Todos os produtos, serviços, pedidos, clientes, registros financeiros e anúncios desta filial serão excluídos permanentemente. Sua conta principal e demais lojas não serão afetadas.

Se você NÃO solicitou a exclusão desta filial, ignore este e-mail. Nenhum dado será apagado e recomendamos alterar sua senha por segurança.

© 2026 Dudit - Mensagem automática de segurança.`
}
