const RESERVED_LOCAL_PARTS = new Set(["admin", "root", "postmaster", "abuse", "support"]);

export type LocalPartValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateLocalPart(input: string): LocalPartValidationResult {
  const value = input.trim().toLowerCase();

  if (value.length < 3 || value.length > 32) {
    return { ok: false, error: "Use 3 to 32 characters." };
  }

  if (!/^[a-z0-9-]+$/.test(value)) {
    return { ok: false, error: "Use lowercase letters, numbers, and hyphens only." };
  }

  if (value.startsWith("-") || value.endsWith("-") || value.includes("--")) {
    return { ok: false, error: "Hyphens cannot start, end, or repeat." };
  }

  if (RESERVED_LOCAL_PARTS.has(value)) {
    return { ok: false, error: "This address name is reserved." };
  }

  return { ok: true, value };
}

export function buildMailboxAddress(localPart: string, domain: string): string {
  return `${localPart}@${domain}`;
}
