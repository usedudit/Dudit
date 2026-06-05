/**
 * Shared utility for generating static Pix BR Code payload according to BACEN standards.
 */
export function generateStaticPix(
  key: string,
  amount: number,
  merchantName: string,
  city: string,
  txId = "DUDIT"
): string {
  // Format clean name and clean city (ASCII only, limited length)
  const cleanName = merchantName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .substring(0, 25)
    .trim()

  const cleanCity = (city || "SAO PAULO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .substring(0, 15)
    .trim()

  let cleanKey = key.replace(/\s/g, "")
  if (!cleanKey.includes("@") && cleanKey.length === 11) {
    cleanKey = cleanKey.replace(/\D/g, "")
  }

  const parts = [
    { id: "00", value: "01" },
    {
      id: "26",
      value: [
        { id: "00", value: "br.gov.bcb.pix" },
        { id: "01", value: cleanKey }
      ].map(p => `${p.id}${String(p.value.length).padStart(2, "0")}${p.value}`).join("")
    },
    { id: "52", value: "0000" },
    { id: "53", value: "986" },
    { id: "54", value: amount.toFixed(2) },
    { id: "58", value: "BR" },
    { id: "59", value: cleanName },
    { id: "60", value: cleanCity },
    {
      id: "62",
      value: [
        { id: "05", value: txId.substring(0, 25) }
      ].map(p => `${p.id}${String(p.value.length).padStart(2, "0")}${p.value}`).join("")
    }
  ]

  let payload = parts.map(p => `${p.id}${String(p.value.length).padStart(2, "0")}${p.value}`).join("")
  payload += "6304" // Indicator for CRC16

  // Calculate CRC16 CCITT
  let crc = 0xFFFF
  for (let i = 0; i < payload.length; i++) {
    const charCode = payload.charCodeAt(i)
    crc ^= (charCode << 8)
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF
      } else {
        crc = (crc << 1) & 0xFFFF
      }
    }
  }

  const crcString = crc.toString(16).toUpperCase().padStart(4, "0")
  return payload + crcString
}
