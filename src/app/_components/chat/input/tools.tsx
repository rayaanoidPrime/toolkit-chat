import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  TooltipContent,
  TooltipTrigger,
  Tooltip,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Loader2, Save, Wrench } from "lucide-react";
import { useChatContext } from "@/app/_contexts/chat-context";
import { useEffect, useState } from "react";
import { ToolkitList } from "@/components/toolkit/toolkit-list";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { ToolkitIcons } from "@/components/toolkit/toolkit-icons";
import { allClientToolkits } from "@/toolkits/toolkits/client";
import { LanguageModelCapability } from "@/ai/types";
import { cn } from "@/lib/utils";
import type { Toolkits } from "@/toolkits/toolkits/shared";

interface ToolSelectProps {
  availableToolkitIds: Toolkits[];
}

export const ToolsSelect = ({ availableToolkitIds }: ToolSelectProps) => {
  const { toolkits, addToolkit, removeToolkit, workbench, selectedChatModel } =
    useChatContext();
  const searchParams = useSearchParams();

  const availableToolkits = toolkits.filter((toolkit) =>
    availableToolkitIds.includes(toolkit.id),
  );

  const [isOpen, setIsOpen] = useState(
    Object.keys(allClientToolkits)
      .filter((toolkit) => availableToolkitIds?.includes(toolkit as Toolkits))
      .some((toolkit) => searchParams.get(toolkit)),
  );
  const router = useRouter();

  useEffect(() => {
    if (
      !isOpen &&
      Object.keys(allClientToolkits)
        .filter((toolkit) => availableToolkitIds?.includes(toolkit as Toolkits))
        .some((toolkit) => searchParams.get(toolkit))
    ) {
      setIsOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { mutate: updateWorkbench, isPending } =
    api.workbenches.updateWorkbench.useMutation({
      onSuccess: () => {
        toast.success("Workbench updated successfully");
        router.refresh();
        setIsOpen(false);
      },
    });

  const handleSave = () => {
    if (workbench) {
      updateWorkbench({
        id: workbench.id,
        name: workbench.name,
        systemPrompt: workbench.systemPrompt,
        toolkitIds: toolkits.map((toolkit) => toolkit.id),
      });
    }
  };

  if (
    selectedChatModel &&
    !selectedChatModel.capabilities?.includes(
      LanguageModelCapability.ToolCalling,
    )
  ) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={"outline"}
              className="w-fit cursor-not-allowed justify-start bg-transparent opacity-50 md:w-auto md:px-2"
            >
              <Wrench />
              <span className="hidden md:block">Add Toolkits</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>This model does not support tool calling</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-fit justify-center bg-transparent md:w-auto md:px-2",
              toolkits.length === 0 && "size-9 md:w-auto",
            )}
            disabled={
              !selectedChatModel?.capabilities?.includes(
                LanguageModelCapability.ToolCalling,
              )
            }
          >
            {availableToolkits.length > 0 ? (
              <ToolkitIcons
                toolkits={availableToolkits.map((toolkit) => toolkit.id)}
              />
            ) : (
              <Wrench />
            )}
            <span className="hidden md:block">
              {availableToolkits.length > 0
                ? `${availableToolkits.length} Toolkit${availableToolkits.length > 1 ? "s" : ""}`
                : "Add Toolkits"}
            </span>
          </Button>
        </DialogTrigger>

        <DialogContent
          className="flex max-h-[80vh] w-full max-w-2xl flex-col gap-4 overflow-hidden"
          showCloseButton={false}
        >
          <DialogHeader className="gap-0">
            <DialogTitle className="text-xl">Manage Toolkits</DialogTitle>
            <DialogDescription>
              Add or remove tools to enhance your chat experience
            </DialogDescription>
          </DialogHeader>
          <div className="h-0 flex-1 overflow-y-auto">
            <ToolkitList
              selectedToolkits={toolkits}
              onAddToolkit={addToolkit}
              onRemoveToolkit={removeToolkit}
              availableToolkitIds={availableToolkitIds}
            />
          </div>
          {workbench !== undefined && (
            <Button
              variant={"outline"}
              className="bg-transparent"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Save
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
