import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AuthButtons } from "../auth/auth-buttons";
import { providers } from "@/server/auth/providers";
import { Logo } from "@/components/ui/logo";
import { VStack } from "@/components/ui/stack";
import { env } from "@/env";

interface AuthModalProps {
  children: React.ReactNode;
}

export const AuthModal = ({ children }: AuthModalProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent showCloseButton={false} className="gap-6">
        <DialogHeader className="items-center gap-2">
          <Logo className="size-16" />
          <VStack>
            <DialogTitle className="text-primary text-xl">
              Sign in to {env.NEXT_PUBLIC_CHATBOT_NAME ?? "Toolkit"}
            </DialogTitle>
            <DialogDescription className="hidden">
              Sign in to your account to get started with{" "}
              {env.NEXT_PUBLIC_CHATBOT_NAME ?? "Toolkit"}.
            </DialogDescription>
          </VStack>
        </DialogHeader>
        <AuthButtons
          providers={providers.map((provider) => ({
            name: provider.name,
            id: provider.id,
          }))}
        />
      </DialogContent>
    </Dialog>
  );
};
