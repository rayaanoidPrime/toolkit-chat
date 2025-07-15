import React from "react";

import { File, Brain, Image as ImageIcon } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Attachments } from "./attachments";
import { Memories } from "./memories";
import { Images } from "./images";
import { HStack } from "@/components/ui/stack";

const tabs = [
  // the end-user does not need to connect accounts
  // {
  //   label: "Connected Accounts",
  //   value: "connected-accounts",
  //   component: <ConnectedAccounts />,
  //   icon: <User />,
  // },
  {
    label: "Attachments",
    value: "attachments",
    component: <Attachments />,
    icon: <File />,
  },
  {
    label: "Memories",
    value: "memories",
    component: <Memories />,
    icon: <Brain />,
  },
  {
    label: "Images Generated",
    value: "images",
    component: <Images />,
    icon: <ImageIcon />,
  },
];

interface Props {
  defaultTab?: string;
}

export const AccountTabs: React.FC<Props> = ({ defaultTab }) => {
  return (
    <Tabs defaultValue={defaultTab ?? "connected-accounts"}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            <HStack className="gap-2">
              {tab.icon}
              {tab.label}
            </HStack>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-2">
          {tab.component}
        </TabsContent>
      ))}
    </Tabs>
  );
};
