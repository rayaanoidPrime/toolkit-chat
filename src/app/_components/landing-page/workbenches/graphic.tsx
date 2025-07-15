import { allClientToolkits } from "@/toolkits/toolkits/client";
import type { Toolkits } from "@/toolkits/toolkits/shared";
import { createRef, useRef } from "react";
import type { WorkbenchExample } from "./types";
import { AnimatedBeam } from "@/components/magicui/animated-beam";

export const WorkbenchVisualization: React.FC<{
  workbench: WorkbenchExample;
}> = ({ workbench }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const toolkitRefs = workbench.toolkits.map(() => createRef<HTMLDivElement>());

  const centerColorClasses = {
    blue: {
      border: "border-blue-300 dark:border-blue-700",
      bg: "bg-blue-100 dark:bg-blue-900",
      iconBg: "bg-blue-200 dark:bg-blue-800",
    },
    green: {
      border: "border-green-300 dark:border-green-700",
      bg: "bg-green-100 dark:bg-green-900",
      iconBg: "bg-green-200 dark:bg-green-800",
    },
    purple: {
      border: "border-purple-300 dark:border-purple-700",
      bg: "bg-purple-100 dark:bg-purple-900",
      iconBg: "bg-purple-200 dark:bg-purple-800",
    },
  };

  const centerColors =
    centerColorClasses[workbench.color as keyof typeof centerColorClasses];

  return (
    <div className="relative w-full overflow-hidden" ref={containerRef}>
      {/* Central Workbench Node */}
      <div className="flex h-full w-full items-center justify-between gap-2 md:gap-8">
        {/* Left side toolkits */}
        <div className="z-8 flex flex-col gap-4">
          {workbench.toolkits.slice(0, 2).map((toolkit, index) => (
            <div key={toolkit}>
              <ToolkitNode
                toolkit={toolkit}
                nodeRef={toolkitRefs[index] as React.RefObject<HTMLDivElement>}
                color={workbench.color}
              />
            </div>
          ))}
        </div>

        {/* Center node */}
        <div className="z-10">
          <div
            ref={centerRef}
            className={`rounded-xl border-2 ${centerColors.border} ${centerColors.bg} p-2 shadow-lg md:p-4`}
          >
            {workbench.icon}
          </div>
        </div>

        {/* Right side toolkits */}
        <div className="z-8 flex flex-col gap-4">
          {workbench.toolkits.slice(2, 4).map((toolkit, index) => (
            <div key={toolkit}>
              <ToolkitNode
                toolkit={toolkit}
                nodeRef={
                  toolkitRefs[index + 2] as React.RefObject<HTMLDivElement>
                }
                color={workbench.color}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Animated Beams connecting toolkits to center */}
      {toolkitRefs.map((ref, index) => (
        <AnimatedBeam
          key={index}
          containerRef={containerRef}
          fromRef={ref}
          toRef={centerRef}
          duration={3 + Math.random()}
          delay={index * 0.3}
          pathOpacity={0.4}
          reverse={index < 2}
          gradientStartColor={
            workbench.color === "blue"
              ? "#3b82f6"
              : workbench.color === "green"
                ? "#10b981"
                : "#8b5cf6"
          }
          gradientStopColor={
            workbench.color === "blue"
              ? "#1d4ed8"
              : workbench.color === "green"
                ? "#059669"
                : "#7c3aed"
          }
        />
      ))}
    </div>
  );
};

const ToolkitNode: React.FC<{
  toolkit: Toolkits;
  nodeRef: React.RefObject<HTMLDivElement>;
  color: string;
}> = ({ toolkit, nodeRef, color }) => {
  const clientToolkit = allClientToolkits[toolkit];
  const IconComponent = clientToolkit.icon;

  const colorClasses = {
    blue: {
      border: "border-blue-200 dark:border-blue-800",
      bg: "bg-blue-50 dark:bg-blue-950",
      iconBg: "md:bg-blue-100 md:dark:bg-blue-900",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    green: {
      border: "border-green-200 dark:border-green-800",
      bg: "bg-green-50 dark:bg-green-950",
      iconBg: "md:bg-green-100 md:dark:bg-green-900",
      iconColor: "text-green-600 dark:text-green-400",
    },
    purple: {
      border: "border-purple-200 dark:border-purple-800",
      bg: "bg-purple-50 dark:bg-purple-950",
      iconBg: "md:bg-purple-100 md:dark:bg-purple-900",
      iconColor: "text-purple-600 dark:text-purple-400",
    },
  };

  const colors = colorClasses[color as keyof typeof colorClasses];

  return (
    <div
      ref={nodeRef}
      className={`relative rounded-lg border-2 ${colors.border} ${colors.bg} p-2 shadow-sm transition-all hover:shadow-md`}
    >
      <div className="flex flex-col items-center gap-2 md:flex-row">
        <div className={`rounded-md ${colors.iconBg} p-0 md:p-1.5`}>
          <IconComponent className={`size-4 ${colors.iconColor}`} />
        </div>
        <span className="text-xs font-medium md:whitespace-nowrap">
          {clientToolkit.name}
        </span>
      </div>
    </div>
  );
};
