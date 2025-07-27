import { type searchFilesTool } from "./base";
import { drive_v3, google } from "googleapis";
import type { ServerToolConfig } from "@/toolkits/types";
import { DirectoryCache } from "../../cache/DirectoryCache";

export const googleDriveSearchFilesToolConfigServer = (
  keyFile: string,
  folderId?: string,
): ServerToolConfig<
  typeof searchFilesTool.inputSchema.shape,
  typeof searchFilesTool.outputSchema.shape
> => {
  const directoryCache = new DirectoryCache();

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

      // Initialize cache
      await directoryCache.initialize();

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

      const performFileSearch = async (
        searchQuery: string,
        options: {
          folderId?: string;
          pageToken?: string;
          pageSize: number;
          orderBy?: string;
        },
      ) => {
        const finalQuery = options.folderId
          ? `${searchQuery} and '${options.folderId}' in parents`
          : searchQuery;

        try {
          const response = await drive.files.list({
            q: finalQuery,
            pageToken: options.pageToken,
            pageSize: options.pageSize,
            fields:
              "nextPageToken, incompleteSearch, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, iconLink, owners(displayName, emailAddress), parents)",
            orderBy: options.orderBy ?? "modifiedTime desc",
          });

          return {
            files: response.data.files ?? [],
            nextPageToken: response.data.nextPageToken,
            incompleteSearch: response.data.incompleteSearch ?? false,
            error: null,
          };
        } catch (error) {
          console.warn(`File search failed for query: ${finalQuery}`, error);
          return {
            files: [],
            nextPageToken: undefined,
            incompleteSearch: true,
            error: error as Error,
          };
        }
      };

      // Build search query (without folder constraints - we'll handle that via cache)
      const buildSearchQuery = (
        query: string,
        options: {
          mimeType?: string;
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

        return conditions.join(" and ");
      };

      const buildEnhancedDirectoryStructure = async (
        rootFolderId: string,
        onProgress?: (progress: {
          message: string;
          progress: number;
          foldersProcessed: number;
        }) => void,
      ): Promise<{
        folderIds: string[];
        cacheHit: boolean;
        changedFolders?: string[];
      }> => {
        console.log(`Building directory structure for folder: ${rootFolderId}`);

        // Check if we can use cached structure
        const cacheStats = await directoryCache.getCacheStats();
        console.log(
          `Cache stats: ${cacheStats.totalFolders} folders, age: ${Math.round(cacheStats.cacheAge / 1000 / 60)}m`,
        );

        // Get initial folder structure - this returns cache hit info implicitly
        const folderCountBefore = cacheStats.totalFolders;

        const folderIds = await directoryCache.buildDirectoryStructure(
          drive,
          rootFolderId,
          onProgress,
        );

        const folderCountAfter = (await directoryCache.getCacheStats())
          .totalFolders;

        const cacheHit =
          folderCountBefore > 0 && folderCountBefore === folderCountAfter;

        console.log(
          `Directory structure: ${folderIds.length} folders (cache hit: ${cacheHit})`,
        );

        let changedFolders: string[] = [];
        if (cacheHit && cacheStats.cacheAge > 2 * 60 * 60 * 1000) {
          // If cache is older than 2 hours
          console.log(
            "Cache is relatively old, checking for incremental updates...",
          );

          // Sample a few folders to see if they've changed
          const sampleFolders = folderIds.slice(
            0,
            Math.min(5, folderIds.length),
          );
          const potentialChanges = [];

          for (const folderId of sampleFolders) {
            try {
              const folderInfo = await drive.files.get({
                fileId: folderId,
                fields: "modifiedTime",
              });

              // Compare with cache timestamp (this is a simplified check)
              const folderModTime = new Date(
                folderInfo.data.modifiedTime ?? 0,
              ).getTime();
              const cacheTime = cacheStats.lastSync.getTime();

              if (folderModTime > cacheTime) {
                potentialChanges.push(folderId);
              }
            } catch (error) {
              console.warn(
                `Could not check folder ${folderId} for changes:`,
                error,
              );
            }
          }

          if (potentialChanges.length > 0) {
            console.log(
              `Found ${potentialChanges.length} potentially changed folders, performing incremental update...`,
            );
            await directoryCache.incrementalUpdate(
              drive,
              potentialChanges,
              (progress) => {
                console.log(
                  `Incremental update: ${progress.message} (${progress.progress.toFixed(1)}%)`,
                );
              },
            );
            changedFolders = potentialChanges;
          }
        }

        return { folderIds, cacheHit, changedFolders };
      };

      const performCachedSearch = async (
        rootFolderId: string,
        searchQuery: string,
        maxResults: number,
      ) => {
        console.log(`Starting cached search for folder: ${rootFolderId}`);

        // Phase 1: Get folder structure with explicit cache tracking
        const folderDiscoveryStart = Date.now();

        const { folderIds, cacheHit, changedFolders } =
          await buildEnhancedDirectoryStructure(rootFolderId, (progress) => {
            console.log(
              `Cache progress: ${progress.message} (${progress.progress.toFixed(1)}%)`,
            );
          });

        console.log(
          cacheHit
            ? "Cache Hit: Used existing cache."
            : "Cache Miss: Built fresh directory structure.",
        );

        const folderDiscoveryTime = Date.now() - folderDiscoveryStart;
        console.log(
          `Folder discovery completed in ${folderDiscoveryTime}ms. Found ${folderIds.length} folders (cache hit: ${cacheHit})`,
        );

        if (changedFolders && changedFolders.length > 0) {
          console.log(
            `Incremental update applied to ${changedFolders.length} folders`,
          );
        }

        // Phase 2: Parallel batch search across all folders
        const searchStart = Date.now();
        const allFiles = [];
        const batchSize = 8;
        let processedFolders = 0;
        const searchErrors: Array<{ folderId: string; error: Error }> = [];

        // Process folders in batches to respect API limits and optimize performance
        for (let i = 0; i < folderIds.length; i += batchSize) {
          const batchFolderIds = folderIds.slice(i, i + batchSize);

          const batchPromises = batchFolderIds.map(async (folderId) => {
            const result = await performFileSearch(searchQuery, {
              folderId,
              pageSize: Math.min(50, maxResults - allFiles.length),
            });

            if (result.error) {
              searchErrors.push({ folderId, error: result.error });
            }

            return {
              folderId,
              ...result,
            };
          });

          // Wait for this batch to complete
          const batchResults = await Promise.all(batchPromises);

          // Collect results from this batch
          for (const result of batchResults) {
            if (result.files.length > 0) {
              allFiles.push(...result.files);
              console.log(
                `Found ${result.files.length} files in folder ${result.folderId}`,
              );
            }
            processedFolders++;
          }

          // Early termination if we have enough results
          if (allFiles.length >= maxResults) {
            console.log(
              `Early termination: Found ${allFiles.length} files, stopping search.`,
            );
            break;
          }

          // Log progress
          if (i + batchSize < folderIds.length) {
            const progress = ((i + batchSize) / folderIds.length) * 100;
            console.log(
              `Search progress: ${progress.toFixed(1)}% (${processedFolders}/${folderIds.length} folders)`,
            );
          }
        }

        const searchTime = Date.now() - searchStart;
        console.log(
          `File search completed in ${searchTime}ms. Found ${allFiles.length} total files.`,
        );

        if (searchErrors.length > 0) {
          console.warn(
            `Search errors occurred in ${searchErrors.length} folders:`,
            searchErrors,
          );
        }

        return {
          files: allFiles,
          foldersSearched: processedFolders,
          folderDiscoveryTime,
          searchTime,
          totalFolders: folderIds.length,
          cacheHit,
          searchErrors,
          changedFolders,
        };
      };

      // Execute the search
      let searchResult;
      const maxResults = Math.min(pageSize, 100);

      if (folderId && recursive) {
        // Use cached recursive search
        const baseQuery = buildSearchQuery(query, {
          mimeType,
          nameOnly,
          modifiedSince,
          fileTypes,
        });

        searchResult = await performCachedSearch(
          folderId,
          baseQuery,
          maxResults,
        );
      } else if (folderId && !recursive) {
        // Use centralized search function for non-recursive
        const baseQuery = buildSearchQuery(query, {
          mimeType,
          nameOnly,
          modifiedSince,
          fileTypes,
        });

        const result = await performFileSearch(baseQuery, {
          folderId,
          pageToken: pageToken ?? undefined,
          pageSize: maxResults,
        });

        searchResult = {
          files: result.files,
          foldersSearched: 1,
          folderDiscoveryTime: 0,
          searchTime: Date.now() - startTime,
          totalFolders: 1,
          cacheHit: false,
          nextPageToken: result.nextPageToken,
          incompleteSearch: result.incompleteSearch,
          searchErrors: result.error
            ? [{ folderId: folderId, error: result.error }]
            : [],
        };
      } else {
        // Use centralized search function for global search
        const baseQuery = buildSearchQuery(query, {
          mimeType,
          nameOnly,
          modifiedSince,
          fileTypes,
        });

        const result = await performFileSearch(baseQuery, {
          pageToken: pageToken ?? undefined,
          pageSize: maxResults,
        });

        searchResult = {
          files: result.files,
          foldersSearched: 1,
          folderDiscoveryTime: 0,
          searchTime: Date.now() - startTime,
          totalFolders: 1,
          cacheHit: false,
          nextPageToken: result.nextPageToken,
          incompleteSearch: result.incompleteSearch,
          searchErrors: result.error
            ? [{ folderId: "global", error: result.error }]
            : [],
        };
      }

      // Remove duplicates and sort
      const uniqueFiles = searchResult.files.filter(
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

      // 🧩 IMPROVED: Build file paths efficiently using enhanced cache
      const transformedFiles = await Promise.all(
        finalFiles.map(async (file) => {
          let path = "/";

          if (file.parents && file.parents.length > 0) {
            // Use cache to get path efficiently - this now has proper folder names
            const parentId = file.parents[0];
            if (parentId) {
              path = (await directoryCache.getFolderPath(parentId)) ?? "/";
            }
          }

          return {
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
            path,
          };
        }),
      );

      const totalDuration = Date.now() - startTime;

      // Enhanced logging for performance analysis
      console.log(`=== SEARCH PERFORMANCE SUMMARY ===`);
      console.log(`Total Duration: ${totalDuration}ms`);
      console.log(
        `Folder Discovery: ${searchResult.folderDiscoveryTime}ms (cache hit: ${searchResult.cacheHit})`,
      );
      console.log(`File Search: ${searchResult.searchTime}ms`);
      console.log(
        `Folders Searched: ${searchResult.foldersSearched}/${searchResult.totalFolders}`,
      );
      console.log(`Files Found: ${finalFiles.length}`);
      console.log(`Search Errors: ${searchResult.searchErrors?.length || 0}`);
      if (
        searchResult.changedFolders &&
        searchResult.changedFolders.length > 0
      ) {
        console.log(
          `Incremental Updates: ${searchResult.changedFolders.length} folders updated`,
        );
      }
      console.log(`=====================================`);

      return {
        files: transformedFiles,
        nextPageToken:
          "nextPageToken" in searchResult
            ? (searchResult.nextPageToken ?? undefined)
            : undefined,
        incompleteSearch:
          ("incompleteSearch" in searchResult
            ? searchResult.incompleteSearch
            : false) ??
          searchResult.foldersSearched < searchResult.totalFolders,
        searchStats: {
          totalFound: uniqueFiles.length,
          foldersSearched: searchResult.foldersSearched,
          searchDuration: totalDuration,
        },
      };
    },
  };
};
