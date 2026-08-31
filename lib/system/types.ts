/**
 * Types for platform-wide system settings, maintenance mode, and announcements.
 *
 * @module system/types
 */

export type AnnouncementType = "info" | "warning" | "urgent"

export interface MaintenanceConfig {
  enabled: boolean
  message: string
  estimated_end: string | null // ISO Date string or null
  allow_admin_bypass: boolean
  bypass_token: string
  updated_at?: string
  updated_by?: string | null
}

export interface GlobalAnnouncementConfig {
  active: boolean
  id: string
  title: string
  message: string
  type: AnnouncementType
  closable: boolean
  expires_at: string | null // ISO Date string or null
  link_url?: string | null
  link_text?: string | null
  updated_at?: string
  updated_by?: string | null
}

export interface MaintenanceBroadcastInput {
  title: string
  message: string
  targetAudience: "all" | "customers" | "partners"
  sendPush: boolean
  sendInApp: boolean
  estimatedEnd?: string | null
}

export interface SystemSettingsState {
  maintenance: MaintenanceConfig
  announcement: GlobalAnnouncementConfig
}
