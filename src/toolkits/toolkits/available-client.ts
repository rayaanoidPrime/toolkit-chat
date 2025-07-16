import { env } from "@/env";
import { Toolkits } from "./shared";
import { allClientToolkits } from "./client";

const enabledToolkitIdsFromEnv = (env.CLIENT_AVAILABLE_TOOLKITS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const shouldEnableAllToolkits = enabledToolkitIdsFromEnv.length === 0;

export const AVAILABLE_TOOLKIT_IDS = shouldEnableAllToolkits
  ? (Object.values(Toolkits) as Toolkits[])
  : enabledToolkitIdsFromEnv.filter((id): id is Toolkits =>
      Object.values(Toolkits).includes(id as Toolkits),
    );

export const availableToolkits = Object.fromEntries(
  Object.entries(allClientToolkits).filter(([id]) =>
    AVAILABLE_TOOLKIT_IDS.includes(id as Toolkits),
  ),
);
