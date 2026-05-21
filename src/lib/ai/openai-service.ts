import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";

const apiKey = process.env.OPENAI_API_KEY;

let openai: OpenAI | null = null;

if (apiKey) {
  openai = new OpenAI({ apiKey });
} else {
  console.warn(
    "AVISO: Chave da OpenAI nao encontrada em OPENAI_API_KEY. O servico de IA nao funcionara corretamente."
  );
}

export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string | any[];
}

type SupportedDocumentKind = "image" | "pdf" | "other";

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

function getFileExtension(filename: string) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

function resolveMimeType(filename: string, mimeType?: string) {
  const normalizedMimeType = (mimeType || "").trim().toLowerCase();
  if (normalizedMimeType) return normalizedMimeType;
  return MIME_TYPE_BY_EXTENSION[getFileExtension(filename)] ?? "application/octet-stream";
}

function resolveDocumentKind(filename: string, mimeType?: string): SupportedDocumentKind {
  const resolvedMimeType = resolveMimeType(filename, mimeType);
  if (resolvedMimeType.startsWith("image/")) return "image";
  if (resolvedMimeType === "application/pdf") return "pdf";
  return "other";
}

async function uploadDocumentFile(base64File: string, filename: string, mimeType?: string) {
  if (!openai) {
    throw new Error("OpenAI client not initialized.");
  }

  const binary = Buffer.from(base64File, "base64");
  const resolvedMimeType = resolveMimeType(filename, mimeType);
  const uploadFile = await toFile(binary, filename, { type: resolvedMimeType });

  return openai.files.create({
    file: uploadFile,
    purpose: "user_data",
  });
}

export const openaiService = {
  async analyzeConversation(
    messages: ChatMessage[],
    systemPrompt: string,
    model: string = "gpt-4o-mini"
  ): Promise<string | null> {
    if (!openai) {
      console.error("OpenAI client not initialized.");
      return null;
    }

    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...(messages as any)],
        temperature: 0.3,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Erro ao chamar OpenAI:", error);
      return null;
    }
  },

  async analyzeText(
    text: string,
    prompt: string,
    model: string = "gpt-4o-mini"
  ): Promise<string | null> {
    return this.analyzeConversation([{ role: "user", content: text }], prompt, model);
  },

  async analyzeImage(
    base64Image: string,
    prompt: string,
    model: string = "gpt-4o"
  ): Promise<string | null> {
    if (!openai) {
      console.error("OpenAI client not initialized.");
      return null;
    }

    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Erro ao chamar OpenAI Vision:", error);
      return null;
    }
  },

  async analyzeDocument(
    base64File: string,
    filename: string,
    mimeType: string,
    prompt: string,
    model: string = "gpt-4o"
  ): Promise<string | null> {
    if (!openai) {
      console.error("OpenAI client not initialized.");
      return null;
    }

    try {
      const documentKind = resolveDocumentKind(filename, mimeType);
      const resolvedMimeType = resolveMimeType(filename, mimeType);

      if (documentKind === "image") {
        const response = await openai.responses.create({
          model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_image",
                  image_url: `data:${resolvedMimeType};base64,${base64File}`,
                  detail: "high",
                },
                { type: "input_text", text: prompt },
              ],
            },
          ],
          store: false,
        });

        return response.output_text ?? null;
      }

      const fileInfo = await uploadDocumentFile(base64File, filename, resolvedMimeType);
      const response = await openai.responses.create({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: fileInfo.id },
              { type: "input_text", text: prompt },
            ],
          },
        ],
        store: false,
      });

      return response.output_text ?? null;
    } catch (error) {
      console.error("Erro ao chamar OpenAI Responses para arquivo:", error);
      return null;
    }
  },

  async analyzeDocumentParsed<T>(
    base64File: string,
    filename: string,
    mimeType: string,
    prompt: string,
    schema: any,
    responseName: string,
    model: string = "gpt-4o"
  ): Promise<T | null> {
    if (!openai) {
      console.error("OpenAI client not initialized.");
      return null;
    }

    try {
      const responseFormat = zodTextFormat(schema, responseName);
      const documentKind = resolveDocumentKind(filename, mimeType);
      const resolvedMimeType = resolveMimeType(filename, mimeType);

      if (documentKind === "image") {
        const response = await openai.responses.create({
          model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_image",
                  image_url: `data:${resolvedMimeType};base64,${base64File}`,
                  detail: "high",
                },
                { type: "input_text", text: prompt },
              ],
            },
          ],
          text: { format: responseFormat },
          store: false,
        });

        const content = response.output_text?.trim();
        if (!content) return null;
        return JSON.parse(content) as T;
      }

      const fileInfo = await uploadDocumentFile(base64File, filename, resolvedMimeType);
      const response = await openai.responses.create({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_file", file_id: fileInfo.id },
              { type: "input_text", text: prompt },
            ],
          },
        ],
        text: { format: responseFormat },
        store: false,
      });

      const content = response.output_text?.trim();
      if (!content) return null;
      return JSON.parse(content) as T;
    } catch (error) {
      console.error("Erro ao chamar OpenAI Responses parse para arquivo:", error);
      return null;
    }
  },
};
