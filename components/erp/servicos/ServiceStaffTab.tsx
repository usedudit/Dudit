"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Checkbox, FormSection, ListItem } from "@/components/reusable"
import { getTeamMembers } from "@/app/actions/erp/team"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"

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
                const res = await getTeamMembers()
                if (res.members) {
                    setStaffList(res.members)
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
        <div className="animate-fade-in">
            <div>
                <FormSection title="Profissionais habilitados" description="Selecione quais membros da equipe estão aptos a realizar este serviço. Isso refletirá na disponibilidade da agenda.">
                    <div className="space-y-6">
                        <div className="pb-6">
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
                                <FormSection title="Selecione os profissionais:" hasSeparator>
                                    {isLoading ? (
                                        <p className="text-brand-inactive-text text-sm">Carregando equipe...</p>
                                    ) : staffList.length === 0 ? (
                                        <p className="text-brand-inactive-text text-sm">Nenhum profissional encontrado.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-4">
                                            {staffList.map((staff) => (
                                                <ListItem
                                                    key={staff.id}
                                                    title={staff.fullName || staff.email || "Sem Nome"}
                                                    description={staff.isOwner ? "Proprietário" : "Membro da equipe"}
                                                    className="p-4"
                                                    left={
                                                        <UserProfileImage
                                                            fullName={staff.fullName || staff.email || "S N"}
                                                            imageUrl={staff.avatar_url}
                                                            className="w-10 h-10 border border-brand-border dark:border-dark-border"
                                                        />
                                                    }
                                                    right={
                                                        <Checkbox
                                                            checked={assignedStaff.staff_ids.includes(staff.id)}
                                                            onChange={(c) => handleToggleStaff(staff.id, c)}
                                                            disabled={!isEditing}
                                                            name={`staff_${staff.id}`}
                                                        />
                                                    }
                                                />
                                            ))}
                                        </div>
                                    )}
                                </FormSection>
                            </div>
                        )}
                    </div>
                </FormSection>
            </div>
        </div>
    )
}
