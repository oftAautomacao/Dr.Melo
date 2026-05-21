"use server";

import { ai } from "@/ai/genkit";
import { openaiService } from "@/lib/ai/openai-service";
import type { AttendanceReviewAnalysisResult } from "@/types/attendance-review";
import { z } from "zod";

const confidenceSchema = z.enum(["alta", "m\u00e9dia", "baixa"]);
const documentTypeSchema = z.enum(["foto", "pdf", "docx", "desconhecido"]);

const attendanceReviewAnalysisSchema = z.object({
  unidade: z.string().nullable(),
  mes: z.string().nullable(),
  ano: z.string().nullable(),
  documentType: documentTypeSchema,
  confidence: confidenceSchema,
  rows: z.array(
    z.object({
      lineIndex: z.number(),
      patientName: z.string(),
      appointmentDate: z.string().nullable(),
      appointmentTime: z.string().nullable(),
      realizou: z.enum(["S", "N"]).nullable(),
      dataAtendimento: z.string().nullable(),
      confidence: confidenceSchema,
      notes: z.string().nullable(),
    })
  ),
});

const attendanceReviewValidationSchema = z.object({
  unidade: z.string().nullable(),
  mes: z.string().nullable(),
  ano: z.string().nullable(),
  documentType: documentTypeSchema,
  confidence: confidenceSchema,
  rows: z.array(
    z.object({
      lineIndex: z.number(),
      matchedLineIndex: z.number().nullable(),
      patientName: z.string(),
      appointmentDate: z.string().nullable(),
      appointmentTime: z.string().nullable(),
      realizou: z.enum(["S", "N"]).nullable(),
      dataAtendimento: z.string().nullable(),
      confidence: confidenceSchema,
      notes: z.string().nullable(),
    })
  ),
});

const GEMINI_MODEL = "googleai/gemini-2.0-flash";
const OPENAI_MODEL = "gpt-4o";

function hasGeminiApiKey() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function hasOpenAiApiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

async function analyzeAttendanceWithConfiguredProvider<T>(params: {
  fileData: string;
  fileName: string;
  mimeType: string;
  prompt: string;
  schema: z.ZodTypeAny;
  responseName: string;
}): Promise<T | null> {
  if (hasGeminiApiKey()) {
    const { output } = await ai.generate({
      model: GEMINI_MODEL,
      prompt: [
        { text: params.prompt },
        {
          media: {
            url: `data:${params.mimeType};base64,${params.fileData}`,
            contentType: params.mimeType,
          },
        },
      ],
      output: { schema: params.schema },
    });

    return output as T;
  }

  if (hasOpenAiApiKey()) {
    return openaiService.analyzeDocumentParsed<T>(
      params.fileData,
      params.fileName,
      params.mimeType,
      params.prompt,
      params.schema,
      params.responseName,
      OPENAI_MODEL
    );
  }

  throw new Error(
    "Nenhuma chave de IA foi configurada. Defina GEMINI_API_KEY, GOOGLE_API_KEY ou OPENAI_API_KEY."
  );
}

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

  try {
    return await analyzeAttendanceWithConfiguredProvider<AttendanceReviewAnalysisResult>({
      fileData: params.fileData,
      fileName: params.fileName,
      mimeType: params.mimeType,
      prompt,
      schema: attendanceReviewAnalysisSchema,
      responseName: "attendance_review_analysis",
    });
  } catch (error) {
    console.error("Erro na analise de documento:", error);
    throw error;
  }
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
    .map((row) =>
      [
        `lineIndex: ${row.lineIndex}`,
        `patientName: ${row.patientName}`,
        `appointmentDate: ${row.appointmentDate ?? ""}`,
        `appointmentTime: ${row.appointmentTime ?? ""}`,
        `unidade: ${row.unidade ?? ""}`,
        `convenio: ${row.convenio ?? ""}`,
      ].join(" | ")
    )
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

  try {
    return await analyzeAttendanceWithConfiguredProvider<AttendanceReviewAnalysisResult>({
      fileData: params.fileData,
      fileName: params.fileName,
      mimeType: params.mimeType,
      prompt,
      schema: attendanceReviewValidationSchema,
      responseName: "attendance_review_validation",
    });
  } catch (error) {
    console.error("Erro na validacao do documento:", error);
    throw error;
  }
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
    .map(
      (patient) =>
        `- ID: ${patient.lineIndex}, Nome: ${patient.patientName}, Convenio: ${patient.convenio ?? ""}`
    )
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

  try {
    return await analyzeAttendanceWithConfiguredProvider<AttendanceReviewAnalysisResult>({
      fileData: params.fileData,
      fileName: params.fileName,
      mimeType: params.mimeType,
      prompt,
      schema: attendanceReviewValidationSchema,
      responseName: "attendance_review_refinement",
    });
  } catch (error) {
    console.error("Erro no refinamento do documento:", error);
    throw error;
  }
}
