const STORAGE_KEY = 'bannerStudio.apiConfig';
const DEFAULT_CONFIG = {
    provider: 'gemini',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    apiKeys: [],
    apiKeyIndex: 0,
    lastKeyReset: '',
    model: 'gemini-3-pro-image-preview'
};

const form = document.getElementById('settingsForm');
const apiKeyInput1 = document.getElementById('apiKey1');
const apiKeyInput2 = document.getElementById('apiKey2');
const apiKeyInput3 = document.getElementById('apiKey3');
const testBtn = document.getElementById('testBtn');
const configStatus = document.getElementById('configStatus');
const toast = document.getElementById('toast');

function loadConfig() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeConfig({ ...DEFAULT_CONFIG });
    try {
        return normalizeConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
    } catch (error) {
        return normalizeConfig({ ...DEFAULT_CONFIG });
    }
}

function saveConfig(config) {
    const payload = {
        ...DEFAULT_CONFIG,
        ...config
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    try {
        window.name = JSON.stringify({ [STORAGE_KEY]: payload });
    } catch (error) {
        // ignore
    }
}

function updateStatus(config) {
    const ready = Boolean(config.apiKeys?.length);
    configStatus.textContent = ready ? '保存済み' : '未保存';
    configStatus.classList.toggle('ready', ready);
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
}

function init() {
    const config = loadConfig();
    const keys = config.apiKeys || [];
    if (apiKeyInput1) apiKeyInput1.value = keys[0] || '';
    if (apiKeyInput2) apiKeyInput2.value = keys[1] || '';
    if (apiKeyInput3) apiKeyInput3.value = keys[2] || '';
    updateStatus(config);
}

form.addEventListener('submit', (event) => {
    event.preventDefault();

    const apiKeys = collectApiKeys();
    if (!apiKeys.length) {
        showToast('Gemini APIキーを入力してください');
        return;
    }
    if (!apiKeys.every(isLikelyGeminiKey)) {
        showToast('APIキーの形式が正しくありません (AIza... を入力)');
        return;
    }

    const nextConfig = {
        apiKeys,
        apiKey: apiKeys[0],
        apiKeyIndex: 0,
        lastKeyReset: getTodayString()
    };

    saveConfig(nextConfig);
    updateStatus(nextConfig);
    showToast('設定を保存しました');
});

form.addEventListener('input', () => {
    configStatus.textContent = '未保存';
    configStatus.classList.remove('ready');
});

testBtn.addEventListener('click', async () => {
    const apiKeys = collectApiKeys();
    const apiKey = apiKeys[0] || '';
    if (!apiKey) {
        showToast('Gemini APIキーを入力してください');
        return;
    }
    if (!isLikelyGeminiKey(apiKey)) {
        showToast('APIキーの形式が正しくありません (AIza... を入力)');
        return;
    }

    try {
        const url = `${DEFAULT_CONFIG.apiBaseUrl}/models?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, { method: 'GET' });
        if (response.ok) {
            showToast('接続に成功しました');
        } else {
            showToast(`接続に失敗しました (${response.status})`);
        }
    } catch (error) {
        showToast('接続に失敗しました (CORSまたはネットワーク)');
    }
});

function isLikelyGeminiKey(key) {
    if (key.includes('gemini-')) return false;
    return key.startsWith('AIza');
}

function collectApiKeys() {
    const inputs = [apiKeyInput1, apiKeyInput2, apiKeyInput3].filter(Boolean);
    return inputs
        .map((input) => input.value.trim())
        .filter((value) => value.length > 0);
}

function normalizeConfig(config) {
    const merged = { ...DEFAULT_CONFIG, ...config };
    const candidateKeys = [];
    if (Array.isArray(merged.apiKeys)) {
        candidateKeys.push(...merged.apiKeys);
    }
    if (merged.apiKey) {
        candidateKeys.push(merged.apiKey);
    }
    const uniqueKeys = [...new Set(candidateKeys.map((key) => key.trim()).filter(Boolean))];
    return {
        ...merged,
        apiKeys: uniqueKeys,
        apiKey: uniqueKeys[0] || ''
    };
}

function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

init();
