import { redirect } from "next/navigation"

export default function NewDeliveryDriverPage() {
    redirect("/ddt-admin/entregadores?create=true")
}
