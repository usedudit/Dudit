export interface CepLookupResult {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  ibge: string
  latitude: number | null
  longitude: number | null
}
