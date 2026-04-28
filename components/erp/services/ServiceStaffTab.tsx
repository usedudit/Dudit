"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Checkbox } from "@/components/reusable"
import { createClient } from "@/lib/supabase/client"

interface ServiceStaffTabProps {
    serviceData: any
    handleInputChange: (e: any) => void
    isEditing: boolean
    partnerId: string
}

export const ServiceStaffTab: React.FC<ServiceStaffTabProps> = ({
    serviceData, handleInputChange, isEditing, partnerId
}) => {
    const [staffList, setStaffList] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const assignedStaff = serviceData.assigned_staff || { all: true, staff_ids: [] }

    useEffect(() => {
        const fetchStaff = async () => {
            if (!partnerId) return
            try {
                const supabase = createClient()
                const { data, error } = await supabase
                    .from("user_profiles")
                    .select("id, full_name, display_name")
                    .eq("partner_id", partnerId)
                    .eq("is_active", true)

                if (data && !error) {
                    setStaffList(data)
                }
            } catch (err) {
                console.error("Failed to fetch staff", err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchStaff()
    }, [partnerId])

    const handleToggleAll = (checked: boolean) => {
        handleInputChange({
            target: { name: "assigned_staff", value: { all: checked, staff_ids: [] } }
        })
    }

    const handleToggleStaff = (staffId: string, checked: boolean) => {
        const currentIds = assignedStaff.staff_ids || []
        let newIds = [...currentIds]

        if (checked) {
            newIds.push(staffId)
        } else {
            newIds = newIds.filter((id: string) => id !== staffId)
        }

        handleInputChange({
            target: {
                name: "assigned_staff",
                value: { all: false, staff_ids: newIds }
            }
        })
    }

    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Profissionais Habilitados</h3>
                <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">
                    Selecione quais membros da equipe estão aptos a realizar este serviço. Isso refletirá na disponibilidade da agenda.
                </p>
            </div>

            <div className="bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-2xl p-6">
                <div className="mb-6 pb-6 border-b border-brand-border dark:border-dark-border">
                    <Checkbox
                        label="Todos os membros da equipe podem realizar este serviço"
                        checked={assignedStaff.all}
                        onChange={(c) => handleToggleAll(c)}
                        disabled={!isEditing}
                        name="all_staff"
                    />
                </div>

                {!assignedStaff.all && (
                    <div className="space-y-4">
                        <h4 className="font-semibold text-brand-dark dark:text-dark-heading mb-4">Selecione os profissionais:</h4>

                        {isLoading ? (
                            <p className="text-brand-inactive-text text-sm">Carregando equipe...</p>
                        ) : staffList.length === 0 ? (
                            <p className="text-brand-inactive-text text-sm">Nenhum profissional encontrado.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {staffList.map((staff) => (
                                    <div key={staff.id} className="flex items-center gap-3 p-3 rounded-lg border border-brand-border dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-background transition-colors">
                                        <Checkbox
                                            checked={assignedStaff.staff_ids.includes(staff.id)}
                                            onChange={(c) => handleToggleStaff(staff.id, c)}
                                            disabled={!isEditing}
                                            name={`staff_${staff.id}`}
                                        />
                                        <div>
                                            <p className="font-medium text-brand-dark dark:text-dark-heading text-sm">
                                                {staff.display_name || staff.full_name || "Sem Nome"}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
