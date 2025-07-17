// Enhanced search-files/base.ts with better search capabilities
import { z } from "zod";
import { createBaseTool } from "@/toolkits/create-tool";

export const searchFilesTool = createBaseTool({
  description: "Search for files in Google Drive using query terms with recursive folder traversal",
  inputSchema: z.object({
    query: z.string().describe("Search query to find files (searches both filename and content)"),
    pageToken: z
      .string()
      .optional()
      .describe("Token for the next page of results (leave blank for first page)"),
    pageSize: z
      .number()
      .optional()
      .default(10)
      .describe("Number of results per page (max 100, default: 10)"),
    mimeType: z
      .string()
      .optional()
      .describe("Filter by MIME type (e.g., 'application/pdf', 'image/jpeg', 'application/vnd.google-apps.document') (leave blank for all types)"),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether to search recursively in subfolders (default: true)"),
    nameOnly: z
      .boolean()
      .optional()
      .default(false)
      .describe("Search only in file names, not content (faster and more reliable)"),
    modifiedSince: z
      .string()
      .optional()
      .describe("Only return files modified after this date (ISO format: YYYY-MM-DD)"),
    fileTypes: z
      .array(z.enum(["document", "spreadsheet", "presentation", "pdf", "image", "video", "audio", "folder", "other"]))
      .optional()
      .describe("Filter by file types (more user-friendly than mimeType)"),
  }),
  outputSchema: z.object({
    files: z.array(
      z.object({
        id: z.string().describe("File ID"),
        name: z.string().describe("File name"),
        mimeType: z.string().describe("File MIME type"),
        size: z.string().optional().describe("File size in bytes"),
        modifiedTime: z.string().optional().describe("Last modification time"),
        createdTime: z.string().optional().describe("File creation time"),
        webViewLink: z.string().optional().describe("Link to view the file"),
        iconLink: z.string().optional().describe("Link to file icon"),
        owners: z
          .array(
            z.object({
              displayName: z.string().optional(),
              emailAddress: z.string().optional(),
            }),
          )
          .optional()
          .describe("File owners"),
        parents: z.array(z.string()).optional().describe("Parent folder IDs"),
        path: z.string().optional().describe("Full path to the file"),
      }),
    ),
    nextPageToken: z
      .string()
      .optional()
      .describe("Token for the next page of results"),
    incompleteSearch: z
      .boolean()
      .optional()
      .describe("Whether the search was incomplete due to limitations"),
    searchStats: z
      .object({
        totalFound: z.number().describe("Total number of files found"),
        foldersSearched: z.number().describe("Number of folders searched"),
        searchDuration: z.number().describe("Search duration in milliseconds"),
      })
      .optional()
      .describe("Statistics about the search operation"),
  }),
});