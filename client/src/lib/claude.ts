import { apiRequest } from "./queryClient";
import type { LearningInterestForm } from "@shared/schema";
import type { CurationResponse, RefreshResponse } from "../types/video";

export async function curateVideos(formData: LearningInterestForm): Promise<CurationResponse> {
  const response = await apiRequest("POST", "/api/curate-videos", formData);
  return response.json();
}

export async function refreshVideos(preferenceId: string): Promise<RefreshResponse> {
  const response = await apiRequest("POST", `/api/refresh-videos/${preferenceId}`);
  return response.json();
}
