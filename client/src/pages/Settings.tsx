import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Check, X, Trash2, Key, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ApiKey {
  id: string;
  provider: "youtube" | "claude";
  isValid: boolean;
  lastValidatedAt: Date;
  quotaStatus: string | null;
  createdAt: Date;
}

export default function Settings() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [provider, setProvider] = useState<"youtube" | "claude">("youtube");
  const [apiKey, setApiKey] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  
  // Check if user is the developer
  const isDeveloper = user && (user as any).email === "wamkris@gmail.com";

  // Fetch user's API keys
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/keys"],
    enabled: !!user,
  });

  // Validate API key mutation
  const validateMutation = useMutation({
    mutationFn: async () => {
      setIsValidating(true);
      const response = await fetch("/api/keys/validate", {
        method: "POST",
        body: JSON.stringify({ provider, apiKey }),
        headers: { "Content-Type": "application/json" },
      });
      setIsValidating(false);
      
      if (!response.ok) {
        throw new Error("Validation failed");
      }
      
      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.valid) {
        toast({
          title: "API Key Valid",
          description: `Your ${provider === "youtube" ? "YouTube" : "Claude"} API key is valid and ready to use.`,
        });
        // Automatically save the key
        saveMutation.mutate();
      } else {
        toast({
          title: "Invalid API Key",
          description: data.error || "The API key you provided is not valid.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      setIsValidating(false);
      toast({
        title: "Validation Failed",
        description: "Failed to validate your API key. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Save API key mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/keys", {
        method: "POST",
        body: JSON.stringify({ provider, apiKey }),
        headers: { "Content-Type": "application/json" },
      });
      
      if (!response.ok) {
        throw new Error("Save failed");
      }
      
      return await response.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      setApiKey("");
      toast({
        title: "API Key Saved",
        description: `Your ${provider === "youtube" ? "YouTube" : "Claude"} API key has been securely stored.`,
      });
      
      // Check if there's a pending learning request
      const pendingRequest = localStorage.getItem('pendingLearningRequest');
      if (pendingRequest) {
        // Wait a bit for the query to update
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Fetch updated keys to check if both are present
        const response = await fetch("/api/keys");
        if (response.ok) {
          const keys = await response.json();
          const hasYouTube = keys.some((k: any) => k.provider === "youtube" && k.isValid);
          const hasClaude = keys.some((k: any) => k.provider === "claude" && k.isValid);
          
          // Only redirect if BOTH YouTube and Claude keys are present
          if (hasYouTube && hasClaude) {
            toast({
              title: "All Set!",
              description: "Taking you back to process your search request.",
            });
            
            setTimeout(() => {
              window.location.href = "/";
            }, 1500);
          } else {
            // Still missing a key - show helpful message
            const missing = !hasYouTube ? "YouTube" : "Claude";
            toast({
              title: "One more step!",
              description: `Please add your ${missing} API key to continue.`,
            });
          }
        }
      }
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save your API key. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete API key mutation
  const deleteMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await fetch(`/api/keys/${keyId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error("Delete failed");
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      toast({
        title: "API Key Deleted",
        description: "Your API key has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete the API key. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="loading-settings">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container max-w-4xl mx-auto p-6">
        <Alert data-testid="alert-login-required">
          <AlertDescription>
            Please log in to manage your API keys. API keys allow you to use your own YouTube and Claude API quotas.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const youtubeKeys = apiKeys.filter(k => k.provider === "youtube");
  const claudeKeys = apiKeys.filter(k => k.provider === "claude");

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold" data-testid="heading-settings">Settings</h1>
        <p className="text-muted-foreground">
          Manage your API keys to use your own quotas for YouTube and Claude services.
        </p>
      </div>

      {/* Important Notice for Non-Developer Users */}
      {!isDeveloper && (
        <Alert className="border-amber-200 bg-amber-50" data-testid="alert-api-keys-required">
          <AlertDescription className="text-amber-900">
            <strong>⚠️ API Keys Required:</strong> To use the video curation feature, you must provide your own YouTube Data API v3 key and Claude (Anthropic) API key. 
            These keys are encrypted and stored securely for your personalized learning experience.
          </AlertDescription>
        </Alert>
      )}

      {/* Developer Notice */}
      {isDeveloper && (
        <Alert className="border-green-200 bg-green-50" data-testid="alert-developer-access">
          <AlertDescription className="text-green-900">
            <strong>✓ Developer Access:</strong> You can use the app with shared pool keys or add your own API keys for dedicated access.
          </AlertDescription>
        </Alert>
      )}

      {/* Add New API Key */}
      <Card data-testid="card-add-key">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Add API Key
          </CardTitle>
          <CardDescription>
            Bring your own YouTube or Claude API key to use your own quotas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">API Provider</Label>
            <Select value={provider} onValueChange={(value: "youtube" | "claude") => setProvider(value)}>
              <SelectTrigger id="provider" data-testid="select-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">YouTube Data API</SelectItem>
                <SelectItem value="claude">Claude (Anthropic)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder={provider === "youtube" ? "AIza..." : "sk-ant-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              data-testid="input-api-key"
            />
            <p className="text-sm text-muted-foreground">
              {provider === "youtube" ? (
                <>
                  Get your API key from the{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Google Cloud Console
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              ) : (
                <>
                  Get your API key from the{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Anthropic Console
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </p>
          </div>

          <Button
            onClick={() => validateMutation.mutate()}
            disabled={!apiKey || isValidating || validateMutation.isPending}
            className="w-full"
            data-testid="button-validate-save"
          >
            {isValidating || validateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating...
              </>
            ) : (
              "Validate & Save"
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Your API Keys */}
      <Card data-testid="card-your-keys">
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
          <CardDescription>
            API keys are stored securely and encrypted. You can delete them at any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keysLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-keys">
              No API keys added yet. Add your first key above to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {/* YouTube Keys */}
              {youtubeKeys.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">YouTube Data API</h3>
                  {youtubeKeys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`key-youtube-${key.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {key.isValid ? (
                          <Check className="h-5 w-5 text-green-600" data-testid="icon-valid" />
                        ) : (
                          <X className="h-5 w-5 text-red-600" data-testid="icon-invalid" />
                        )}
                        <div>
                          <p className="text-sm font-medium">YouTube API Key</p>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(key.createdAt).toLocaleDateString()}
                            {key.quotaStatus && ` • ${key.quotaStatus}`}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(key.id)}
                        disabled={deleteMutation.isPending}
                        data-testid="button-delete-key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Claude Keys */}
              {claudeKeys.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Claude (Anthropic)</h3>
                  {claudeKeys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`key-claude-${key.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {key.isValid ? (
                          <Check className="h-5 w-5 text-green-600" data-testid="icon-valid" />
                        ) : (
                          <X className="h-5 w-5 text-red-600" data-testid="icon-invalid" />
                        )}
                        <div>
                          <p className="text-sm font-medium">Claude API Key</p>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(key.createdAt).toLocaleDateString()}
                            {key.quotaStatus && ` • ${key.quotaStatus}`}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(key.id)}
                        disabled={deleteMutation.isPending}
                        data-testid="button-delete-key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • Your API keys are encrypted using AES-256-GCM before being stored in the database
          </p>
          <p>
            • When you make requests, your own API keys are used instead of the shared pool
          </p>
          <p>
            • If your key reaches its quota limit, the system automatically falls back to the shared pool
          </p>
          <p>
            • You can delete your keys at any time, and the encrypted data will be permanently removed
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
