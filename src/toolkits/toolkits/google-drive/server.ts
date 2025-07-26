import { createServerToolkit } from "@/toolkits/create-toolkit";
import { baseGoogleDriveToolkitConfig } from "./base";
import {
  googleDriveSearchFilesToolConfigServer,
  googleDriveReadFileToolConfigServer,
} from "./tools/server";
import { GoogleDriveTools } from "./tools";
import { env } from "@/env";

export const googleDriveToolkitServer = createServerToolkit(
  baseGoogleDriveToolkitConfig,
  `You have access to the Google Drive toolkit for intelligent file management and content analysis. This toolkit provides progressive summarization to manage context efficiently.

Available Tools:

Search Files Tool:
- Find files and folders using various search criteria
- Returns file metadata including names, sizes, types, and modification dates
- Use specific search terms and filters for better results

Read File Tool (Enhanced with Progressive Summarization):
- Extracts and summarizes content from documents, PDFs, and other supported file types
- Key Feature: Returns focused summaries instead of raw content to prevent context overflow
- Maintains cumulative findings across multiple file reads
- Provides recommendations on whether to continue reading more files

Recommended Workflow:

1. Strategic File Discovery
  1. Use Search Files to find relevant documents
  2. Review returned file list (names, sizes, types, dates)
  3. Select 8-10 most promising files based on:
    - Relevance to your query (file names)
    - File sizes (prefer smaller files for efficiency)
    - Recent modification dates
    - File types (documents, PDFs, others)
  4. Do not select or read more than 10 files for information gathering. Select only the most promising candidates based on user
  query.

2. Progressive Content Analysis
  1. Read files in strategic order (most relevant first, smaller files first)
  2. For each file, provide:
    - searchContext: Original user query/intent
    - cumulativeFindings: Summary from previous files (if any)
  3. Review the returned summary and cumulative findings
  4. Check shouldContinueReading recommendation
  5. Stop when sufficient information gathered or recommendation suggests stopping

3. Context Management
- The Read File tool automatically handles context overflow by summarizing content
- Each file returns a focused summary plus updated cumulative findings
- Use the cumulative summary as your primary information source for responses
- Individual file summaries provide specific details when needed

Best Practices:

File Search:
- Select upto a max of 10 files.
- Prioritize files with descriptive names matching your search intent
- Start with smaller files to maximize coverage within context limits
- Consider file types: Google Docs/Sheets, PDFs, other formats

Reading Files:
- Always pass the original user query as searchContext
- Include cumulativeFindings from previous reads
- Pay attention to shouldContinueReading recommendations
- Stop reading when cumulative findings adequately address the user's query`,
  async () => {
    const keyFile = env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH!;
    const folderId = env.GOOGLE_DRIVE_FOLDER_ID!;

    if (!keyFile) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set");
    }

    if (!folderId) {
      throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set");
    }

    return {
      [GoogleDriveTools.SearchFiles]: googleDriveSearchFilesToolConfigServer(
        keyFile,
        folderId,
      ),
      [GoogleDriveTools.ReadFile]: googleDriveReadFileToolConfigServer(keyFile),
    };
  },
);
