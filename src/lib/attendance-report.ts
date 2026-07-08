export type BillingUnitConfig = Record<string, { bairro?: string; empresa?: string }>;
import { normalizePatientOrigin } from "@/lib/patient-origin";

export function normalizeBillingText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export const BILLING_MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export function getBillingMonthLabel(dateStr: string) {
  const [year, month] = dateStr.split("-");
  const idx = Number(month) - 1;
  return idx >= 0 && idx < 12 ? `${BILLING_MONTHS[idx]} de ${year}` : null;
}

export function resolveBillingUnitKey(
  analysisUnit: string | null | undefined,
  patientData: Record<string, Record<string, any>>,
  unitConfig: BillingUnitConfig
) {
  if (!analysisUnit) return null;

  const target = normalizeBillingText(analysisUnit);
  const entries = Object.keys(patientData).sort();

  let fallback: string | null = null;

  for (const key of entries) {
    const keyNorm = normalizeBillingText(key);
    const empresaNorm = normalizeBillingText(unitConfig[key]?.empresa || "");

    if (target === keyNorm || target === empresaNorm) return key;
    if (!fallback && (target.includes(keyNorm) || keyNorm.includes(target))) fallback = key;
    if (!fallback && empresaNorm && (target.includes(empresaNorm) || empresaNorm.includes(target))) fallback = key;
  }

  return fallback;
}

export function getBillingAppointmentsForUnitMonth(
  unitKey: string,
  selectedMonth: string,
  patientData: Record<string, Record<string, any>>,
  unitConfig: BillingUnitConfig
) {
  const unitData = patientData[unitKey];
  if (!unitData) return [];

  const appointments: Array<Record<string, any>> = [];

  for (const dateStr in unitData) {
    const label = getBillingMonthLabel(dateStr); // Ex: "Abril de 2026"
    if (!label) continue;
    
    const [monthLabel, yearLabel] = label.split(" de ");
    const [monthSelected, yearSelected] = selectedMonth.split(" de ");

    if (yearLabel !== yearSelected) continue;

    const normML = normalizeBillingText(monthLabel);
    let rawMS = monthSelected.split("/")[0].split("-")[0].trim(); // Pega apenas a parte do mês se houver 04/2026 ou 04-2026
    let normMS = normalizeBillingText(rawMS);

    // Se o mês selecionado for numérico (ex: "04", "4", "042026"), extrai apenas os dígitos iniciais do mês
    const numericMatch = normMS.match(/^(\d{1,2})/);
    if (numericMatch) {
      const monthIdx = parseInt(numericMatch[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        normMS = normalizeBillingText(BILLING_MONTHS[monthIdx]);
      }
    }

    // Se o mês for muito diferente, pula. 
    // Aceita "Abr" em "Abril", "04" em "Abril" (após conversão), etc.
    if (!normML.includes(normMS) && !normMS.includes(normML)) continue;

    const dayAppointments = unitData[dateStr];
    for (const time in dayAppointments) {
      const appointmentData = dayAppointments[time];
      appointments.push({
        ...appointmentData,
        _unit: unitKey,
        _date: dateStr,
        _time: time,
        _unitName: unitConfig[unitKey]?.empresa || unitKey,
        _bairro: unitConfig[unitKey]?.bairro || "",
        realizouConsulta: appointmentData.realizouConsulta ?? appointmentData.realizou ?? "",
        dataAtendimento: appointmentData.dataAtendimento ?? "",
        confirmado: !!appointmentData.confirmado,
        origem: normalizePatientOrigin(appointmentData.origem),
        _raw: appointmentData,
      });
    }
  }

  return appointments.sort((a, b) => a._date.localeCompare(b._date) || a._time.localeCompare(b._time));
}
