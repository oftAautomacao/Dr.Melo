export type AttendanceConfidence = "alta" | "média" | "baixa";

export interface AttendanceReviewRow {
  lineIndex: number;
  matchedLineIndex?: number | null;
  patientName: string;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  realizou: "S" | "N" | null;
  dataAtendimento?: string | null;
  confidence: AttendanceConfidence;
  notes?: string;
}

export interface AttendanceReviewAnalysisResult {
  unidade: string | null;
  mes: string | null;
  ano: string | null;
  documentType: "foto" | "pdf" | "docx" | "desconhecido";
  confidence: AttendanceConfidence;
  rows: AttendanceReviewRow[];
}

export interface AttendanceBillingRow {
  _unit: string;
  _date: string;
  _time: string;
  _unitName: string;
  _bairro?: string;
  nomePaciente?: string;
  cpf?: string;
  convenio?: string;
  exames?: string[];
  realizouConsulta?: "S" | "N";
  dataAtendimento?: string;
  confirmado?: boolean;
  origem?: string;
  _raw: Record<string, any>;
}
