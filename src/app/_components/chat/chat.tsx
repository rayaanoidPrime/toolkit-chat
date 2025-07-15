"use client";

import { motion, AnimatePresence } from "motion/react";
import { MultimodalInput } from "./input";
import { Messages } from "./messages";
import { StarterPrompts } from "./starter-prompts";

import { useScrollToBottom } from "@/app/_hooks/use-scroll-to-bottom";
import { useChatContext } from "@/app/_contexts/chat-context";

import { Logo } from "@/components/ui/logo";
import { useSearchParams } from "next/navigation";
import { WelcomeDialog } from "../welcome-dialog";
import { Anvil } from "lucide-react";

export const ChatContent = ({
  id,
  isReadonly,
  hasInitialMessages,
  chatbotName,
}: {
  id: string;
  isReadonly: boolean;
  hasInitialMessages: boolean;
  chatbotName?: string;
}) => {
  const searchParams = useSearchParams();
  const welcome = searchParams.get("welcome") === "true";

  const {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
  } = useScrollToBottom();

  const { messages, workbench } = useChatContext();
  const hasMessages = messages.length > 0;

  return (
    <>
      <div className="bg-background relative flex h-full min-w-0 flex-col">
        {/* Messages - always shown */}
        <Messages
          chatId={id}
          isReadonly={isReadonly}
          containerRef={containerRef}
          endRef={endRef}
          onViewportEnter={onViewportEnter}
          onViewportLeave={onViewportLeave}
          scrollToBottom={scrollToBottom}
        />

        {/* Input Container - absolutely positioned, contains greeting, input, and starter prompts */}
        <motion.div
          initial={hasInitialMessages ? { y: 0 } : { y: "calc(-50vh + 50%)" }}
          animate={
            hasMessages || hasInitialMessages
              ? { y: 0 }
              : { y: "calc(-50vh + 50%)" }
          }
          transition={{
            type: "tween",
            ease: "easeInOut",
            duration: 0.4,
          }}
          className="absolute bottom-4 left-1/2 h-fit w-full max-w-3xl -translate-x-1/2 px-4"
        >
          {/* Greeting - only shown when no messages */}
          <AnimatePresence>
            {!hasMessages && !hasInitialMessages && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{ opacity: 0 }}
                transition={{
                  enter: { delay: 0.1, duration: 0.3 },
                  exit: { delay: 0, duration: 0.05 },
                }}
                className="mb-4 flex flex-col items-center gap-2 pt-2 text-center md:mb-8 md:gap-4"
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="flex items-center justify-center"
                >
                  {workbench ? (
                    <Anvil className="text-primary size-24" />
                  ) : (
                    <Logo className="size-12 md:size-24" />
                  )}
                </motion.div>
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="text-xl font-bold md:text-3xl"
                >
                  {workbench
                    ? `${workbench.name} Workbench`
                    : (chatbotName ?? "Welcome to Toolkit.dev")}
                </motion.h1>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              isAtBottom={isAtBottom}
              scrollToBottom={scrollToBottom}
            />
          )}

          {/* Starter Prompts - only shown when no messages */}
          <AnimatePresence>
            {!hasMessages && !hasInitialMessages && (
              <motion.div
                initial={{ opacity: 0, height: "auto" }}
                animate={{
                  opacity: 1,
                  y: 0,
                  height: "auto",
                }}
                exit={{ opacity: 0, height: 0 }}
                transition={{
                  enter: { delay: 0.4, duration: 0.3 },
                  exit: { delay: 0, duration: 0.1 },
                }}
                className="mt-2 overflow-hidden md:mt-4"
              >
                {!hasMessages && <StarterPrompts />}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      {welcome && <WelcomeDialog />}
    </>
  );
};
