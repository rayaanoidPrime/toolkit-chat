import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";
import { Card } from "@/components/ui/card";
import { HStack } from "@/components/ui/stack";
import { allClientToolkits } from "@/toolkits/toolkits/client";
import type { Toolkits } from "@/toolkits/toolkits/shared";
import { Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";

import type { Message } from "./types";
import { Markdown } from "@/components/ui/markdown";
import { useEffect, useMemo, useState } from "react";

export const MessageItem: React.FC<{
  item: Message;
  isCompleted: boolean;
  onDone?: () => void;
  scrollToBottom?: () => void;
  isUserScrolling?: boolean;
}> = ({ item, isCompleted, onDone, scrollToBottom, isUserScrolling }) => {
  switch (item.type) {
    case "user":
      return <UserMessage content={item.content} />;
    case "assistant":
      return (
        <AssistantMessage
          content={item.content}
          onDone={onDone}
          scrollToBottom={scrollToBottom}
          isUserScrolling={isUserScrolling}
        />
      );
    case "tool":
      return (
        <ToolMessage
          callComponent={item.callComponent}
          resultComponent={item.resultComponent}
          toolkit={item.toolkit}
          isCompleted={isCompleted}
        />
      );
    default:
      return null;
  }
};

export const UserMessage: React.FC<{ content: string }> = ({ content }) => (
  <div className="flex w-full justify-end">
    <div className="user-message max-w-xs rounded-xl px-3 py-2 text-sm text-white">
      {content}
    </div>
  </div>
);

export const AssistantMessage: React.FC<{
  content: string;
  onDone?: () => void;
  scrollToBottom?: () => void;
  isUserScrolling?: boolean;
}> = ({ content, onDone, scrollToBottom, isUserScrolling }) => {
  const words = useMemo(() => {
    return content.split(" ");
  }, [content]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (isComplete) {
      onDone?.();
    }
  }, [isComplete, onDone]);

  useEffect(() => {
    const streamInterval = setInterval(() => {
      if (currentIndex < words.length) {
        setCurrentIndex((prev) => prev + 1);
        if (!isUserScrolling) {
          scrollToBottom?.();
        }
      } else {
        clearInterval(streamInterval);
        setIsComplete(true);
      }
    }, 50);

    return () => clearInterval(streamInterval);
  }, [words, onDone, scrollToBottom, currentIndex, isUserScrolling]);

  const contentToShow = useMemo(() => {
    return words.slice(0, currentIndex).join(" ");
  }, [words, currentIndex]);

  return (
    <div className="flex w-full flex-col gap-1">
      <Markdown>{contentToShow}</Markdown>
    </div>
  );
};

export const ToolMessage: React.FC<{
  callComponent: React.ReactNode;
  resultComponent: React.ReactNode;
  toolkit: Toolkits;
  isCompleted: boolean;
}> = ({ callComponent, resultComponent, toolkit, isCompleted }) => {
  const clientToolkit = allClientToolkits[toolkit];
  const IconComponent = clientToolkit.icon;

  return (
    <div className="flex w-full gap-3">
      <Card className="flex-1 gap-0 overflow-hidden p-0">
        <HStack className="bg-muted/50 border-b p-2">
          <IconComponent className="size-4" />
          {!isCompleted ? (
            <AnimatedShinyText className="text-sm font-medium">
              {clientToolkit.name} Toolkit
            </AnimatedShinyText>
          ) : (
            <span className="text-sm font-medium">
              {clientToolkit.name} Toolkit
            </span>
          )}
          {!isCompleted ? (
            <Loader2 className="size-4 animate-spin opacity-60" />
          ) : (
            <Check className="size-4" />
          )}
        </HStack>
        <div className="p-2">
          <motion.div
            key={isCompleted ? "completed" : "loading"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-sm"
          >
            {isCompleted ? resultComponent : callComponent}
          </motion.div>
        </div>
      </Card>
    </div>
  );
};
