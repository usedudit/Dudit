import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { NextRequest, NextResponse } from "next/server"
import { SMTP2GOService } from "@/lib/services/smtp2go.service"
import { escapeHtml } from "@/lib/security/input-sanitizer"
import { z } from "zod"
import { checkRateLimitForAPI } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

const createProfileSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().max(320).optional(),
  fullName: z.string().trim().max(200).optional(),
  isPendingPartner: z.boolean().optional(),
}).strict()

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkRateLimitForAPI(
      RateLimitCategory.API_GENERAL,
      "create-profile",
      (request as NextRequest & { ip?: string }).ip,
    )
    if (rateLimit.limited) {
      return NextResponse.json(rateLimit.body, { status: rateLimit.status || 429 })
    }

    const body = createProfileSchema.parse(await request.json())
    const { userId, fullName, isPendingPartner } = body

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      )
    }

    // SECURITY: Verify the authenticated user matches the requested userId
    const user = await getCurrentUser()

    if (!user || user.id !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const supabase = await getSupabaseServerClient()

    // Create user_profiles record
    const { data, error: userProfileError } = await supabase
      .from("user_profiles")
      .insert({
        user_id: userId,
        full_name: fullName || "",
        phone: null,
        pending_partner_registration: isPendingPartner || false,
      })

    if (userProfileError) {
      console.error("Error creating user_profile:", {
        code: userProfileError.code,
        message: userProfileError.message,
        details: userProfileError.details,
        hint: userProfileError.hint,
      })
      return NextResponse.json(
        { error: "Não foi possível criar o perfil." },
        { status: 500 }
      )
    } else {
      console.log("User profile created successfully")
    }

    // Send welcome email via SMTP2GO
    const welcomeEmail = user.email
    if (welcomeEmail) {
      try {
        const escapedFullName = escapeHtml(fullName || "usuário")
        const emailResult = await SMTP2GOService.sendEmail({
          userId,
          from: process.env.SMTP2GO_FROM_EMAIL || "noreply@dudit.com.br",
          to: [{ email: welcomeEmail }],
          subject: "Bem-vindo à Plataforma!",
          html: `
            <h1>Bem-vindo, ${escapedFullName}!</h1>
            <p>Sua conta foi criada com sucesso.</p>
            <p>Você agora pode acessar a plataforma e começar a usar nossos serviços.</p>
            <p>Se tiver dúvidas, entre em contato conosco.</p>
          `,
          text: `Bem-vindo, ${fullName || "usuário"}!\n\nSua conta foi criada com sucesso.\n\nVocê agora pode acessar a plataforma e começar a usar nossos serviços.\n\nSe tiver dúvidas, entre em contato conosco.`,
        })

        if (!emailResult.success) {
          console.warn("Failed to send welcome email:", emailResult.error)
          // Continue anyway, don't fail the profile creation
        } else {
          console.log("Welcome email sent successfully:", emailResult.messageId)
        }
      } catch (emailError) {
        console.error("Error sending welcome email:", emailError)
        // Continue anyway, don't fail the profile creation
      }
    }

    return NextResponse.json(
      { success: true, userId },
      { status: 200 }
    )
  } catch (error) {
    console.error("Unexpected error in create-profile:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
