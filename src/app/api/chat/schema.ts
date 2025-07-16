import { z } from "zod";

import { languageModels } from "@/ai/models";
import { MESSAGE_MAX_LENGTH, FILE_NAME_MAX_LENGTH } from "@/lib/constants";

import { Toolkits } from "@/toolkits/toolkits/shared";
import { allClientToolkits } from "@/toolkits/toolkits/client";

const textPartSchema = z.object({
  text: z.string().min(1).max(MESSAGE_MAX_LENGTH),
  type: z.enum(["text"]),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    createdAt: z.coerce.date(),
    role: z.enum(["user"]),
    content: z.string().min(1).max(MESSAGE_MAX_LENGTH),
    parts: z.array(textPartSchema),
    experimental_attachments: z
      .array(
        z.object({
          url: z.string().url(),
          name: z.string().min(1).max(FILE_NAME_MAX_LENGTH),
          contentType: z.enum([
            "image/png",
            "image/jpg",
            "image/jpeg",
            "application/pdf",
          ]),
        }),
      )
      .optional(),
  }),
  selectedChatModel: z.enum(
    languageModels.map((model) => `${model.provider}/${model.modelId}`) as [
      `${string}/${string}`,
      ...`${string}/${string}`[],
    ],
  ),
  selectedVisibilityType: z.enum(["public", "private"]),
  useNativeSearch: z.boolean(),
  systemPrompt: z.string().optional(),
  workbenchId: z.string().uuid().optional(),
  toolkits: z.array(
    z
      .object({
        id: z.nativeEnum(Toolkits),
        parameters: z.record(z.string(), z.any()),
      })
      .refine((toolkit) => {
        return toolkit.id in allClientToolkits;
      })
      .refine((toolkit) => {
        return allClientToolkits[toolkit.id].parameters?.parse(
          toolkit.parameters,
        );
      }),
  ),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
