import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Platform } from "./Platform";
import { HospitalCommand } from "./hospital/HospitalCommand";
import { ControlRoom } from "./command/ControlRoom";
import { MotionConfig } from "framer-motion";
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});
const command =
  !location.pathname.startsWith("/driver") &&
  !location.pathname.startsWith("/hospital") &&
  !location.pathname.startsWith("/citizen") &&
  !location.pathname.startsWith("/emergency-track") &&
  !location.pathname.startsWith("/legacy-operations") &&
  !location.pathname.startsWith("/legacy-hospital");
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        {location.pathname.startsWith("/hospital") ? (
          <HospitalCommand />
        ) : command ? (
          <ControlRoom />
        ) : (
          <Platform />
        )}
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);
