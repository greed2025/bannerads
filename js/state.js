const STORAGE_KEYS = {
    apiConfig: 'bannerStudio.apiConfig',
    uiState: 'bannerStudio.uiState'
};

const DEFAULT_CONFIG = {
    provider: 'gemini',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    apiKeys: [],
    apiKeyIndex: 0,
    lastKeyReset: '',
    model: 'gemini-3-pro-image-preview'
};

export function loadApiConfig() {
    const saved = safeParse(localStorage.getItem(STORAGE_KEYS.apiConfig));
    return { ...DEFAULT_CONFIG, ...saved };
}

export function saveApiConfig(config) {
    localStorage.setItem(STORAGE_KEYS.apiConfig, JSON.stringify({
        ...DEFAULT_CONFIG,
        ...config
    }));
}

export function loadUiState() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.uiState)) || {};
}

export function saveUiState(state) {
    localStorage.setItem(STORAGE_KEYS.uiState, JSON.stringify(state));
}

function safeParse(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}
