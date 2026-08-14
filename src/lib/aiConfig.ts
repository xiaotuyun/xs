export interface AiConfig {
  apiKey: string;
  model: string;
  selectedModels?: string[];
  customListUrl?: string;
  customBaseUrl?: string;
  useChatCompletions?: boolean;
}

export function getAiConfig(): AiConfig {
  const apiKey = localStorage.getItem('ai_novel_studio_apikey') || '';
  const model = localStorage.getItem('ai_novel_studio_model') || '';
  let selectedModels: string[] = [];
  try {
    const raw = localStorage.getItem('ai_novel_studio_selected_models');
    if (raw) selectedModels = JSON.parse(raw);
  } catch {}
  if (selectedModels.length === 0 && model) {
    selectedModels = [model];
  }
  const customListUrl = localStorage.getItem('ai_novel_studio_custom_list_url') || '';
  const customBaseUrl = localStorage.getItem('ai_novel_studio_custom_base_url') || '';
  const savedUseChat = localStorage.getItem('ai_novel_studio_use_chat_completions');
  const useChatCompletions = savedUseChat === null ? true : savedUseChat === 'true';
  return { apiKey, model, selectedModels, customListUrl, customBaseUrl, useChatCompletions };
}

export function switchActiveModel(newModel: string): void {
  if (!newModel) return;
  localStorage.setItem('ai_novel_studio_model', newModel.trim());
  window.dispatchEvent(new Event('storage'));
}

