import { type searchFilesTool } from "./base";
import { google } from "googleapis";
import type { ServerToolConfig } from "@/toolkits/types";

export const googleDriveSearchFilesToolConfigServer = (
  keyFile: string,
  folderId?: string,
): ServerToolConfig<
  typeof searchFilesTool.inputSchema.shape,
  typeof searchFilesTool.outputSchema.shape
> => {
  return {
    callback: async ({ query, pageToken, pageSize, mimeType }) => {
      const auth = new google.auth.GoogleAuth({
        keyFile: keyFile,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });

      const drive = google.drive({ version: "v3", auth });

      // Build the search query
      let searchQuery = query;
      if (mimeType) {
        searchQuery = `fullText contains '${query}' or name contains '${query}' and mimeType='${mimeType}'`;
      } else if (query) {
        searchQuery = `fullText contains '${query}' or name contains '${query}'`;
      }

      if (folderId) {
        searchQuery = `'${folderId}' in parents and ${searchQuery}`;
      }

      const response = await drive.files.list({
        q: searchQuery,
        pageToken: pageToken || undefined,
        pageSize: Math.min(pageSize ?? 10, 100),
        fields:
          "nextPageToken, incompleteSearch, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, iconLink, owners(displayName, emailAddress), parents)",
        orderBy: "modifiedTime desc",
      });

      const files =
        response.data.files?.map((file) => ({
          id: file.id!,
          name: file.name!,
          mimeType: file.mimeType!,
          size: file.size ?? undefined,
          modifiedTime: file.modifiedTime ?? undefined,
          createdTime: file.createdTime ?? undefined,
          webViewLink: file.webViewLink ?? undefined,
          iconLink: file.iconLink ?? undefined,
          owners:
            file.owners?.map((owner) => ({
              displayName: owner.displayName ?? undefined,
              emailAddress: owner.emailAddress ?? undefined,
            })) ?? undefined,
          parents: file.parents ?? undefined,
        })) ?? [];

      return {
        files,
        nextPageToken: response.data.nextPageToken ?? undefined,
        incompleteSearch: response.data.incompleteSearch ?? undefined,
      };
    },
  };
};
