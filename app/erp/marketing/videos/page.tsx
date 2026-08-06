import VideosManagement from "@/components/erp/marketing/VideosManagement"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { FadeIn } from "@/components/animations/FadeIn"

export default function Page() {
    return (
        <>
            <ERPPageHeader title="Vídeos" />
            <FadeIn className="p-4">
                <VideosManagement />
            </FadeIn>
        </>
    )
}
