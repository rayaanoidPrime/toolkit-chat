import React from "react";
import { type searchFilesTool } from "./base";
import type { ClientToolConfig } from "@/toolkits/types";
import { HStack, VStack } from "@/components/ui/stack";
import { FileCard } from "../../components/file-card";
import { ToolCallComponent } from "../../components/tool-call";
import { Search, Clock, FolderOpen, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const googleDriveSearchFilesToolConfigClient: ClientToolConfig<
  typeof searchFilesTool.inputSchema.shape,
  typeof searchFilesTool.outputSchema.shape
> = {
  CallComponent: ({ args }) => {
    const searchDetails = [];
    
    if (args.pageSize !== 10) {
      searchDetails.push(`${args.pageSize} results`);
    }
    
    if (args.mimeType) {
      searchDetails.push(`MIME: ${args.mimeType}`);
    }
    
    if (args.fileTypes && args.fileTypes.length > 0) {
      searchDetails.push(`Types: ${args.fileTypes.join(', ')}`);
    }
    
    if (args.nameOnly) {
      searchDetails.push('Name only');
    }
    
    if (args.modifiedSince) {
      searchDetails.push(`Since: ${args.modifiedSince}`);
    }
    
    if (args.recursive === false) {
      searchDetails.push('Non-recursive');
    }

    return (
      <ToolCallComponent
        action="Searching Google Drive"
        primaryText={`"${args.query}"`}
        secondaryText={searchDetails.length > 0 ? searchDetails.join(' • ') : 'All files, recursive search'}
        icon={Search}
      />
    );
  },
  
  ResultComponent: ({ result }) => {
    const { files, nextPageToken, incompleteSearch, searchStats } = result;

    if (files.length === 0) {
      return (
        <VStack className="items-center gap-2 py-4">
          <Search className="text-muted-foreground size-8" />
          <p className="text-muted-foreground text-sm">
            No files found matching your search criteria
          </p>
          {searchStats && (
            <p className="text-muted-foreground text-xs">
              Searched {searchStats.foldersSearched} folders in {searchStats.searchDuration}ms
            </p>
          )}
        </VStack>
      );
    }

    return (
      <VStack className="w-full items-start gap-3">
        {/* Search Results Header */}
        <HStack className="w-full items-center justify-between">
          <h3 className="text-sm font-medium">
            Search Results ({files.length})
          </h3>
          <HStack className="gap-2">
            {incompleteSearch && (
              <Badge variant="outline" className="text-xs">
                <Filter className="mr-1 size-3" />
                Incomplete
              </Badge>
            )}
            {nextPageToken && (
              <Badge variant="outline" className="text-xs">
                More available
              </Badge>
            )}
          </HStack>
        </HStack>

        {/* Search Statistics */}
        {searchStats && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="stats">
              <AccordionTrigger className="cursor-pointer py-1 hover:no-underline">
                <HStack className="items-center gap-2">
                  <Clock className="text-muted-foreground size-3" />
                  <span className="text-muted-foreground text-xs font-medium">
                    Search Statistics
                  </span>
                </HStack>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-0">
                <VStack className="items-start gap-1">
                  <HStack className="items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {searchStats.totalFound} files found
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <FolderOpen className="mr-1 size-3" />
                      {searchStats.foldersSearched} folders searched
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="mr-1 size-3" />
                      {searchStats.searchDuration}ms
                    </Badge>
                  </HStack>
                </VStack>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Files List */}
        <div className="flex w-full flex-col gap-2">
          {files.map((file) => (
            <div key={file.id} className="w-full">
              <FileCard file={file} />
              {file.path && file.path !== '/' && (
                <div className="mt-1 ml-7">
                  <span className="text-muted-foreground text-xs">
                    📁 {file.path}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer Notes */}
        <div className="w-full pt-2 border-t">
          <VStack className="items-start gap-1">
            {incompleteSearch && (
              <p className="text-muted-foreground text-xs">
                ⚠️ Search results may be incomplete due to query limitations or timeouts
              </p>
            )}
            {nextPageToken && (
              <p className="text-muted-foreground text-xs">
                💡 More results available - refine your search or use pagination
              </p>
            )}
            {searchStats && searchStats.foldersSearched > 1 && (
              <p className="text-muted-foreground text-xs">
                🔍 Recursive search performed across {searchStats.foldersSearched} folders
              </p>
            )}
          </VStack>
        </div>
      </VStack>
    );
  },
};