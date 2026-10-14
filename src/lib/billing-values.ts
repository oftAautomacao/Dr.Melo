type ExamBillingConfig = {
  drMelo?: unknown;
};

export function parseBillingValue(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("incluso")) return 0;

  const numericText = normalized.replace(/[^\d,.-]/g, "");
  if (!/\d/.test(numericText)) return undefined;

  const decimalText = numericText.includes(",")
    ? numericText.replace(/\./g, "").replace(",", ".")
    : numericText;
  const parsed = Number(decimalText);

  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getDrMeloProcedureValue(
  examName: string,
  examConfig: Record<string, ExamBillingConfig | undefined>,
): number | undefined {
  return parseBillingValue(examConfig[examName]?.drMelo);
}

export function isProcedureIncludedInConsultation(
  examName: string,
  examConfig: Record<string, ExamBillingConfig | undefined>,
): boolean {
  if (examName.toLowerCase().includes("(incluso na consulta)")) return true;

  const drMeloValue = examConfig[examName]?.drMelo;
  return typeof drMeloValue === "string"
    && drMeloValue.toLowerCase().includes("incluso");
}

export function getBillingProcedureNames(
  procedureNames: string[] | undefined,
  examConfig: Record<string, ExamBillingConfig | undefined>,
): string[] {
  const procedures = procedureNames?.length ? [...procedureNames] : ["Consulta"];
  const hasConsultation = procedures.some(
    (procedure) => procedure.trim().toLowerCase() === "consulta",
  );
  const hasIncludedProcedure = procedures.some(
    (procedure) => isProcedureIncludedInConsultation(procedure, examConfig),
  );

  return hasIncludedProcedure && !hasConsultation
    ? ["Consulta", ...procedures]
    : procedures;
}
