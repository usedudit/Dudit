import "server-only"

import { MetaGraphClient } from "@/lib/meta/graph-client"

export class MetaWhatsappManagementClient {
  private readonly graph: MetaGraphClient

  constructor(accessToken: string, graphVersion?: string) {
    this.graph = new MetaGraphClient(accessToken, graphVersion)
  }

  async getWaba(wabaId: string) {
    return this.graph.request<Record<string, unknown>>(`/${wabaId}`, {
      searchParams: {
        fields: "id,name,message_template_namespace,currency,timezone_id,owner_business_info,account_review_status",
      },
    })
  }

  async getPhoneNumbers(wabaId: string) {
    return this.graph.request<{ data?: Array<Record<string, unknown>> }>(`/${wabaId}/phone_numbers`, {
      searchParams: {
        fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status",
      },
    })
  }

  async getMessageTemplates(wabaId: string) {
    return this.graph.request<{ data?: Array<Record<string, unknown>> }>(`/${wabaId}/message_templates`, {
      searchParams: {
        fields: "id,name,language,status,category,components",
      },
    })
  }

  async subscribeAppToWaba(wabaId: string) {
    return this.graph.request<Record<string, unknown>>(`/${wabaId}/subscribed_apps`, {
      method: "POST",
    })
  }
}
