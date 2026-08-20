const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Checks if a string is a standard 36-character UUID.
 */
export function isUuid(value: unknown): value is string {
    if (typeof value !== "string") return false
    return UUID_REGEX.test(value.trim())
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

/**
 * Generates a clean lowercase alphanumeric short ID of specified length.
 * Default size is 6 characters (~2.17 billion permutations).
 */
export function generateShortId(size = 6): string {
    let id = ""
    for (let i = 0; i < size; i++) {
        const randomIndex = Math.floor(Math.random() * ALPHABET.length)
        id += ALPHABET[randomIndex]
    }
    return id
}
