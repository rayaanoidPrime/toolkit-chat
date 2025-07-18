import { type readFileTool } from "./base";
import { google, drive_v3 } from "googleapis";
import type { ServerToolConfig } from "@/toolkits/types";
import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import { Readable } from "stream";

// Helper function similar to Python's export_gdrive_file
async function exportGdriveFile(drive: drive_v3.Drive, fileName: string, mimeType: string, fileId: string, exportFormat?: string) {
  const supportedExportDocsMimeTypes = {
    "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };

  if (mimeType in supportedExportDocsMimeTypes) {
    const exportMimeType = exportFormat || supportedExportDocsMimeTypes[mimeType as keyof typeof supportedExportDocsMimeTypes];
    
    try {
      const response = await drive.files.export({
        fileId: fileId,
        mimeType: exportMimeType,
      });

      console.log(`Exported file ${fileName} to ${exportMimeType}`);
      return {
        mimeType: exportMimeType,
        content: response.data,
        isText: exportMimeType.startsWith('text/') || exportMimeType.includes('plain')
      };
    } catch (error) {
      throw new Error(`Error exporting file ${fileName}: ${(error as Error).message}`);
    }
  } else {
    try {
      // For binary files, explicitly set responseType to 'arraybuffer'
      const response = await drive.files.get({
        fileId: fileId,
        alt: "media",
      }, {
        responseType: 'arraybuffer'
      });

      console.log(`Downloaded file ${fileName}`);
      return {
        mimeType: mimeType,
        content: response.data,
        isText: mimeType.startsWith('text/') || mimeType === 'application/json'
      };
    } catch (error) {
      throw new Error(`Error downloading file ${fileName}: ${(error as Error).message}`);
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
    callback: async ({ fileId, exportFormat }) => {
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

        console.log(`Reading file: ${fileName} (${mimeType})`);

        // Use the helper function to handle file export/download
        const { mimeType: resultMimeType, content: rawContent, isText } = await exportGdriveFile(
          drive,
          fileName,
          mimeType,
          fileId,
          exportFormat
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
          } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            try {
              // Parse DOCX to extract text
              console.log(`Attempting to parse DOCX: ${fileName}, buffer size: ${buffer.length}`);
              
              // Verify buffer contains valid ZIP data (DOCX is a ZIP file)
              if (buffer.length < 4) {
                throw new Error("Buffer too small to be a valid DOCX file");
              }
              
              // Check for ZIP signature (PK header)
              const zipSignature = buffer.slice(0, 4);
              if (zipSignature[0] !== 0x50 || zipSignature[1] !== 0x4B) {
                console.log("Buffer does not start with ZIP signature, attempting to parse anyway...");
                // Log first 50 bytes for debugging
                console.log("First 50 bytes:", buffer.slice(0, 50));
              }
              
              const docxResult = await mammoth.extractRawText({ buffer });
              processedContent = docxResult.value;
              encoding = "utf-8";
              console.log(`Successfully extracted text from DOCX: ${fileName}`);
              
              // Log any warnings from mammoth
              if (docxResult.messages.length > 0) {
                console.warn(`DOCX parsing warnings for ${fileName}:`, docxResult.messages);
              }
            } catch (docxError) {
              console.error(`Error parsing DOCX ${fileName}:`, docxError);
              
              // Try alternative approach - save to temp file and read
              try {
                console.log("Attempting alternative DOCX parsing method...");
                const fs = require('fs');
                const path = require('path');
                const os = require('os');
                
                const tempFilePath = path.join(os.tmpdir(), `temp_${Date.now()}.docx`);
                fs.writeFileSync(tempFilePath, buffer);
                
                const docxResult = await mammoth.extractRawText({ path: tempFilePath });
                processedContent = docxResult.value;
                encoding = "utf-8";
                
                // Clean up temp file
                fs.unlinkSync(tempFilePath);
                
                console.log(`Successfully extracted text from DOCX using temp file method: ${fileName}`);
              } catch (altError) {
                console.error(`Alternative DOCX parsing also failed:`, altError);
                processedContent = `[DOCX FILE - ${fileName}]\n\nError extracting text from DOCX: ${(docxError as Error).message}\n\nAlternative method error: ${(altError as Error).message}\n\nFile size: ${buffer.length} bytes\nBase64 content: ${processedContent.substring(0, 200)}...`;
              }
            }
          } else if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || 
                     mimeType === "application/vnd.ms-excel" ||
                     mimeType === "application/vnd.google-apps.spreadsheet") {
            try {
              // Parse Excel file to extract data
              console.log(`Attempting to parse Excel file: ${fileName}, buffer size: ${buffer.length}`);
              
              // Read the workbook from buffer
              const workbook = XLSX.read(buffer, { type: 'buffer' });
              
              // Get all sheet names
              const sheetNames = workbook.SheetNames;
              console.log(`Found ${sheetNames.length} sheets in Excel file: ${sheetNames.join(', ')}`);
              
              let excelContent = `[EXCEL FILE - ${fileName}]\n\n`;
              excelContent += `Total Sheets: ${sheetNames.length}\n`;
              excelContent += `Sheet Names: ${sheetNames.join(', ')}\n\n`;
              
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
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                
                excelContent += `=== SHEET ${index + 1}: ${sheetName} ===\n`;
                excelContent += `Rows: ${jsonData.length}\n`;
                
                if (jsonData.length > 0) {
                  const firstRow = jsonData[0] as any[];
                  excelContent += `Columns: ${firstRow.length}\n`;
                  
                  // Show first few rows in a readable format
                  if (csvData.trim()) {
                    const csvLines = csvData.split('\n');
                    const previewLines = csvLines.slice(0, Math.min(10, csvLines.length));
                    excelContent += `\nPreview (first ${previewLines.length} rows):\n`;
                    excelContent += previewLines.join('\n');
                    
                    if (csvLines.length > 10) {
                      excelContent += `\n... (${csvLines.length - 10} more rows)`;
                    }
                  } else {
                    excelContent += '\n(Empty sheet)';
                  }
                } else {
                  excelContent += '\n(No data found)';
                }
                
                excelContent += '\n\n';
              });
              
              processedContent = excelContent;
              encoding = "utf-8";
              console.log(`Successfully extracted data from Excel file: ${fileName}`);
            } catch (excelError) {
              console.error(`Error parsing Excel file ${fileName}:`, excelError);
              processedContent = `[EXCEL FILE - ${fileName}]\n\nError extracting data from Excel file: ${(excelError as Error).message}\n\nFile size: ${buffer.length} bytes\nBase64 content: ${processedContent.substring(0, 200)}...`;
            }
          }
        }

        const contentSize = Buffer.byteLength(
          processedContent,
          encoding === "base64" ? "base64" : "utf-8",
        );

        console.log(
          `Successfully read file: ${fileName}, content size: ${contentSize} bytes, encoding: ${encoding}`,
        );

        return {
          content: processedContent,
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
async function handleResponseData(data: any): Promise<string> {
  if (typeof data === "string") {
    return data;
  } else if (data instanceof Buffer) {
    return data.toString("utf-8");
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf-8");
  } else if (data instanceof Uint8Array) {
    return Buffer.from(data).toString("utf-8");
  } else if (data instanceof Readable) {
    // Handle stream data
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
  } else if (data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("utf-8");
  } else {
    return String(data);
  }
}

// Helper function to convert different data types to Buffer
async function convertToBuffer(data: any): Promise<Buffer> {
  if (data instanceof Buffer) {
    return data;
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  } else if (data instanceof Uint8Array) {
    return Buffer.from(data);
  } else if (data instanceof Readable) {
    // Handle stream data
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } else if (data instanceof Blob) {
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else if (typeof data === "string") {
    return Buffer.from(data, "utf-8");
  } else {
    return Buffer.from(String(data), "utf-8");
  }
}