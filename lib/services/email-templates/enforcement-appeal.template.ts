/**
 * Email template for Enforcement Appeal Notifications sent to the Dudit Moderation/Admin Team (contato@dudit.com.br)
 * Designed for SMTP2GO using Dudit's Montserrat typography and clean security layout.
 */

export interface EnforcementAppealEmailData {
    caseId: string
    entityName: string
    entityTypeLabel: string
    reason: string
    appealStatement: string
    userName: string
    userEmail: string
    userPhone?: string
    createdAt?: string
}

/**
 * Returns the rendered HTML string for sending via SMTP2GO API directly or as fallback.
 */
export function getEnforcementAppealEmailHtml(data: EnforcementAppealEmailData): string {
    const formattedDate = data.createdAt || new Date().toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    })

    return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">

<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Novo Recurso Recebido - Protocolo #${data.caseId} - Dudit</title>

  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');

    body,
    table,
    td,
    p,
    a,
    li {
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
      border-top: 4px solid #00503C;
    }

    #templateContainer {
      max-width: 600px;
      width: 100%;
      background-color: #FFFFFF;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }

    .headerContent {
      padding: 24px 32px 18px;
      text-align: center;
      background-color: #FFFFFF;
      border-bottom: 1px solid #E5E7EB;
    }

    .bodyContent {
      color: #374151;
      font-size: 15px;
      line-height: 1.6;
      padding: 32px;
    }

    h1 {
      color: #111827 !important;
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 16px;
      text-align: center;
    }

    .protocolBox {
      background-color: #F0FDF4;
      border: 2px dashed #86EFAC;
      border-radius: 10px;
      padding: 18px 24px;
      margin: 22px 0;
      text-align: center;
    }

    .protocolText {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 4px;
      color: #15803D;
      margin: 0;
      line-height: 1.2;
    }

    .protocolLabel {
      font-size: 12px;
      font-weight: 600;
      color: #166534;
      margin: 6px 0 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .statementBox {
      background-color: #EFF6FF;
      border-left: 4px solid #3B82F6;
      border-radius: 4px;
      padding: 16px 20px;
      margin: 20px 0;
      font-size: 14px;
      color: #1E3A8A;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .footerContent {
      color: #9CA3AF;
      font-size: 13px;
      padding: 20px 30px;
      text-align: center;
      background-color: #FAFAFA;
      border-top: 1px solid #F3F4F6;
    }

    @media only screen and (max-width: 480px) {
      #templateContainer {
        width: 100% !important;
      }

      .bodyContent {
        padding: 20px !important;
      }

      h1 {
        font-size: 20px !important;
      }

      .protocolText {
        font-size: 22px !important;
        letter-spacing: 3px !important;
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
            
            <!-- HEADER -->
            <tr>
              <td align="center" valign="top" class="headerContent">
                <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" style="max-width: 120px; display: block; margin: 0 auto;" />
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td valign="top" class="bodyContent">
                <h1>Novo Recurso de Moderação Recebido</h1>

                <p style="text-align: left; margin-bottom: 20px;">
                  Um lojista/usuário submeteu esclarecimentos para contestar uma medida administrativa aplicada na plataforma.
                </p>

                <!-- PROTOCOLO -->
                <div class="protocolBox">
                  <p class="protocolText">${data.caseId}</p>
                  <p class="protocolLabel">Protocolo Oficial do Caso</p>
                </div>

                <!-- DETALHES DO CASO -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 18px; margin: 20px 0; font-size: 13.5px;">
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500;">Solicitante:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 700; text-align: right;">${data.userName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">E-mail do Solicitante:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right; border-top: 1px solid #F3F4F6;">${data.userEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">Telefone / WhatsApp:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right; border-top: 1px solid #F3F4F6;">${data.userPhone || "Não informado"}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">Alvo / Entidade:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 700; text-align: right; border-top: 1px solid #F3F4F6;">${data.entityName} (${data.entityTypeLabel})</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">Motivo Original da Medida:</td>
                    <td style="padding: 6px 0; color: #DC2626; font-weight: 600; text-align: right; border-top: 1px solid #F3F4F6;">${data.reason || "Decisão da moderação"}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">Data da Solicitação:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right; border-top: 1px solid #F3F4F6;">${formattedDate}</td>
                  </tr>
                </table>

                <!-- ESCLARECIMENTOS DO LOJISTA -->
                <p style="text-align: left; font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 6px;">
                  Esclarecimentos e Defesa do Lojista:
                </p>
                <div class="statementBox">
                  "${data.appealStatement}"
                </div>

                <p style="text-align: left; font-size: 13px; color: #4B5563; margin-top: 24px; line-height: 1.5;">
                  <strong>Ação recomendada:</strong> Acesse a aba de moderação no painel administrativo Dudit (/ddt-admin/partners) para avaliar este caso ou responder diretamente a <strong>${data.userEmail}</strong>.
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td align="center" valign="top" class="footerContent">
                <p style="margin: 0 0 6px 0;">
                  © 2026 Dudit - Painel Administrativo de Moderação
                </p>
                <p style="margin: 0;">
                  Notificação automática de recurso do protocolo #${data.caseId}.
                </p>
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

/**
 * Raw HTML Template for the SMTP2GO Dashboard Editor (sent to contato@dudit.com.br).
 */
export const SMTP2GO_ENFORCEMENT_APPEAL_RAW_HTML = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR">

<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Novo Recurso Recebido - Protocolo #{{caseId}} - Dudit</title>

  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');

    body,
    table,
    td,
    p,
    a,
    li {
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
      border-top: 4px solid #00503C;
    }

    #templateContainer {
      max-width: 600px;
      width: 100%;
      background-color: #FFFFFF;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }

    .headerContent {
      padding: 24px 32px 18px;
      text-align: center;
      background-color: #FFFFFF;
      border-bottom: 1px solid #E5E7EB;
    }

    .bodyContent {
      color: #374151;
      font-size: 15px;
      line-height: 1.6;
      padding: 32px;
    }

    h1 {
      color: #111827 !important;
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 16px;
      text-align: center;
    }

    .protocolBox {
      background-color: #F0FDF4;
      border: 2px dashed #86EFAC;
      border-radius: 10px;
      padding: 18px 24px;
      margin: 22px 0;
      text-align: center;
    }

    .protocolText {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 4px;
      color: #15803D;
      margin: 0;
      line-height: 1.2;
    }

    .protocolLabel {
      font-size: 12px;
      font-weight: 600;
      color: #166534;
      margin: 6px 0 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .statementBox {
      background-color: #EFF6FF;
      border-left: 4px solid #3B82F6;
      border-radius: 4px;
      padding: 16px 20px;
      margin: 20px 0;
      font-size: 14px;
      color: #1E3A8A;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .footerContent {
      color: #9CA3AF;
      font-size: 13px;
      padding: 20px 30px;
      text-align: center;
      background-color: #FAFAFA;
      border-top: 1px solid #F3F4F6;
    }

    @media only screen and (max-width: 480px) {
      #templateContainer {
        width: 100% !important;
      }

      .bodyContent {
        padding: 20px !important;
      }

      h1 {
        font-size: 20px !important;
      }

      .protocolText {
        font-size: 22px !important;
        letter-spacing: 3px !important;
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
            
            <!-- HEADER -->
            <tr>
              <td align="center" valign="top" class="headerContent">
                <img src="https://img.dudit.com.br/static/Logo.png" alt="Dudit" style="max-width: 120px; display: block; margin: 0 auto;" />
              </td>
            </tr>

            <!-- BODY -->
            <tr>
              <td valign="top" class="bodyContent">
                <h1>Novo Recurso de Moderação Recebido</h1>

                <p style="text-align: left; margin-bottom: 20px;">
                  Um lojista/usuário submeteu esclarecimentos para contestar uma medida administrativa aplicada na plataforma.
                </p>

                <!-- PROTOCOLO -->
                <div class="protocolBox">
                  <p class="protocolText">{{caseId}}</p>
                  <p class="protocolLabel">Protocolo Oficial do Caso</p>
                </div>

                <!-- DETALHES DO CASO -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 12px 18px; margin: 20px 0; font-size: 13.5px;">
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500;">Solicitante:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 700; text-align: right;">{{userName}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">E-mail do Solicitante:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right; border-top: 1px solid #F3F4F6;">{{userEmail}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">Telefone / WhatsApp:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right; border-top: 1px solid #F3F4F6;">{{userPhone}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">Alvo / Entidade:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 700; text-align: right; border-top: 1px solid #F3F4F6;">{{entityName}} ({{entityTypeLabel}})</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">Motivo Original da Medida:</td>
                    <td style="padding: 6px 0; color: #DC2626; font-weight: 600; text-align: right; border-top: 1px solid #F3F4F6;">{{reason}}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280; font-weight: 500; border-top: 1px solid #F3F4F6;">Data da Solicitação:</td>
                    <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right; border-top: 1px solid #F3F4F6;">{{createdAt}}</td>
                  </tr>
                </table>

                <!-- ESCLARECIMENTOS DO LOJISTA -->
                <p style="text-align: left; font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 6px;">
                  Esclarecimentos e Defesa do Lojista:
                </p>
                <div class="statementBox">
                  "{{appealStatement}}"
                </div>

                <p style="text-align: left; font-size: 13px; color: #4B5563; margin-top: 24px; line-height: 1.5;">
                  <strong>Ação recomendada:</strong> Acesse a aba de moderação no painel administrativo Dudit (/ddt-admin/partners) para avaliar este caso ou responder diretamente a <strong>{{userEmail}}</strong>.
                </p>
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td align="center" valign="top" class="footerContent">
                <p style="margin: 0 0 6px 0;">
                  © 2026 Dudit - Painel Administrativo de Moderação
                </p>
                <p style="margin: 0;">
                  Notificação automática de recurso do protocolo #{{caseId}}.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`
