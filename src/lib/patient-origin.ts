export const PATIENT_ORIGIN_VALUES = ["google", "instagram", "desconhecida"] as const;

export type PatientOrigin = (typeof PATIENT_ORIGIN_VALUES)[number];

export function normalizePatientOrigin(origin: string | null | undefined): PatientOrigin {
  const raw = String(origin ?? "").trim().toLowerCase();

  if (raw === "google" || raw === "site") {
    return "google";
  }

  if (
    raw === "instagram" ||
    raw === "insta" ||
    raw === "facebook" ||
    raw === "facebook/instagram" ||
    raw === "facebook / instagram"
  ) {
    return "instagram";
  }

  if (
    raw === "desconhecida" ||
    raw === "desconhecido" ||
    raw === "descolhecida" ||
    raw === ""
  ) {
    return "desconhecida";
  }

  return "desconhecida";
}

export function getPhoneVariants(raw: string): string[] {
  const clean = raw.replace(/\D/g, "");
  const variants = new Set<string>([clean]);

  if (clean.startsWith("55") && clean.length >= 12) variants.add(clean.slice(2));
  if (!clean.startsWith("55") && clean.length >= 10) variants.add("55" + clean);

  if (clean.length === 13 && clean.startsWith("55")) {
    const ddd = clean.slice(2, 4);
    const sem9 = clean.slice(5);
    variants.add(ddd + sem9);
    variants.add("55" + ddd + sem9);
  }

  if (clean.length === 11 && !clean.startsWith("55")) {
    const ddd = clean.slice(0, 2);
    const sem9 = clean.slice(3);
    variants.add(ddd + sem9);
    variants.add("55" + ddd + sem9);
    variants.add("55" + clean);
  }

  if (clean.length === 10 && !clean.startsWith("55")) {
    const ddd = clean.slice(0, 2);
    const num = clean.slice(2);
    variants.add(ddd + "9" + num);
    variants.add("55" + ddd + "9" + num);
    variants.add("55" + clean);
  }

  return Array.from(variants);
}
