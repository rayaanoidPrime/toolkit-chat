import { promises as fs } from "fs";
import { join } from "path";
import type { drive_v3 } from "googleapis";

interface CachedFolder {
  id: string;
  name: string;
  parentId?: string;
  path: string;
  children: string[];
  lastUpdated: number;
  modifiedTime: string;
}

interface CacheMetadata {
  rootFolderId: string;
  lastFullSync: number;
  version: string;
  totalFolders: number;
}

export class DirectoryCache {
  private cachePath: string;
  private cacheFile: string;
  private metadataFile: string;
  private cache: Map<string, CachedFolder> = new Map<string, CachedFolder>();
  private metadata: CacheMetadata | null = null;
  private readonly CACHE_VERSION = "1.1";
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000;

  constructor(cacheDir = "./.drive-cache") {
    this.cachePath = cacheDir;
    this.cacheFile = join(cacheDir, "directory_structure.json");
    this.metadataFile = join(cacheDir, "cache_metadata.json");
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cachePath, { recursive: true });
      await this.loadCache();
    } catch (error) {
      console.warn("Failed to initialize cache:", error);
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const [cacheData, metadataData] = await Promise.all([
        fs.readFile(this.cacheFile, "utf8").catch(() => "{}"),
        fs.readFile(this.metadataFile, "utf8").catch(() => "{}"),
      ]);

      let parsedCacheRaw: unknown = {};
      let parsedMetadataRaw: unknown = {};
      try {
        parsedCacheRaw = JSON.parse(cacheData);
      } catch {}
      try {
        parsedMetadataRaw = JSON.parse(metadataData);
      } catch {}

      let parsedCache: Record<string, CachedFolder> = {};
      if (parsedCacheRaw && typeof parsedCacheRaw === "object") {
        parsedCache = parsedCacheRaw as Record<string, CachedFolder>;
      }
      let parsedMetadata: Partial<CacheMetadata> = {};
      if (parsedMetadataRaw && typeof parsedMetadataRaw === "object") {
        parsedMetadata = parsedMetadataRaw as Partial<CacheMetadata>;
      }

      this.cache = new Map<string, CachedFolder>(Object.entries(parsedCache));
      this.metadata = parsedMetadata.version
        ? (parsedMetadata as CacheMetadata)
        : null;

      console.log(
        `Loaded cache with ${this.cache.size} folders, version ${this.metadata?.version ?? "unknown"}`,
      );
    } catch (error) {
      console.warn("Failed to load cache:", error);
      this.cache = new Map<string, CachedFolder>();
      this.metadata = null;
    }
  }

  private async saveCache(): Promise<void> {
    try {
      const cacheObj = Object.fromEntries(this.cache);
      await Promise.all([
        fs.writeFile(this.cacheFile, JSON.stringify(cacheObj, null, 2)),
        fs.writeFile(this.metadataFile, JSON.stringify(this.metadata, null, 2)),
      ]);
      console.log(`Saved cache with ${this.cache.size} folders`);
    } catch (error) {
      console.error("Failed to save cache:", error);
    }
  }

  async buildDirectoryStructure(
    drive: drive_v3.Drive,
    rootFolderId: string,
    onProgress?: (progress: {
      message: string;
      progress: number;
      foldersProcessed: number;
    }) => void,
  ): Promise<string[]> {
    const shouldRebuildCache = await this.shouldRebuildCache(rootFolderId);

    if (!shouldRebuildCache && this.cache.size > 0) {
      console.log("Using cached directory structure");
      return Array.from(this.cache.keys());
    }

    console.log("Building fresh directory structure...");
    return this.buildFreshStructure(drive, rootFolderId, onProgress);
  }

  private async shouldRebuildCache(rootFolderId: string): Promise<boolean> {
    if (!this.metadata || this.cache.size === 0) return true;
    if (this.metadata.rootFolderId !== rootFolderId) return true;
    if (this.metadata.version !== this.CACHE_VERSION) return true;

    const now = Date.now();
    const cacheAge = now - this.metadata.lastFullSync;

    return cacheAge > this.CACHE_TTL;
  }

  private async buildFreshStructure(
    drive: drive_v3.Drive,
    rootFolderId: string,
    onProgress?: (progress: {
      message: string;
      progress: number;
      foldersProcessed: number;
    }) => void,
  ): Promise<string[]> {
    this.cache.clear();

    // Get root folder info first
    const rootFolderInfo = await this.getFolderInfo(drive, rootFolderId);

    const folderQueue: Array<{
      id: string;
      parentId?: string;
      path: string;
      name: string;
    }> = [
      {
        id: rootFolderId,
        path: "/",
        name: rootFolderInfo.name,
      },
    ];

    const allFolderIds: string[] = [];
    let processedCount = 0;

    while (folderQueue.length > 0) {
      const batchSize = 10;
      const currentBatch = folderQueue.splice(0, batchSize);

      const batchPromises = currentBatch.map(
        async ({ id, parentId, path, name }) => {
          try {
            const response = await drive.files.list({
              q: `'${id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
              fields: "files(id, name, modifiedTime, parents)",
              pageSize: 1000,
            });

            const folders = response.data.files ?? [];
            const childIds: string[] = folders
              .map((f) => f.id)
              .filter((id): id is string => typeof id === "string");

            // 🧩 IMPROVED: Cache this folder with proper name and path
            this.cache.set(id, {
              id,
              name: name, // Use the actual folder name
              parentId,
              path,
              children: childIds,
              lastUpdated: Date.now(),
              modifiedTime: new Date().toISOString(),
            });

            allFolderIds.push(id);

            // Add children to queue with proper names and paths
            folders.forEach((folder) => {
              if (!folder.id || !folder.name) return;
              const childPath =
                path === "/" ? `/${folder.name}` : `${path}/${folder.name}`;
              folderQueue.push({
                id: folder.id,
                parentId: id,
                path: childPath,
                name: folder.name,
              });
            });

            return folders.length;
          } catch (error) {
            console.warn(`Failed to process folder ${id} (${name}):`, error);
            return 0;
          }
        },
      );

      await Promise.all(batchPromises);
      processedCount += currentBatch.length;

      onProgress?.({
        message: `Processing directories... (${processedCount} folders processed)`,
        progress: Math.min(
          (processedCount / Math.max(processedCount + folderQueue.length, 1)) *
            100,
          99,
        ),
        foldersProcessed: processedCount,
      });
    }

    // Update metadata
    this.metadata = {
      rootFolderId,
      lastFullSync: Date.now(),
      version: this.CACHE_VERSION,
      totalFolders: allFolderIds.length,
    };

    await this.saveCache();
    return allFolderIds;
  }

  // 🧩 NEW: Helper method to get folder info
  private async getFolderInfo(
    drive: drive_v3.Drive,
    folderId: string,
  ): Promise<{ name: string; modifiedTime?: string }> {
    try {
      const response = await drive.files.get({
        fileId: folderId,
        fields: "name, modifiedTime",
      });

      return {
        name: response.data.name ?? "Unknown",
        modifiedTime: response.data.modifiedTime ?? undefined,
      };
    } catch (error) {
      console.warn(`Failed to get folder info for ${folderId}:`, error);
      return { name: "Unknown" };
    }
  }

  async getSubfolders(folderId: string): Promise<string[]> {
    const folder = this.cache.get(folderId);
    if (!folder) return [];

    return folder.children;
  }

  async getFolderPath(folderId: string): Promise<string> {
    const folder = this.cache.get(folderId);
    if (!folder) {
      console.warn(`Folder ${folderId} not found in cache`);
      return "/";
    }

    return folder.path;
  }

  async getFolderName(folderId: string): Promise<string> {
    const folder = this.cache.get(folderId);
    return folder?.name ?? "Unknown";
  }

  // 🧩 NEW: Get full folder info
  async getFolderDetails(folderId: string): Promise<CachedFolder | null> {
    return this.cache.get(folderId) ?? null;
  }

  async getAllFolderIds(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  // 🚀 ENHANCED: Improved incremental update with better error handling
  async incrementalUpdate(
    drive: drive_v3.Drive,
    changedFolderIds: string[],
    onProgress?: (progress: { message: string; progress: number }) => void,
  ): Promise<{ updated: number; errors: number }> {
    console.log(
      `Performing incremental update for ${changedFolderIds.length} folders`,
    );

    let updated = 0;
    let errors = 0;

    for (let i = 0; i < changedFolderIds.length; i++) {
      const folderId = changedFolderIds[i];
      if (!folderId) continue;

      const cachedFolder = this.cache.get(folderId);
      if (!cachedFolder) {
        console.warn(
          `Folder ${folderId} not found in cache for incremental update`,
        );
        errors++;
        continue;
      }

      try {
        const response = await drive.files.list({
          q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
          fields: "files(id, name, modifiedTime)",
          pageSize: 1000,
        });

        const currentChildren: string[] =
          response.data.files
            ?.map((f) => f.id)
            .filter((id): id is string => typeof id === "string") ?? [];

        // Update cache with new children list
        this.cache.set(folderId, {
          ...cachedFolder,
          children: currentChildren,
          lastUpdated: Date.now(),
        });

        updated++;

        onProgress?.({
          message: `Updated folder ${i + 1}/${changedFolderIds.length} (${cachedFolder.name})`,
          progress: ((i + 1) / changedFolderIds.length) * 100,
        });
      } catch (error) {
        console.warn(
          `Failed to update folder ${folderId} (${cachedFolder.name}):`,
          error,
        );
        errors++;
      }
    }

    if (updated > 0) {
      await this.saveCache();
    }

    console.log(
      `Incremental update completed: ${updated} updated, ${errors} errors`,
    );
    return { updated, errors };
  }

  async validateCacheForFolders(
    drive: drive_v3.Drive,
    folderIds: string[],
  ): Promise<string[]> {
    const stalefolders: string[] = [];
    const batchSize = 5;

    console.log(`Validating cache for ${folderIds.length} folders...`);

    for (let i = 0; i < folderIds.length; i += batchSize) {
      const batch = folderIds.slice(i, i + batchSize);

      const validationPromises = batch.map(async (folderId) => {
        const cachedFolder = this.cache.get(folderId);
        if (!cachedFolder) return null;

        try {
          const response = await drive.files.get({
            fileId: folderId,
            fields: "modifiedTime",
          });

          const serverModTime = new Date(
            response.data.modifiedTime ?? 0,
          ).getTime();
          const cacheModTime = new Date(cachedFolder.modifiedTime).getTime();

          // If server version is newer than cached version
          if (serverModTime > cacheModTime) {
            return folderId;
          }
        } catch (error) {
          console.warn(`Could not validate folder ${folderId}:`, error);
          // Assume it needs update if we can't check
          return folderId;
        }

        return null;
      });

      const batchResults = await Promise.all(validationPromises);
      const staleBatch = batchResults.filter((id): id is string => id !== null);
      stalefolders.push(...staleBatch);
    }

    if (stalefolders.length > 0) {
      console.log(
        `Found ${stalefolders.length} stale folders that need updates`,
      );
    }

    return stalefolders;
  }

  async getCacheStats(): Promise<{
    totalFolders: number;
    cacheAge: number;
    lastSync: Date;
    cacheSize: string;
    version: string;
    isValid: boolean;
  }> {
    const stats = await fs.stat(this.cacheFile).catch(() => null);

    return {
      totalFolders: this.cache.size,
      cacheAge: this.metadata ? Date.now() - this.metadata.lastFullSync : 0,
      lastSync: this.metadata
        ? new Date(this.metadata.lastFullSync)
        : new Date(0),
      cacheSize: stats ? `${(stats.size / 1024).toFixed(2)} KB` : "0 KB",
      version: this.metadata?.version ?? "unknown",
      isValid: this.metadata?.version === this.CACHE_VERSION,
    };
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    this.metadata = null;

    try {
      await Promise.all([
        fs.unlink(this.cacheFile).catch(() => undefined),
        fs.unlink(this.metadataFile).catch(() => undefined),
      ]);
      console.log("Cache cleared successfully");
    } catch (error) {
      console.warn("Failed to clear cache files:", error);
    }
  }

  async exportCacheInfo(): Promise<{
    metadata: CacheMetadata | null;
    folderCount: number;
    sampleFolders: Array<{
      id: string;
      name: string;
      path: string;
      childCount: number;
      lastUpdated: Date;
    }>;
  }> {
    const folders = Array.from(this.cache.entries());
    const sampleSize = Math.min(10, folders.length);
    const sampleFolders = folders.slice(0, sampleSize).map(([id, folder]) => ({
      id,
      name: folder.name,
      path: folder.path,
      childCount: folder.children.length,
      lastUpdated: new Date(folder.lastUpdated),
    }));

    return {
      metadata: this.metadata,
      folderCount: this.cache.size,
      sampleFolders,
    };
  }
}
