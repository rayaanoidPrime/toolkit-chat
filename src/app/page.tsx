import { Chat } from "@/app/_components/chat";
import { auth } from "@/server/auth";
import { generateUUID } from "@/lib/utils";
import LandingPage from "./_components/landing-page";
import { env } from "@/env";

export default async function Page() {
  const session = await auth();
  const chatbotName = env.NEXT_PUBLIC_CHATBOT_NAME;

  if (!session) {
    return <LandingPage />;
  }

  const id = generateUUID();

  return (
    <Chat
      key={id}
      id={id}
      initialVisibilityType="private"
      isReadonly={false}
      isNew={true}
      chatbotName={chatbotName}
    />
  );
}
