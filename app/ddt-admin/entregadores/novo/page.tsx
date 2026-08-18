import { AdminHeader } from "@/components/admin/admin-header"
import DeliveryDriverInvitePage from "@/components/admin/DeliveryDriverInvitePage"

export default function NewDeliveryDriverPage() {
  return <><AdminHeader pageTitle="Novo entregador" backHref="/ddt-admin/entregadores" /><DeliveryDriverInvitePage /></>
}
