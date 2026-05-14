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
      if (mimeType.startsWith("image/")) {
        return this.analyzeImage(base64File, prompt, model);
      }

      const binary = Buffer.from(base64File, "base64");
      const uploadFile = await toFile(binary, filename);
      const fileInfo = await openai.files.create({
        file: uploadFile,
        purpose: "user_data",
      });

      const response = await openai.responses.create({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_file", file_id: fileInfo.id },
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

      if (mimeType.startsWith("image/")) {
        const response = await openai.responses.create({
          model,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: prompt },
                {
                  type: "input_image",
                  image_url: `data:${mimeType};base64,${base64File}`,
                  detail: "high",
                },
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

      const binary = Buffer.from(base64File, "base64");
      const uploadFile = await toFile(binary, filename);
      const fileInfo = await openai.files.create({
        file: uploadFile,
        purpose: "user_data",
      });

      const response = await openai.responses.create({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_file", file_id: fileInfo.id },
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
