import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"
import { NextRequest, NextResponse } from "next/server"
import { UnosendService } from "@/lib/services/unosend.service"
import { escapeHtml } from "@/lib/security/input-sanitizer"

export async function POST(request: NextRequest) {
  try {
    const { userId, email, fullName, isPendingPartner } = await request.json()

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
        { error: `Failed to create user profile: ${userProfileError.message}` },
        { status: 500 }
      )
    } else {
      console.log("User profile created successfully")
    }

    // Send welcome email via Unosend
    if (email) {
      try {
        const escapedFullName = escapeHtml(fullName || "usuário")
        const emailResult = await UnosendService.sendEmail({
          userId,
          from: process.env.UNOSEND_FROM_EMAIL || "noreply@yourdomain.com",
          to: [{ email }],
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
