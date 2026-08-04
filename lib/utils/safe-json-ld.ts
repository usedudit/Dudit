/**
 * SECURITY: Safe JSON-LD stringifier for dangerouslySetInnerHTML contexts.
 *
 * Standard JSON.stringify() does NOT escape `</script>` sequences, which means
 * user-controlled data (e.g. product names, store names) injected into a
 * `<script type="application/ld+json">` block could break out of the script tag
 * and inject arbitrary HTML/JS.
 *
 * This function escapes all `<` characters to their Unicode equivalent `\u003c`,
 * which is valid JSON and prevents script tag injection.
 *
 * @example
 * // Instead of:
 * dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJsonLd) }}
 * // Use:
 * dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schemaJsonLd) }}
 */
export function safeJsonLdStringify(data: unknown): string {
    return JSON.stringify(data).replace(/</g, "\\u003c")
}
