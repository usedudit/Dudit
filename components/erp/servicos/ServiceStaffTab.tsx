"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Checkbox, ListItem } from "@/components/reusable"
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
        <div className="grid grid-cols-12 gap-y-8 md:gap-y-0 animate-fade-in">
            {/* ESQUERDA (Principal) */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12">
                <div className="mb-6">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Profissionais Habilitados</h3>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm mt-1">
                        Selecione quais membros da equipe estão aptos a realizar este serviço. Isso refletirá na disponibilidade da agenda.
                    </p>
                </div>

                <div className="space-y-6">
                    <div className="pb-6 border-b border-brand-border dark:border-dark-border">
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
                        </div>
                    )}
                </div>
            </div>

            {/* DIREITA (Vazio para manter layout) */}
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0">
            </div>
        </div>
    )
}
