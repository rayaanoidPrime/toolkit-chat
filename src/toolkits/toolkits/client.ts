import type { ClientToolkit } from "../types";
import {
  Toolkits,
  CLIENT_AVAILABLE_TOOLKIT_IDS,
  type ClientAvailableToolkits,
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

// Define the type for the filtered client toolkits
type FilteredClientToolkits = Pick<ClientToolkits, ClientAvailableToolkits>;

// All client toolkits (complete mapping)
const allClientToolkits: ClientToolkits = {
  [Toolkits.E2B]: e2bClientToolkit,
  [Toolkits.GoogleDrive]: googleDriveClientToolkit,
  [Toolkits.Github]: githubClientToolkit,
  [Toolkits.GoogleCalendar]: googleCalendarClientToolkit,
  [Toolkits.Notion]: notionClientToolkit,
  [Toolkits.Exa]: exaClientToolkit,
  [Toolkits.Image]: imageClientToolkit,
  [Toolkits.Memory]: mem0ClientToolkit,
};

// Filter client toolkits based on available ones
export const clientToolkits: FilteredClientToolkits = Object.fromEntries(
  CLIENT_AVAILABLE_TOOLKIT_IDS.map((toolkitId) => [
    toolkitId,
    allClientToolkits[toolkitId],
  ]),
) as Pick<ClientToolkits, ClientAvailableToolkits>;

// Updated function to work with available toolkits only
export function getClientToolkit<T extends ClientAvailableToolkits>(
  server: T,
): ClientToolkit<ServerToolkitNames[T], ServerToolkitParameters[T]> {
  return clientToolkits[server] as ClientToolkit<
    ServerToolkitNames[T],
    ServerToolkitParameters[T]
  >;
}
