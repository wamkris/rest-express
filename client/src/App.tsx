import { Switch, Route } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import VideosPage from "@/pages/videos";
import Settings from "@/pages/Settings";
import PlayerPage from "@/pages/PlayerPage";
import NotFound from "@/pages/not-found";
import { initializeNotificationSystem } from "./lib/notifications";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/videos/:preferenceId">
        {(params) => <VideosPage preferenceId={params.preferenceId} />}
      </Route>
      <Route path="/player/:videoId">
        {(params) => <PlayerPage videoId={params.videoId} />}
      </Route>
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // Initialize notification system when app loads
    initializeNotificationSystem();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="max-w-md mx-auto bg-white min-h-screen">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
