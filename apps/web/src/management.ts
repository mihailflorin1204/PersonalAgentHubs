export type Organization = {
  id: string;
  name: string;
  createdAt?: string;
};

export function organizationCreateBody(name: string): { name: string } | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return null;
  }
  return { name: trimmed };
}

export function readOrganization(value: unknown): Organization | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.length === 0) {
    return null;
  }
  if (typeof record.name !== "string" || record.name.trim() === "") {
    return null;
  }
  return {
    id: record.id,
    name: record.name,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
  };
}

export function latestOrganization(organizations: Organization[]): Organization | null {
  const first = organizations[0];
  if (!first) {
    return null;
  }
  return organizations.reduce((latest, item) => {
    if (!latest.createdAt || !item.createdAt) {
      return latest;
    }
    return item.createdAt > latest.createdAt ? item : latest;
  }, first);
}

export function readOrganizationList(value: unknown): Organization[] | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const organizations = (value as { organizations?: unknown }).organizations;
  if (!Array.isArray(organizations)) {
    return null;
  }
  const parsed: Organization[] = [];
  for (const item of organizations) {
    const organization = readOrganization(item);
    if (!organization) {
      return null;
    }
    parsed.push(organization);
  }
  return parsed;
}
