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
  private readonly CACHE_VERSION = "1.0";
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor(cacheDir = "./cache") {
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
    const folderQueue: Array<{ id: string; parentId?: string; path: string }> =
      [{ id: rootFolderId, path: "/" }];
    const allFolderIds: string[] = [];
    let processedCount = 0;

    while (folderQueue.length > 0) {
      const batchSize = 10;
      const currentBatch = folderQueue.splice(0, batchSize);

      const batchPromises = currentBatch.map(async ({ id, parentId, path }) => {
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

          // Cache this folder
          this.cache.set(id, {
            id,
            name: id === rootFolderId ? "Root" : "Unknown", // Will be updated with actual name
            parentId,
            path,
            children: childIds,
            lastUpdated: Date.now(),
            modifiedTime: new Date().toISOString(),
          });

          allFolderIds.push(id);

          // Add children to queue
          folders.forEach((folder) => {
            if (!folder.id) return;
            const childPath =
              path === "/" ? `/${folder.name}` : `${path}/${folder.name}`;
            folderQueue.push({
              id: folder.id,
              parentId: id,
              path: childPath,
            });
          });

          return folders.length;
        } catch (error) {
          console.warn(`Failed to process folder ${id}:`, error);
          return 0;
        }
      });

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

  async getSubfolders(folderId: string): Promise<string[]> {
    const folder = this.cache.get(folderId);
    if (!folder) return [];

    return folder.children;
  }

  async getFolderPath(folderId: string): Promise<string> {
    const folder = this.cache.get(folderId);
    return folder?.path ?? "";
  }

  async getAllFolderIds(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  async incrementalUpdate(
    drive: drive_v3.Drive,
    changedFolderIds: string[],
    onProgress?: (progress: { message: string; progress: number }) => void,
  ): Promise<void> {
    console.log(
      `Performing incremental update for ${changedFolderIds.length} folders`,
    );

    for (let i = 0; i < changedFolderIds.length; i++) {
      const folderId = changedFolderIds[i];
      if (!folderId) continue;
      const cachedFolder = this.cache.get(folderId);

      if (!cachedFolder) continue;

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

        // Update cache
        this.cache.set(folderId, {
          ...cachedFolder,
          children: currentChildren,
          lastUpdated: Date.now(),
        });

        onProgress?.({
          message: `Updating folder ${i + 1}/${changedFolderIds.length}`,
          progress: ((i + 1) / changedFolderIds.length) * 100,
        });
      } catch (error) {
        console.warn(`Failed to update folder ${folderId}:`, error);
      }
    }

    await this.saveCache();
  }

  async getCacheStats(): Promise<{
    totalFolders: number;
    cacheAge: number;
    lastSync: Date;
    cacheSize: string;
  }> {
    const stats = await fs.stat(this.cacheFile).catch(() => null);

    return {
      totalFolders: this.cache.size,
      cacheAge: this.metadata ? Date.now() - this.metadata.lastFullSync : 0,
      lastSync: this.metadata
        ? new Date(this.metadata.lastFullSync)
        : new Date(0),
      cacheSize: stats ? `${(stats.size / 1024).toFixed(2)} KB` : "0 KB",
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
    } catch (error) {
      console.warn("Failed to clear cache files:", error);
    }
  }
}
