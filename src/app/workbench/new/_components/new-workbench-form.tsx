"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VStack, HStack } from "@/components/ui/stack";
import { ToolkitList } from "@/components/toolkit/toolkit-list";
import type { SelectedToolkit } from "@/components/toolkit/types";
import type { Toolkits } from "@/toolkits/toolkits/shared";
import { toast } from "sonner";
import {
  Dialog,
  DialogDescription,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Anvil, Plus } from "lucide-react";
import { ToolkitIcons } from "@/components/toolkit/toolkit-icons";
import { allClientToolkits } from "@/toolkits/toolkits/client";

export function NewWorkbenchForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [selectedToolkits, setSelectedToolkits] = useState<SelectedToolkit[]>(
    [],
  );

  const createMutation = api.workbenches.createWorkbench.useMutation({
    onSuccess: (workbench) => {
      toast.success("Workbench created successfully");
      router.push(`/workbench/${workbench.id}`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a workbench name");
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      toolkitIds: selectedToolkits.map((toolkit) => toolkit.id),
    });
  };

  const handleAddToolkit = (toolkit: SelectedToolkit) => {
    setSelectedToolkits([...selectedToolkits, toolkit]);
  };

  const handleRemoveToolkit = (id: Toolkits) => {
    setSelectedToolkits(
      selectedToolkits.filter((toolkit) => toolkit.id !== id),
    );
  };

  const handleCancel = () => {
    router.push("/");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-2 py-8">
      <VStack className="w-full items-start gap-8">
        <div className="flex items-center gap-2 md:flex-col md:items-start">
          <Anvil className="text-primary size-16" />
          <VStack className="gap-2">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">
                Create New Workbench
              </h1>
              <p className="text-muted-foreground text-sm md:text-base">
                Create a custom AI workbench with specific toolkits and system
                prompts.
              </p>
            </div>
          </VStack>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-8">
          <VStack className="w-full items-start gap-6">
            {/* Name Field */}
            <VStack className="w-full items-start gap-2">
              <Label htmlFor="name" className="text-base font-semibold">
                Workbench Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter workbench name..."
                required
                maxLength={100}
              />
              <p className="text-muted-foreground text-xs">
                Give your workbench a descriptive name (1-100 characters).
              </p>
            </VStack>

            {/* System Prompt Field */}
            <VStack className="w-full items-start gap-2">
              <Label htmlFor="systemPrompt" className="text-base font-semibold">
                System Prompt
              </Label>
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter system prompt to define the AI's behavior and role..."
                rows={8}
                className="resize-none"
                maxLength={10000}
              />
              <p className="text-muted-foreground text-xs">
                This prompt will instruct the AI on how to behave in this
                workbench (max 10,000 characters).
              </p>
            </VStack>

            {/* Toolkit Selection */}
            <VStack className="w-full items-start gap-2">
              <Label className="text-base font-semibold">Select Toolkits</Label>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start px-2"
                  >
                    {selectedToolkits.length > 0 ? (
                      <HStack className="w-full">
                        <ToolkitIcons
                          toolkits={selectedToolkits.map(
                            (toolkit) => toolkit.id,
                          )}
                        />
                        <p className="text-muted-foreground text-xs">
                          {selectedToolkits.length} Toolkit
                          {selectedToolkits.length !== 1 ? "s" : ""} selected
                        </p>
                      </HStack>
                    ) : (
                      <HStack className="w-full justify-between">
                        <HStack className="flex items-center gap-2">
                          <Plus className="text-muted-foreground size-4" />
                          <p className="text-muted-foreground text-xs">
                            Select toolkits...
                          </p>
                        </HStack>
                        <ToolkitIcons
                          toolkits={
                            Object.keys(allClientToolkits) as Toolkits[]
                          }
                          iconContainerClassName="bg-background"
                          iconClassName="text-muted-foreground"
                        />
                      </HStack>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] max-w-lg gap-2 overflow-hidden">
                  <DialogHeader className="gap-1">
                    <DialogTitle>Select Toolkits</DialogTitle>
                    <DialogDescription>
                      Choose the toolkits that will be available in this
                      workbench.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto">
                    <ToolkitList
                      selectedToolkits={selectedToolkits}
                      onAddToolkit={handleAddToolkit}
                      onRemoveToolkit={handleRemoveToolkit}
                    />
                  </div>
                </DialogContent>
              </Dialog>
              <p className="text-muted-foreground text-xs">
                Select the toolkits that will be available in this workbench.
              </p>
            </VStack>
          </VStack>

          {/* Form Actions */}
          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={createMutation.isPending}
              className="flex-1"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              className="flex-1"
            >
              {createMutation.isPending ? "Creating..." : "Create Workbench"}
            </Button>
          </div>
        </form>
      </VStack>
    </div>
  );
}
