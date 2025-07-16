import React from "react";
import { HeroSection } from "./hero";
import { WorkbenchSection } from "./workbenches";
import { DependenciesSection } from "./dependencies";
import { Navbar } from "./navbar";

export const LandingPage: React.FC = () => {
  return (
    <div className="h-fit min-h-screen">
      <Navbar />
      <HeroSection />
      <DependenciesSection />
      <WorkbenchSection />
      <footer className="text-muted-foreground bg-background mt-12 w-full border-t py-6 text-center text-sm">
        <div>
          <strong>Futurelab Chat</strong> is a highly configurable AI chat
          platform designed for modern teams, enabling seamless productivity.{" "}
          <br />
          Built by{" "}
          <a
            href="https://futurelabstudios.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary underline"
          >
            Futurelab Studios
          </a>
          .
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
