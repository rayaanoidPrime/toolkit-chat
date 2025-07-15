import { Logo } from "@/components/ui/logo";
import { HStack } from "@/components/ui/stack";
import { ColorModeToggle } from "../../navbar/color-mode-toggle";
import { Button } from "@/components/ui/button";
import { AuthModal } from "../auth-modal";
import { env } from "@/env";

export const Navbar = () => {
  return (
    <HStack className="bg-background fixed top-0 z-50 w-full border-b py-2">
      <HStack className="container mx-auto justify-between px-2">
        <HStack>
          <Logo className="size-6" />
          <h1 className="shimmer-text overflow-hidden text-lg font-bold whitespace-nowrap">
            {env.NEXT_PUBLIC_CHATBOT_NAME ?? "Tolkit.dev"}
          </h1>
        </HStack>
        <HStack>
          <AuthModal>
            <Button className="user-message">Try it Out</Button>
          </AuthModal>
          <ColorModeToggle />
        </HStack>
      </HStack>
    </HStack>
  );
};
