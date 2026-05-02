import citiesData from '@/lib/data/cities.json';

// Initialize a Set for O(1) lookups
const validCitiesSet = new Set(citiesData as string[]);

/**
 * Validates if a given slug is a valid Brazilian city in the format 'cidade-uf'
 * @param slug The city slug (e.g. 'sao-paulo-sp')
 * @returns boolean
 */
export function isValidCitySlug(slug: string): boolean {
  if (!slug) return false;
  return validCitiesSet.has(slug.toLowerCase());
}
