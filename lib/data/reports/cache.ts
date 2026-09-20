export const REPORT_TAGS = {
  visaoGeral:   (pid: string, p = "monthly") => `report-visao-geral:${pid}:${p}`,
  vendas:       (pid: string, p = "monthly") => `report-vendas:${pid}:${p}`,
  produtos:     (pid: string, p = "monthly") => `report-produtos:${pid}:${p}`,
  servicos:     (pid: string, p = "monthly") => `report-servicos:${pid}:${p}`,
  entregas:     (pid: string, p = "monthly") => `report-entregas:${pid}:${p}`,
  ordensServico:(pid: string, p = "monthly") => `report-os:${pid}:${p}`,
  financeiro:   (pid: string, p = "monthly") => `report-financeiro:${pid}:${p}`,
  clientes:     (pid: string, p = "monthly") => `report-clientes:${pid}:${p}`,
  marketing:    (pid: string, p = "monthly") => `report-marketing:${pid}:${p}`,
  produtividade:(pid: string, p = "monthly") => `report-produtividade:${pid}:${p}`,
  trocas:       (pid: string, p = "monthly") => `report-trocas:${pid}:${p}`,
  agendamentos: (pid: string, p = "monthly") => `report-agendamentos:${pid}:${p}`,
}
