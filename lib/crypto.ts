"use server"

import { encrypt, decrypt } from "@/lib/cryptoService"

/**
 * Encrypt CPF using AES-256-GCM with HKDF-derived key.
 * Wrapper around cryptoService for backward compatibility.
 */
export async function encryptCPF(cpf: string): Promise<string> {
  return encrypt(cpf, "cpf")
}

/**
 * Decrypt CPF using AES-256-GCM with HKDF-derived key.
 * Wrapper around cryptoService for backward compatibility.
 */
export async function decryptCPF(encryptedCpf: string): Promise<string> {
  return decrypt(encryptedCpf, "cpf")
}
