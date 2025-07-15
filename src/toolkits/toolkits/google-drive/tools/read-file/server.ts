import { type readFileTool } from "./base";
import { google } from "googleapis";
import type { ServerToolConfig } from "@/toolkits/types";

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

      // First get file metadata
      const fileMetadata = await drive.files.get({
        fileId: fileId,
        fields: "name, mimeType, size",
      });

      const fileName = fileMetadata.data.name!;
      const mimeType = fileMetadata.data.mimeType!;

      let content: string;
      let resultMimeType = mimeType;
      let encoding: string | undefined;

      // Handle Google Workspace files that need to be exported
      const isGoogleWorkspaceFile = mimeType.startsWith(
        "application/vnd.google-apps.",
      );

      if (isGoogleWorkspaceFile) {
        // Determine export format based on file type
        let defaultExportFormat: string;
        if (mimeType === "application/vnd.google-apps.document") {
          defaultExportFormat = exportFormat || "text/markdown";
        } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
          defaultExportFormat = exportFormat || "text/csv";
        } else if (mimeType === "application/vnd.google-apps.presentation") {
          defaultExportFormat = exportFormat || "text/plain";
        } else {
          defaultExportFormat = exportFormat || "text/plain";
        }

        const exportResponse = await drive.files.export({
          fileId: fileId,
          mimeType: defaultExportFormat,
        });

        content = exportResponse.data as string;
        resultMimeType = defaultExportFormat;
        encoding = "utf-8";
      } else {
        // For regular files, download directly
        const response = await drive.files.get({
          fileId: fileId,
          alt: "media",
        });

        if (typeof response.data === "string") {
          content = response.data;
          encoding = "utf-8";
        } else {
          // Handle binary data by converting to base64
          content = Buffer.from(response.data as ArrayBuffer).toString(
            "base64",
          );
          encoding = "base64";
        }
      }

      return {
        content,
        mimeType: resultMimeType,
        fileName,
        size: content.length,
        encoding,
      };
    },
  };
};
