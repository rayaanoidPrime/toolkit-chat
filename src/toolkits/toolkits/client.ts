import type { ClientToolkit } from "../types";
import {
  Toolkits,
  type ServerToolkitNames,
  type ServerToolkitParameters,
} from "./shared";
import { exaClientToolkit } from "./exa/client";
import { imageClientToolkit } from "./image/client";
import { githubClientToolkit } from "./github/client";
import { googleCalendarClientToolkit } from "./google-calendar/client";
import { googleDriveClientToolkit } from "./google-drive/client";
import { mem0ClientToolkit } from "./mem0/client";
import { notionClientToolkit } from "./notion/client";
import { e2bClientToolkit } from "./e2b/client";

type ClientToolkits = {
  [K in Toolkits]: ClientToolkit<
    ServerToolkitNames[K],
    ServerToolkitParameters[K]
  >;
};

// All possible client toolkits
export const allClientToolkits: ClientToolkits = {
  [Toolkits.E2B]: e2bClientToolkit,
  [Toolkits.Memory]: mem0ClientToolkit,
  [Toolkits.Image]: imageClientToolkit,
  [Toolkits.Exa]: exaClientToolkit,
  [Toolkits.Github]: githubClientToolkit,
  [Toolkits.GoogleCalendar]: googleCalendarClientToolkit,
  [Toolkits.Notion]: notionClientToolkit,
  [Toolkits.GoogleDrive]: googleDriveClientToolkit,
};

const getAvailableToolkitIds = () => {
  if (typeof window === "undefined") {
    const enabledToolkitIdsFromEnv = (
      process.env.CLIENT_AVAILABLE_TOOLKITS ?? ""
    )
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const shouldEnableAllToolkits = enabledToolkitIdsFromEnv.length === 0;

    return shouldEnableAllToolkits
      ? (Object.values(Toolkits) as readonly Toolkits[])
      : (enabledToolkitIdsFromEnv.filter((id): id is Toolkits =>
          Object.values(Toolkits).includes(id as Toolkits),
        ) as readonly Toolkits[]);
  }
  return Object.values(Toolkits) as readonly Toolkits[];
};

const AVAILABLE_TOOLKIT_IDS = getAvailableToolkitIds();

// Filter the toolkits based on the environment variable
export const clientToolkits = Object.fromEntries(
  Object.entries(allClientToolkits).filter(([id]) =>
    AVAILABLE_TOOLKIT_IDS.includes(id as Toolkits),
  ),
) as Partial<ClientToolkits>;

export function getClientToolkit<T extends Toolkits>(
  server: T,
):
  | ClientToolkit<ServerToolkitNames[T], ServerToolkitParameters[T]>
  | undefined {
  return clientToolkits[server];
}
