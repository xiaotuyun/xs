export interface AiConfig {
  apiKey: string;
  model: string;
  customListUrl?: string;
  customBaseUrl?: string;
  useChatCompletions?: boolean;
}

export function getAiConfig(): AiConfig {
  const apiKey = localStorage.getItem('ai_novel_studio_apikey') || '';
  const model = localStorage.getItem('ai_novel_studio_model') || '';
  const customListUrl = localStorage.getItem('ai_novel_studio_custom_list_url') || '';
  const customBaseUrl = localStorage.getItem('ai_novel_studio_custom_base_url') || '';
  const savedUseChat = localStorage.getItem('ai_novel_studio_use_chat_completions');
  const useChatCompletions = savedUseChat === null ? true : savedUseChat === 'true';
  return { apiKey, model, customListUrl, customBaseUrl, useChatCompletions };
}

