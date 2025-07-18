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
    callback: async ({
      query,
      pageToken,
      pageSize = 10,
      mimeType,
      recursive = true,
      nameOnly = false,
      modifiedSince,
      fileTypes,
    }) => {
      const startTime = Date.now();

      const auth = new google.auth.GoogleAuth({
        keyFile: keyFile,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      });

      const drive = google.drive({ version: "v3", auth });

      // Helper function to get file type MIME types
      const getFileTypeMimeTypes = (types?: string[]): string[] => {
        if (!types || types.length === 0) return [];

        const mimeTypeMap: Record<string, string[]> = {
          document: [
            "application/vnd.google-apps.document",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/rtf",
          ],
          spreadsheet: [
            "application/vnd.google-apps.spreadsheet",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv",
          ],
          presentation: [
            "application/vnd.google-apps.presentation",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          ],
          pdf: ["application/pdf"],
          image: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/bmp",
            "image/svg+xml",
          ],
          video: [
            "video/mp4",
            "video/avi",
            "video/quicktime",
            "video/x-msvideo",
          ],
          audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3"],
          folder: ["application/vnd.google-apps.folder"],
          other: [],
        };

        return types.flatMap((type) => mimeTypeMap[type] ?? []);
      };

      // Build folder cache for path resolution
      const folderCache = new Map<
        string,
        { name: string; parents?: string[] }
      >();

      // Helper function to get folder info and cache it
      const getFolderInfo = async (folderId: string) => {
        if (folderCache.has(folderId)) {
          return folderCache.get(folderId)!;
        }

        try {
          const response = await drive.files.get({
            fileId: folderId,
            fields: "id, name, parents",
          });

          const info = {
            name: response.data.name ?? "Unknown",
            parents: response.data.parents ?? undefined,
          };

          folderCache.set(folderId, info);
          return info;
        } catch (error) {
          console.error(`Error fetching folder info for ${folderId}:`, error);
          const fallbackInfo = { name: "Unknown", parents: undefined };
          folderCache.set(folderId, fallbackInfo);
          return fallbackInfo;
        }
      };

      // Helper function to build file path
      const buildFilePath = async (parents?: string[]): Promise<string> => {
        if (!parents || parents.length === 0) return "/";

        const pathParts: string[] = [];
        let currentParents = parents;

        // Traverse up the folder hierarchy
        while (currentParents && currentParents.length > 0) {
          const parentId = currentParents[0];
          if (!parentId) break;
          const folderInfo = await getFolderInfo(parentId);

          pathParts.unshift(folderInfo.name);
          currentParents = folderInfo.parents ?? [];

          // Prevent infinite loops
          if (pathParts.length > 20) break;
        }

        return "/" + pathParts.join("/");
      };

      // Helper function to recursively get all folder IDs
      const getAllFolderIds = async (parentId: string): Promise<string[]> => {
        const folderIds: string[] = [parentId];

        if (!recursive) return folderIds;

        try {
          let nextPageToken: string | undefined;

          do {
            const response = await drive.files.list({
              q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
              fields: "nextPageToken, files(id, name, parents)",
              pageSize: 100,
              pageToken: nextPageToken,
            });

            const folders = response.data.files ?? [];

            // Add folder info to cache
            for (const folder of folders) {
              if (folder.id) {
                folderCache.set(folder.id, {
                  name: folder.name ?? "Unknown",
                  parents: folder.parents ?? undefined,
                });
              }
            }

            // Recursively get subfolders
            for (const folder of folders) {
              if (folder.id) {
                const subFolderIds = await getAllFolderIds(folder.id);
                folderIds.push(...subFolderIds);
              }
            }

            nextPageToken = response.data.nextPageToken ?? undefined;
          } while (nextPageToken);
        } catch (error) {
          console.warn(`Failed to get subfolders for ${parentId}:`, error);
        }

        return folderIds;
      };

      // Get all folder IDs to search in
      let folderIds: string[] = [];
      if (folderId) {
        folderIds = await getAllFolderIds(folderId);
      }

      // Build search query
      const buildSearchQuery = (
        query: string,
        options: {
          mimeType?: string;
          folderId?: string;
          nameOnly?: boolean;
          modifiedSince?: string;
          fileTypes?: string[];
        },
      ) => {
        const conditions: string[] = ["trashed=false"];

        // Add query conditions
        if (query.trim()) {
          const cleanQuery = query.replace(/^\"|\"$/g, "");

          if (options.nameOnly) {
            conditions.push(`name contains '${cleanQuery}'`);
          } else {
            conditions.push(
              `(name contains '${cleanQuery}' or fullText contains '${cleanQuery}')`,
            );
          }
        }

        // Add MIME type filter
        if (options.mimeType) {
          conditions.push(`mimeType='${options.mimeType}'`);
        }

        // Add file type filters
        if (options.fileTypes && options.fileTypes.length > 0) {
          const mimeTypes = getFileTypeMimeTypes(options.fileTypes);
          if (mimeTypes.length > 0) {
            const mimeConditions = mimeTypes
              .map((mt) => `mimeType='${mt}'`)
              .join(" or ");
            conditions.push(`(${mimeConditions})`);
          }
        }

        // Add modification date filter
        if (options.modifiedSince) {
          conditions.push(`modifiedTime >= '${options.modifiedSince}'`);
        }

        // Add folder restriction
        if (options.folderId) {
          conditions.push(`'${options.folderId}' in parents`);
        }

        return conditions.join(" and ");
      };

      // Perform the search
      const allFiles = [];
      const maxResults = Math.min(pageSize, 100);
      let processedResults = 0;
      let foldersSearched = 0;

      if (folderIds.length > 0) {
        // Search in each folder
        for (const currentFolderId of folderIds) {
          if (processedResults >= maxResults) break;

          foldersSearched++;
          const searchQuery = buildSearchQuery(query, {
            mimeType,
            folderId: currentFolderId,
            nameOnly,
            modifiedSince,
            fileTypes,
          });

          try {
            const response = await drive.files.list({
              q: searchQuery,
              pageSize: Math.min(maxResults - processedResults, 50),
              fields:
                "nextPageToken, incompleteSearch, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, iconLink, owners(displayName, emailAddress), parents)",
              orderBy: "modifiedTime desc",
            });

            const files = response.data.files ?? [];
            allFiles.push(...files);
            processedResults += files.length;
          } catch (error) {
            console.warn(`Search failed for folder ${currentFolderId}:`, error);
          }
        }
      } else {
        // Global search
        foldersSearched = 1;
        const searchQuery = buildSearchQuery(query, {
          mimeType,
          nameOnly,
          modifiedSince,
          fileTypes,
        });

        try {
          const response = await drive.files.list({
            q: searchQuery,
            pageToken: pageToken ?? undefined,
            pageSize: maxResults,
            fields:
              "nextPageToken, incompleteSearch, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, iconLink, owners(displayName, emailAddress), parents)",
            orderBy: "modifiedTime desc",
          });

          allFiles.push(...(response.data.files ?? []));
        } catch (error) {
          console.error("Global search failed:", error);
        }
      }

      // Remove duplicates and sort
      const uniqueFiles = allFiles.filter(
        (file, index, self) =>
          index === self.findIndex((f) => f.id === file.id),
      );

      uniqueFiles.sort((a, b) => {
        const aTime = new Date(a.modifiedTime ?? 0).getTime();
        const bTime = new Date(b.modifiedTime ?? 0).getTime();
        return bTime - aTime;
      });

      // Take only the requested number of results
      const finalFiles = uniqueFiles.slice(0, maxResults);

      // Transform files and add paths
      const transformedFiles = await Promise.all(
        finalFiles.map(async (file) => ({
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
          path: await buildFilePath(
            file.parents === null ? undefined : file.parents,
          ),
        })),
      );

      const searchDuration = Date.now() - startTime;

      return {
        files: transformedFiles,
        nextPageToken: undefined, // Custom pagination for recursive search
        incompleteSearch:
          folderIds.length > 0 && processedResults >= maxResults,
        searchStats: {
          totalFound: uniqueFiles.length,
          foldersSearched,
          searchDuration,
        },
      };
    },
  };
};
