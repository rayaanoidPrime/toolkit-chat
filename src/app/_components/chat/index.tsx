import { db } from "@/server/db";
import { ChatProvider } from "@/app/_contexts/chat-context";
import type { Message, Workbench } from "@prisma/client";
import { ChatLayout } from "./layout";
import type { Attachment, UIMessage } from "ai";
import { languageModels } from "@/ai/models";
import { ChatContent } from "./chat";
import { serverCookieUtils } from "@/lib/cookies/server";
import { clientToolkits } from "@/toolkits/toolkits/client";
import type { ClientToolkit } from "@/toolkits/types";
import type { z } from "zod";
import type { PersistedToolkit } from "@/lib/cookies/types";

interface Props {
  id: string;
  initialVisibilityType: "public" | "private";
  isReadonly: boolean;
  isNew: boolean;
  workbench?: Workbench;
  chatbotName?: string;
}

export const Chat = async ({
  id,
  initialVisibilityType,
  isReadonly,
  isNew,
  workbench,
  chatbotName,
}: Props) => {
  const initialMessages = isNew
    ? []
    : await db.message.findMany({
        where: {
          chatId: id,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

  // Fetch user preferences from server-side cookies
  const serverPreferences = await serverCookieUtils.getPreferences();

  // Convert server preferences to the format expected by ChatProvider
  const initialPreferences = {
    selectedChatModel: serverPreferences.selectedChatModel,
    imageGenerationModel: serverPreferences.imageGenerationModel,
    useNativeSearch: serverPreferences.useNativeSearch,
    toolkits: serverPreferences.toolkits
      ?.map((persistedToolkit: PersistedToolkit) => {
        const clientToolkit =
          clientToolkits[persistedToolkit.id as keyof typeof clientToolkits];
        if (clientToolkit) {
          return {
            id: persistedToolkit.id,
            parameters: persistedToolkit.parameters,
          };
        }
        return null;
      })
      .filter(
        (
          toolkit,
        ): toolkit is {
          id: string;
          toolkit: ClientToolkit;
          parameters: z.infer<ClientToolkit["parameters"]>;
        } => toolkit !== null,
      ),
  };

  const convertToUIMessages = (messages: Array<Message>): Array<UIMessage> => {
    return messages.map((message) => ({
      id: message.id,
      parts: message.parts as UIMessage["parts"],
      role: message.role as UIMessage["role"],
      // Note: content will soon be deprecated in @ai-sdk/react
      content: "",
      createdAt: message.createdAt,
      experimental_attachments:
        (message.attachments as unknown as Array<Attachment>) ?? [],
      annotations: message.modelId
        ? [
            {
              type: "model",
              model: (() => {
                const model = languageModels.find(
                  (model) => model.modelId === message.modelId.split(":")[1],
                );

                if (!model) {
                  return null;
                }

                return {
                  name: model.name,
                  provider: model.provider,
                  modelId: model.modelId,
                };
              })(),
            },
          ]
        : undefined,
    }));
  };

  return (
    <ChatLayout>
      <ChatProvider
        id={id}
        initialMessages={convertToUIMessages(initialMessages)}
        initialVisibilityType={initialVisibilityType}
        autoResume={!isNew}
        workbench={workbench}
        initialPreferences={initialPreferences}
      >
        <ChatContent
          id={id}
          isReadonly={isReadonly}
          hasInitialMessages={initialMessages.length > 0}
          chatbotName={chatbotName}
        />
      </ChatProvider>
    </ChatLayout>
  );
};
