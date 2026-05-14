"use server";

import { openaiService } from "@/lib/ai/openai-service";
import type { AttendanceReviewAnalysisResult } from "@/types/attendance-review";
import { z } from "zod";

const attendanceReviewAnalysisSchema = z.object({
  unidade: z.string().nullable(),
  mes: z.string().nullable(),
  ano: z.string().nullable(),
  documentType: z.enum(["foto", "pdf", "docx", "desconhecido"]),
  confidence: z.enum(["alta", "média", "baixa"]),
  rows: z.array(
    z.object({
      lineIndex: z.number(),
      patientName: z.string(),
      appointmentDate: z.string().nullable(),
      appointmentTime: z.string().nullable(),
      realizou: z.enum(["S", "N"]).nullable(),
      dataAtendimento: z.string().nullable(),
      confidence: z.enum(["alta", "média", "baixa"]),
      notes: z.string().nullable(),
    })
  ),
});

const attendanceReviewValidationSchema = z.object({
  unidade: z.string().nullable(),
  mes: z.string().nullable(),
  ano: z.string().nullable(),
  documentType: z.enum(["foto", "pdf", "docx", "desconhecido"]),
  confidence: z.enum(["alta", "média", "baixa"]),
  rows: z.array(
    z.object({
      lineIndex: z.number(),
      matchedLineIndex: z.number().nullable(),
      patientName: z.string(),
      appointmentDate: z.string().nullable(),
      appointmentTime: z.string().nullable(),
      realizou: z.enum(["S", "N"]).nullable(),
      dataAtendimento: z.string().nullable(),
      confidence: z.enum(["alta", "média", "baixa"]),
      notes: z.string().nullable(),
    })
  ),
});

export async function analyzeAttendanceDocumentAction(params: {
  fileData: string;
  fileName: string;
  mimeType: string;
}): Promise<AttendanceReviewAnalysisResult | null> {
  const prompt = `
Voce e um especialista em leitura de documentos de faturamento medico.

Analise o arquivo enviado e extraia os dados com o maximo de precisao.

OBJETIVO:
- Identificar a unidade no topo do documento.
- Identificar o mes e o ano no topo do documento.
- Ler cada linha da tabela de pacientes.
- Preencher as colunas "Realizou (S/N)" e "Data de atendimento".

REGRAS IMPORTANTES:
- Nao invente dados.
- Se um campo nao estiver legivel, use null.
- Preserve a ordem das linhas.
- Se houver mais de uma pagina, considere todas.
- A data de atendimento deve ser retornada em formato YYYY-MM-DD quando possivel.
- O campo "realizou" deve ser apenas "S", "N" ou null.
- Se a unidade aparecer com nome completo e bairro, preserve o texto como esta no documento.
- Se o documento tiver foto, PDF ou Word, extraia o conteudo visivel.
- Nao responda em markdown.
- Nao escreva texto extra.
`;

  return openaiService.analyzeDocumentParsed<AttendanceReviewAnalysisResult>(
    params.fileData,
    params.fileName,
    params.mimeType,
    prompt,
    attendanceReviewAnalysisSchema,
    "attendance_review_analysis",
    "gpt-4o"
  );
}

export async function analyzeAttendanceValidationAction(params: {
  fileData: string;
  fileName: string;
  mimeType: string;
  unidade: string;
  mes: string;
  ano: string;
  rows: Array<{
    lineIndex: number;
    patientName: string;
    appointmentDate?: string | null;
    appointmentTime?: string | null;
    unidade?: string;
    convenio?: string;
  }>;
}): Promise<AttendanceReviewAnalysisResult | null> {
  if (!params.rows.length) return null;

  const candidateRowsText = params.rows
    .map((row) => {
      return [
        `lineIndex: ${row.lineIndex}`,
        `patientName: ${row.patientName}`,
        `appointmentDate: ${row.appointmentDate ?? ""}`,
        `appointmentTime: ${row.appointmentTime ?? ""}`,
        `unidade: ${row.unidade ?? ""}`,
        `convenio: ${row.convenio ?? ""}`,
      ].join(" | ");
    })
    .join("\n");

  const prompt = `
Voce e um especialista em validacao de faturamento medico.

O documento ja teve unidade, mes e ano identificados:
- Unidade: ${params.unidade}
- Mes: ${params.mes}
- Ano: ${params.ano}

Agora compare o arquivo enviado com as linhas internas ja filtradas do sistema.

OBJETIVO:
- Encontrar apenas os pacientes que aparecem visivelmente no arquivo.
- Para cada paciente visivel no arquivo, retornar:
  - "matchedLineIndex": numero da linha interna correspondente
  - "realizou" com "S", "N" ou null
  - "dataAtendimento" com a data do atendimento, quando existir

REGRAS IMPORTANTES:
- Nao invente dados.
- Se a linha nao estiver clara, use null.
- Preserve a ordem em que os pacientes aparecem no arquivo.
- "matchedLineIndex" deve apontar para uma linha da lista interna fornecida.
- Se um paciente do arquivo nao puder ser associado com seguranca a uma linha interna, use null em "matchedLineIndex".
- Se a data de atendimento nao existir no documento, use null.
- A data de atendimento deve ser YYYY-MM-DD quando possivel.
- O campo "realizou" deve ser apenas "S", "N" ou null.
- Nao responda em markdown.
- Nao escreva texto extra.

LINHAS INTERNAS FILTRADAS:
${candidateRowsText}
`;

  return openaiService.analyzeDocumentParsed<AttendanceReviewAnalysisResult>(
    params.fileData,
    params.fileName,
    params.mimeType,
    prompt,
    attendanceReviewValidationSchema,
    "attendance_review_validation",
    "gpt-4o"
  );
}
export async function analyzeAttendanceRefinementAction(params: {
  fileData: string;
  fileName: string;
  mimeType: string;
  unidade: string;
  pendingPatients: Array<{
    lineIndex: number;
    patientName: string;
    convenio?: string;
  }>;
}): Promise<AttendanceReviewAnalysisResult | null> {
  if (!params.pendingPatients.length) return null;

  const pendingText = params.pendingPatients
    .map((p) => `- ID: ${p.lineIndex}, Nome: ${p.patientName}, Convênio: ${p.convenio ?? ""}`)
    .join("\n");

  const prompt = `
Voce e um especialista em recuperacao de dados de faturamento medico.

Sua missao e encontrar especificamente os pacientes abaixo, que nao foram localizados em uma busca inicial.
Analise o documento com cuidado redobrado (olhe rodapes, cantos, linhas levemente ilegiveis ou abreviadas).

UNIDADE: ${params.unidade}

PACIENTES PARA LOCALIZAR:
${pendingText}

REGRAS:
- Procure por nomes parciais, abreviacoes ou sobrenomes.
- Se encontrar o paciente, informe o status "realizou" (S/N) e "dataAtendimento".
- "matchedLineIndex" deve ser o ID fornecido acima.
- Nao invente dados. Se nao achar mesmo apos busca profunda, use null.
- Nao responda em markdown.
`;

  return openaiService.analyzeDocumentParsed<AttendanceReviewAnalysisResult>(
    params.fileData,
    params.fileName,
    params.mimeType,
    prompt,
    attendanceReviewValidationSchema,
    "attendance_review_refinement",
    "gpt-4o"
  );
}
