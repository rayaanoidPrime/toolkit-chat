import React from "react";
import { type readFileTool } from "./base";
import type { ClientToolConfig } from "@/toolkits/types";
import { HStack, VStack } from "@/components/ui/stack";
import { ToolCallComponent } from "../../components/tool-call";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle, AlertCircle, ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const getMimeTypeLabel = (mimeType: string) => {
  const mimeTypeLabels: Record<string, string> = {
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.folder": "Folder",
    "application/pdf": "PDF",
    "text/plain": "Text",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/gif": "GIF",
    "video/mp4": "MP4",
    "audio/mp3": "MP3",
  };
  return (
    mimeTypeLabels[mimeType] ??
    mimeType?.split(".").pop()?.toUpperCase() ??
    "File"
  );
};

export const googleDriveReadFileToolConfigClient: ClientToolConfig<
  typeof readFileTool.inputSchema.shape,
  typeof readFileTool.outputSchema.shape
> = {
  CallComponent: ({ args }) => {
    return (
      <ToolCallComponent
        action="Reading & Summarizing File"
        primaryText={`File ID: ${args.fileId}`}
        secondaryText={
          args.searchContext ? `Context: ${args.searchContext}` : undefined
        }
        icon={FileText}
      />
    );
  },
  ResultComponent: ({ result }) => {
    const {
      summary,
      cumulativeSummary,
      shouldContinueReading,
      fileName,
      mimeType,
      size,
      encoding,
    } = result;

    return (
      <VStack className="w-full items-start gap-3">
        {/* File Header */}
        <HStack className="w-full items-center justify-between">
          <h3 className="text-sm font-medium">{fileName}</h3>
          <HStack className="gap-2">
            <Badge variant="secondary" className="text-xs">
              {getMimeTypeLabel(mimeType)}
            </Badge>
            {size && (
              <Badge variant="outline" className="text-xs">
                {size > 1024 * 1024
                  ? `${(size / (1024 * 1024)).toFixed(1)} MB`
                  : size > 1024
                    ? `${(size / 1024).toFixed(1)} KB`
                    : `${size} B`}
              </Badge>
            )}
            {encoding && (
              <Badge variant="outline" className="text-xs">
                {encoding}
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant={shouldContinueReading ? "primary" : "success"}
                  className="text-xs"
                >
                  {shouldContinueReading ? (
                    <>
                      <ArrowRight className="mr-1 size-3" />
                      Continue Reading
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-1 size-3" />
                      Sufficient Info
                    </>
                  )}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {shouldContinueReading
                  ? "Continuing to read more files for complete information"
                  : "Current information appears sufficient for the search context"}
              </TooltipContent>
            </Tooltip>
          </HStack>
        </HStack>

        {/* Summary Content */}
        <Accordion type="multiple" className="w-full">
          {/* File Summary */}
          <AccordionItem value="file-summary">
            <AccordionTrigger className="cursor-pointer py-2 hover:no-underline">
              <HStack className="items-center gap-2">
                <FileText className="text-muted-foreground size-4" />
                <span className="text-sm font-medium">File Summary</span>
              </HStack>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="bg-muted rounded-md p-3">
                <p className="text-sm whitespace-pre-wrap">{summary}</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Cumulative Summary */}
          <AccordionItem value="cumulative-summary">
            <AccordionTrigger className="cursor-pointer py-2 hover:no-underline">
              <HStack className="items-center gap-2">
                {shouldContinueReading ? (
                  <AlertCircle className="size-4 text-orange-500" />
                ) : (
                  <CheckCircle className="size-4 text-green-500" />
                )}
                <span className="text-sm font-medium">Cumulative Findings</span>
              </HStack>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
                <p className="text-sm whitespace-pre-wrap">
                  {cumulativeSummary}
                </p>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </VStack>
    );
  },
};
