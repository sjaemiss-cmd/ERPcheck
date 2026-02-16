/**
 * Normalizes a phone number by stripping non-digit characters,
 * converting international prefixes (+82, 82) to domestic (0),
 * and validating length.
 *
 * @returns normalized phone string (digits only) or null if invalid
 */
export function normalizePhone(raw: string | null | undefined): string | null {
    if (!raw) return null

    // Strip all non-digit characters
    let digits = raw.replace(/\D/g, '')

    // Convert +82 / 82 prefix to 0
    if (digits.startsWith('82') && digits.length >= 11) {
        digits = '0' + digits.slice(2)
    }

    // Validate length (Korean phone numbers: 9-11 digits)
    if (digits.length < 9 || digits.length > 11) return null

    return digits
}
