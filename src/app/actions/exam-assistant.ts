"use server";

import { openaiService } from "@/lib/ai/openai-service";
import { formatProcedureName } from "@/lib/exam-internal-search";

export interface ExamAiMatchResult {
  canonicalName: string | null;
  matchedProcedureRaw: string | null;
  matchedProcedureLabel: string | null;
  confidence: "alta" | "media" | "baixa";
  reason: string;
}

export interface ExamExplanationResult {
  title: string;
  summary: string;
  servesFor: string;
  evaluates: string;
  howItsDone: string;
  requiresDilation: string;
  hasVenousContrast: string;
  patientCopy: string;
}

function parseJsonResponse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    const cleaned = value.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch (error) {
    console.error("Erro ao fazer parse da resposta da IA para exames:", error);
    return null;
  }
}

export async function resolveExamCorrespondenceAction(params: {
  query: string;
  procedures: string[];
}): Promise<ExamAiMatchResult | null> {
  const query = params.query.trim();
  if (!query || params.procedures.length === 0) return null;

  const optionsText = params.procedures
    .map((procedure, index) => {
      const label = formatProcedureName(procedure);
      return `${index + 1}. raw: ${procedure} | label: ${label}`;
    })
    .join("\n");

  const prompt = `
Voce e um assistente especialista em nomenclatura de exames oftalmologicos.

OBJETIVO:
- Receber um termo pesquisado pela secretaria.
- Escolher no maximo 1 procedimento da lista interna do sistema que mais corresponda ao termo.

REGRAS:
- Use apenas procedimentos que estao na lista abaixo.
- Considere sinonimos, grafias alternativas e nomes populares.
- Se nao houver correspondencia suficientemente segura, retorne matchedProcedureRaw como null.
- Nao invente nomes fora da lista.
- Responda apenas JSON valido.

FORMATO OBRIGATORIO:
{
  "canonicalName": "nome padrao do exame ou null",
  "matchedProcedureRaw": "valor raw exato da lista ou null",
  "matchedProcedureLabel": "label amigavel do item escolhido ou null",
  "confidence": "alta" | "media" | "baixa",
  "reason": "explicacao curta"
}

LISTA DE PROCEDIMENTOS DISPONIVEIS:
${optionsText}
`;

  const result = await openaiService.analyzeText(query, prompt, "gpt-4o-mini");
  const parsed = parseJsonResponse<ExamAiMatchResult>(result);
  if (!parsed) return null;

  if (
    parsed.matchedProcedureRaw &&
    !params.procedures.includes(parsed.matchedProcedureRaw)
  ) {
    return {
      canonicalName: parsed.canonicalName ?? null,
      matchedProcedureRaw: null,
      matchedProcedureLabel: null,
      confidence: "baixa",
      reason: "A IA retornou um item fora da lista interna do sistema.",
    };
  }

  return parsed;
}

export async function explainExamAction(params: {
  examName: string;
}): Promise<ExamExplanationResult | null> {
  const examName = params.examName.trim();
  if (!examName) return null;

  const prompt = `
Voce e um assistente de apoio para secretaria de clinica oftalmologica.

Explique o exame abaixo em portugues do Brasil, de forma curta, correta e facil de repassar para paciente.

REGRAS:
- Nao faca diagnostico.
- Nao prometa resultado clinico.
- Seja objetivo.
- Pense em uso pratico por secretaria no WhatsApp.
- Responda apenas JSON valido.

FORMATO OBRIGATORIO:
{
  "title": "nome amigavel do exame",
  "summary": "resumo curto do que e o exame",
  "servesFor": "para que serve",
  "evaluates": "o que avalia",
  "howItsDone": "como o exame e feito",
  "requiresDilation": "sim, nao, depende ou explicacao curta",
  "hasVenousContrast": "sim, nao, depende ou explicacao curta",
  "patientCopy": "texto curto pronto para copiar para o paciente"
}
`;

  const result = await openaiService.analyzeText(examName, prompt, "gpt-4o-mini");
  return parseJsonResponse<ExamExplanationResult>(result);
}
