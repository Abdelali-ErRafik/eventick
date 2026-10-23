export const PRO_SECTIONS = ["overview", "events", "orders", "gate", "finance", "team", "offers"] as const;

export type ProSection = (typeof PRO_SECTIONS)[number];

export const ROLES = ["owner", "admin", "events", "sales", "gate", "finance"] as const;

export type RoleId = (typeof ROLES)[number];

const ACCESS: Record<RoleId, readonly ProSection[]> = {
  owner: PRO_SECTIONS,
  admin: PRO_SECTIONS,
  events: ["overview", "events"],
  sales: ["overview", "orders", "offers"],
  gate: ["overview", "gate"],
  finance: ["overview", "finance"],
};

export function proSearch(section: ProSection = "overview") {
  return { section };
}

export function isProSection(value: string): value is ProSection {
  return (PRO_SECTIONS as readonly string[]).includes(value);
}

export function isRole(value: string): value is RoleId {
  return (ROLES as readonly string[]).includes(value);
}

export function canOpen(role: RoleId, section: ProSection) {
  return ACCESS[role].includes(section);
}
