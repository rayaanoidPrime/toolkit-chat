import React from "react";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export const Logo: React.FC<Props> = ({ className }) => {
  return (
    <>
      <Image
        src="/logo/favicon.svg"
        alt="Toolkit.dev"
        width={100}
        height={100}
        className={cn(className, "dark:hidden")}
      />
      <Image
        src="/logo/favicon.svg"
        alt="Toolkit.dev"
        width={100}
        height={100}
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
};
