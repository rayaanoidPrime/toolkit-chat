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
    </div>
  );
};

export default LandingPage;
