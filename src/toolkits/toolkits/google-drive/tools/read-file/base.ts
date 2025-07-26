import { z } from "zod";
import { createBaseTool } from "@/toolkits/create-tool";

export const readFileTool = createBaseTool({
  description: "Read the contents of a file from Google Drive",
  inputSchema: z.object({
    fileId: z.string().describe("ID of the file to read"),
    exportFormat: z
      .string()
      .describe(
        "Export format for Google Workspace files (e.g., 'text/plain', 'text/csv', 'text/markdown') (leave blank for auto-detection)",
      ),
    searchContext: z
      .string()
      .describe("Original search query/intent for focused summarization"),
    cumulativeFindings: z
      .string()
      .optional()
      .describe("Summary of previous files read"),
  }),
  outputSchema: z.object({
    summary: z
      .string()
      .describe(
        "Comprehensive summary containing all key insights and relevant information from this file",
      ),
    cumulativeSummary: z
      .string()
      .describe(
        "Updated cumulative summary incorporating findings from all files read so far",
      ),
    shouldContinueReading: z
      .boolean()
      .describe(
        "Recommendation to continue reading more files based on information completeness",
      ),
    mimeType: z.string().describe("MIME type of the content"),
    fileName: z.string().describe("Name of the file"),
    size: z.number().optional().describe("Size of the content in bytes"),
    encoding: z.string().optional().describe("Content encoding used"),
  }),
});
