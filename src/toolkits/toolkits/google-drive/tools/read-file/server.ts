import { type readFileTool } from "./base";
import { google, type drive_v3 } from "googleapis";
import type { ServerToolConfig } from "@/toolkits/types";
import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import os from "os";
import { generateText } from "@/ai/generate";

// Helper function to summarize content using LLM
async function summarizeContent(
  content: string,
  fileName: string,
  searchContext: string,
  cumulativeFindings?: string,
): Promise<{
  summary: string;
  cumulativeSummary: string;
  shouldContinueReading: boolean;
}> {
  const prompt = `SEARCH CONTEXT: "${searchContext}"
FILE NAME: ${fileName}
CUMULATIVE FINDINGS SO FAR: ${cumulativeFindings ?? "None yet"}

FILE CONTENT:
${content}

Please provide:
1. A comprehensive summary of this file focusing on information relevant to the search context
2. An updated cumulative summary that combines this file's insights with previous findings
3. A recommendation on whether to continue reading more files
`;

  try {
    const response = await generateText("google/gemini-2.5-flash-lite", {
      system: `You are helping summarize file content for a user search query.

Guidelines:
- Focus on information directly relevant to the search context
- Be concise but comprehensive
- Treat "CUMULATIVE FINDINGS SO FAR" as a running summary of relevant insights from previously analyzed files
- Use it to avoid repeating information already captured
- Update it with new insights from the current file
- Highlight unique insights not already covered in cumulative findings
- Recommend continuing if significant gaps remain or if this file suggests other relevant files exist
- Recommend stopping if the search context appears well-covered

Respond with ONLY a JSON object (no markdown formatting or code blocks):
{
  "summary": "comprehensive summary of this file's relevant content",
  "cumulativeSummary": "updated summary combining all files read so far", 
  "shouldContinueReading": true/false,
}
`,
      prompt: prompt,
    });

    const responseContent = response.text ?? "{}";

    // Clean the response by removing markdown code blocks if present
    let cleanedResponse = responseContent
      .replace(/^```json\s*/i, "") // Remove opening ```json
      .replace(/\s*```\s*$/i, "") // Remove closing ```
      .trim();

    // Additional fallback: try to extract JSON from anywhere in the response
    if (!cleanedResponse.startsWith("{")) {
      const jsonMatch = /\{[\s\S]*\}/.exec(responseContent);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }
    }

    const result = JSON.parse(cleanedResponse) as {
      summary?: string;
      cumulativeSummary?: string;
      shouldContinueReading?: boolean;
    };

    return {
      summary: result.summary ?? "Unable to generate summary",
      cumulativeSummary:
        result.cumulativeSummary ??
        result.summary ??
        "Unable to generate cumulative summary",
      shouldContinueReading: result.shouldContinueReading ?? true,
    };
  } catch (error) {
    console.error("Error in summarization:", error);

    // Fallback: return truncated content as summary
    const truncatedContent =
      content.length > 2000 ? content.substring(0, 2000) + "..." : content;

    return {
      summary: `[Summarization failed] Content preview: ${truncatedContent}`,
      cumulativeSummary: cumulativeFindings
        ? `${cumulativeFindings}\n\nFrom ${fileName}: ${truncatedContent}`
        : `From ${fileName}: ${truncatedContent}`,
      shouldContinueReading: true,
    };
  }
}

// Helper function similar to Python's export_gdrive_file
async function exportGdriveFile(
  drive: drive_v3.Drive,
  fileName: string,
  mimeType: string,
  fileId: string,
  exportFormat?: string,
) {
  const supportedExportDocsMimeTypes = {
    "application/vnd.google-apps.document":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.google-apps.spreadsheet":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.google-apps.presentation":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    // Spreadsheet MIME types
    "application/vnd.ms-excel":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv": "text/csv",
    // Presentation MIME types
    "application/vnd.ms-powerpoint":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };

  if (mimeType in supportedExportDocsMimeTypes) {
    const exportMimeType =
      exportFormat ??
      supportedExportDocsMimeTypes[
        mimeType as keyof typeof supportedExportDocsMimeTypes
      ];

    try {
      const response = await drive.files.export({
        fileId: fileId,
        mimeType: exportMimeType,
      });

      console.log(`Exported file ${fileName} to ${exportMimeType}`);
      return {
        mimeType: exportMimeType,
        content: response.data,
        isText:
          exportMimeType.startsWith("text/") ||
          exportMimeType.includes("plain"),
      };
    } catch (error) {
      throw new Error(
        `Error exporting file ${fileName}: ${(error as Error).message}`,
      );
    }
  } else {
    try {
      // For binary files, explicitly set responseType to 'arraybuffer'
      const response = await drive.files.get(
        {
          fileId: fileId,
          alt: "media",
        },
        {
          responseType: "arraybuffer",
        },
      );

      console.log(`Downloaded file ${fileName}`);
      return {
        mimeType: mimeType,
        content: response.data,
        isText: mimeType.startsWith("text/") || mimeType === "application/json",
      };
    } catch (error) {
      throw new Error(
        `Error downloading file ${fileName}: ${(error as Error).message}`,
      );
    }
  }
}

export const googleDriveReadFileToolConfigServer = (
  keyFile: string,
): ServerToolConfig<
  typeof readFileTool.inputSchema.shape,
  typeof readFileTool.outputSchema.shape
> => {
  return {
    callback: async ({
      fileId,
      exportFormat,
      searchContext,
      cumulativeFindings,
    }) => {
      const auth = new google.auth.GoogleAuth({
        keyFile: keyFile,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });

      const drive = google.drive({ version: "v3", auth });

      try {
        // First get file metadata
        const fileMetadata = await drive.files.get({
          fileId: fileId,
          fields: "name, mimeType, size, parents",
        });

        const fileName = fileMetadata.data.name!;
        const mimeType = fileMetadata.data.mimeType!;

        console.log(
          `Reading file: ${fileName} (${mimeType}) for context: ${searchContext}`,
        );

        // Use the helper function to handle file export/download
        const {
          mimeType: resultMimeType,
          content: rawContent,
          isText,
        } = await exportGdriveFile(
          drive,
          fileName,
          mimeType,
          fileId,
          exportFormat,
        );

        let encoding = "utf-8";
        let processedContent: string;

        // Handle content based on whether it's text or binary
        if (isText) {
          // For text files, convert to string
          processedContent = await handleResponseData(rawContent);
        } else {
          // For binary files, convert to buffer
          const buffer = await convertToBuffer(rawContent);
          processedContent = buffer.toString("base64");
          encoding = "base64";

          // Add descriptive headers for common binary types
          if (mimeType === "application/pdf") {
            try {
              // Parse PDF to extract text
              const pdfData = await pdfParse(buffer);
              processedContent = pdfData.text;
              encoding = "utf-8";
              console.log(`Successfully extracted text from PDF: ${fileName}`);
            } catch (pdfError) {
              console.error(`Error parsing PDF ${fileName}:`, pdfError);
              processedContent = `[PDF FILE - ${fileName}]\n\nError extracting text from PDF: ${(pdfError as Error).message}\n\nBase64 content: ${processedContent.substring(0, 200)}...`;
            }
          } else if (
            mimeType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ) {
            try {
              // Parse DOCX to extract text
              console.log(
                `Attempting to parse DOCX: ${fileName}, buffer size: ${buffer.length}`,
              );

              // Verify buffer contains valid ZIP data (DOCX is a ZIP file)
              if (buffer.length < 4) {
                throw new Error("Buffer too small to be a valid DOCX file");
              }

              // Check for ZIP signature (PK header)
              const zipSignature = buffer.slice(0, 4);
              if (zipSignature[0] !== 0x50 || zipSignature[1] !== 0x4b) {
                console.log(
                  "Buffer does not start with ZIP signature, attempting to parse anyway...",
                );
                // Log first 50 bytes for debugging
                console.log("First 50 bytes:", buffer.slice(0, 50));
              }

              const docxResult = await mammoth.extractRawText({ buffer });
              processedContent = docxResult.value;
              encoding = "utf-8";
              console.log(`Successfully extracted text from DOCX: ${fileName}`);

              // Log any warnings from mammoth
              if (docxResult.messages.length > 0) {
                console.warn(
                  `DOCX parsing warnings for ${fileName}:`,
                  docxResult.messages,
                );
              }
            } catch (docxError) {
              console.error(`Error parsing DOCX ${fileName}:`, docxError);

              // Try alternative approach - save to temp file and read
              try {
                console.log("Attempting alternative DOCX parsing method...");
                const tempFilePath = path.join(
                  os.tmpdir(),
                  `temp_${Date.now()}.docx`,
                );
                fs.writeFileSync(tempFilePath, buffer);

                const docxResult = await mammoth.extractRawText({
                  path: tempFilePath,
                });
                processedContent = docxResult.value;
                encoding = "utf-8";

                // Clean up temp file
                fs.unlinkSync(tempFilePath);

                console.log(
                  `Successfully extracted text from DOCX using temp file method: ${fileName}`,
                );
              } catch (altError) {
                console.error(
                  `Alternative DOCX parsing also failed:`,
                  altError,
                );
                processedContent = `[DOCX FILE - ${fileName}]\n\nError extracting text from DOCX: ${(docxError as Error).message}\n\nAlternative method error: ${(altError as Error).message}\n\nFile size: ${buffer.length} bytes\nBase64 content: ${processedContent.substring(0, 200)}...`;
              }
            }
          } else if (
            mimeType ===
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            mimeType === "application/vnd.ms-excel" ||
            mimeType === "application/vnd.google-apps.spreadsheet"
          ) {
            try {
              // Parse Excel file to extract data
              console.log(
                `Attempting to parse Excel file: ${fileName}, buffer size: ${buffer.length}`,
              );

              // Read the workbook from buffer
              const workbook = XLSX.read(buffer, { type: "buffer" });

              // Get all sheet names
              const sheetNames = workbook.SheetNames;
              console.log(
                `Found ${sheetNames.length} sheets in Excel file: ${sheetNames.join(", ")}`,
              );

              let excelContent = `[EXCEL FILE - ${fileName}]\n\n`;
              excelContent += `Total Sheets: ${sheetNames.length}\n`;
              excelContent += `Sheet Names: ${sheetNames.join(", ")}\n\n`;

              // Process each sheet
              sheetNames.forEach((sheetName, index) => {
                const worksheet = workbook.Sheets[sheetName];

                if (!worksheet) {
                  console.warn(`Worksheet ${sheetName} is undefined`);
                  return;
                }

                // Convert sheet to CSV format for readability
                const csvData = XLSX.utils.sheet_to_csv(worksheet);

                // Also get JSON format to understand structure
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {
                  header: 1,
                  defval: "",
                });

                excelContent += `=== SHEET ${index + 1}: ${sheetName} ===\n`;
                excelContent += `Rows: ${jsonData.length}\n`;

                if (jsonData.length > 0) {
                  // jsonData is (string | number | boolean | null)[][]
                  const firstRow = jsonData[0] as (
                    | string
                    | number
                    | boolean
                    | null
                  )[];
                  excelContent += `Columns: ${firstRow.length}\n`;

                  // Show first few rows in a readable format
                  if (csvData.trim()) {
                    const csvLines = csvData.split("\n");
                    const previewLines = csvLines.slice(
                      0,
                      Math.min(10, csvLines.length),
                    );
                    excelContent += `\nPreview (first ${previewLines.length} rows):\n`;
                    excelContent += previewLines.join("\n");

                    if (csvLines.length > 10) {
                      excelContent += `\n... (${csvLines.length - 10} more rows)`;
                    }
                  } else {
                    excelContent += "\n(Empty sheet)";
                  }
                } else {
                  excelContent += "\n(No data found)";
                }

                excelContent += "\n\n";
              });

              processedContent = excelContent;
              encoding = "utf-8";
              console.log(
                `Successfully extracted data from Excel file: ${fileName}`,
              );
            } catch (excelError) {
              console.error(
                `Error parsing Excel file ${fileName}:`,
                excelError,
              );
              processedContent = `[EXCEL FILE - ${fileName}]\n\nError extracting data from Excel file: ${(excelError as Error).message}\n\nFile size: ${buffer.length} bytes\nBase64 content: ${processedContent.substring(0, 200)}...`;
            }
          }
        }

        // Use the summarizeContent function to get the required fields
        const summaryResult = await summarizeContent(
          processedContent,
          fileName,
          searchContext,
          cumulativeFindings,
        );

        const contentSize = Buffer.byteLength(
          processedContent,
          encoding === "base64" ? "base64" : "utf-8",
        );

        console.log(
          `Successfully read file: ${fileName}, content size: ${contentSize} bytes, encoding: ${encoding}`,
        );

        return {
          summary: summaryResult.summary,
          cumulativeSummary: summaryResult.cumulativeSummary,
          shouldContinueReading: summaryResult.shouldContinueReading,
          mimeType: resultMimeType,
          fileName,
          size: contentSize,
          encoding,
        };
      } catch (error) {
        console.error("Error reading file:", error);
        throw new Error(`Error reading file: ${(error as Error).message}`);
      }
    },
  };
};

// Helper function to handle different response data types
async function handleResponseData(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  } else if (Buffer.isBuffer(data)) {
    return data.toString("utf-8");
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf-8");
  } else if (data instanceof Uint8Array) {
    return Buffer.from(data).toString("utf-8");
  } else if (data instanceof Readable) {
    // Handle stream data
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk, "utf-8"));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks).toString("utf-8");
  } else if (typeof Blob !== "undefined" && data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("utf-8");
  } else {
    return String(data);
  }
}

// Helper function to convert different data types to Buffer
async function convertToBuffer(data: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(data)) {
    return data;
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  } else if (data instanceof Uint8Array) {
    return Buffer.from(data);
  } else if (data instanceof Readable) {
    // Handle stream data
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk, "utf-8"));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks);
  } else if (typeof Blob !== "undefined" && data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else if (typeof data === "string") {
    return Buffer.from(data, "utf-8");
  } else {
    return Buffer.from(String(data), "utf-8");
  }
}
