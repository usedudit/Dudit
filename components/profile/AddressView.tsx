"use client"

import { motion, AnimatePresence } from "framer-motion"
import { MapPinIcon } from "@/lib/icons"
import { Button, Input, CepInput, StateComboBox } from "@/components/reusable"
import { SectionCard, DisplayRow, Feedback, PageHeader, fade, View, EditField } from "./profile-shared"

interface AddressViewProps {
  navigate: (view: View) => void
  addressData: any
  setAddressData: any
  editing: Record<EditField, boolean>
  setEdit: (field: EditField, val: boolean) => void
  isLoading: boolean
  error: string | null
  success: string | null
  handleSaveAddress: () => void
  formattedAddress: () => string
}

export const AddressView = ({
  navigate,
  addressData,
  setAddressData,
  editing,
  setEdit,
  isLoading,
  error,
  success,
  handleSaveAddress,
  formattedAddress,
}: AddressViewProps) => (
  <motion.div key="address" {...fade} className="max-w-[800px] mx-auto space-y-6">
    <PageHeader title="Endereço" subtitle="Atualize seu endereço de entrega ou cobrança." onBack={() => navigate("main")} />
    <SectionCard title="Meu endereço">
      <AnimatePresence mode="wait">
        {!editing.address ? (
          <motion.div key="addr-display" {...fade}>
            <DisplayRow icon={MapPinIcon} value={formattedAddress()} description="Seu endereço de entrega ou cobrança." onEdit={() => setEdit("address", true)} />
          </motion.div>
        ) : (
          <motion.div key="addr-edit" {...fade} className="space-y-4">
            <CepInput
              label="CEP"
              id="zipCode"
              name="zipCode"
              value={addressData.zipCode}
              onChange={val => setAddressData((d: any) => ({ ...d, zipCode: val }))}
              onAddressFetched={addr => {
                setAddressData((p: any) => ({
                  ...p,
                  street: addr.street || p.street,
                  neighborhood: addr.neighborhood || p.neighborhood,
                  city: addr.city || p.city,
                  state: addr.state || p.state,
                }))
              }}
            />
            <Input
              label="Rua"
              id="street"
              name="street"
              value={addressData.street}
              onChange={e => setAddressData((d: any) => ({ ...d, street: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Número"
                id="number"
                name="number"
                value={addressData.number}
                onChange={e => setAddressData((d: any) => ({ ...d, number: e.target.value }))}
              />
              <Input
                label="Complemento"
                id="complement"
                name="complement"
                value={addressData.complement}
                onChange={e => setAddressData((d: any) => ({ ...d, complement: e.target.value }))}
              />
            </div>
            <Input
              label="Bairro"
              id="neighborhood"
              name="neighborhood"
              value={addressData.neighborhood}
              onChange={e => setAddressData((d: any) => ({ ...d, neighborhood: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Cidade"
                id="city"
                name="city"
                value={addressData.city}
                onChange={e => setAddressData((d: any) => ({ ...d, city: e.target.value }))}
              />
              <StateComboBox
                value={addressData.state}
                onChange={v => setAddressData((d: any) => ({ ...d, state: v }))}
                className="w-full"
              />
            </div>
            <Feedback error={error} success={success} />
            <div className="flex gap-2">
              <Button type="button" onClick={handleSaveAddress} disabled={isLoading}>{isLoading ? "Salvando..." : "Salvar endereço"}</Button>
              <Button type="button" variant="outline" onClick={() => setEdit("address", false)}>Cancelar</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SectionCard>
  </motion.div>
)
