export const investigationLimits = {
  groups: 8,
  sourcesPerGroup: 2,
  items: 1000,
} as const;
export const approvedSourceHosts = [
  'cpsc.gov',
  'www.cpsc.gov',
  'iniushop.com',
  'b41recall.iniushop.com',
] as const;
export const coverageDescription =
  'US electronics; official CPSC recall notices and approved INIU manufacturer sources. Search results are bounded and are not exhaustive.';
export function testFixturesEnabled(value?: string) {
  return value === 'true';
}
