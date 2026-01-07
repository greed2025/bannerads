const STORAGE_KEY = 'bannerStudio.apiConfig';
const DEFAULT_CONFIG = {
    provider: 'gemini',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    model: 'gemini-3-pro-image-preview'
};

const form = document.getElementById('settingsForm');
const apiKeyInput = document.getElementById('apiKey');
const testBtn = document.getElementById('testBtn');
const configStatus = document.getElementById('configStatus');
const toast = document.getElementById('toast');

function loadConfig() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (error) {
        return { ...DEFAULT_CONFIG };
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
    const ready = Boolean(config.apiKey);
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
    apiKeyInput.value = config.apiKey || '';
    updateStatus(config);
}

form.addEventListener('submit', (event) => {
    event.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        showToast('Gemini APIキーを入力してください');
        return;
    }
    if (!isLikelyGeminiKey(apiKey)) {
        showToast('APIキーの形式が正しくありません (AIza... を入力)');
        return;
    }

    saveConfig({ apiKey });
    updateStatus({ apiKey });
    showToast('設定を保存しました');
});

form.addEventListener('input', () => {
    configStatus.textContent = '未保存';
    configStatus.classList.remove('ready');
});

testBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
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

init();
