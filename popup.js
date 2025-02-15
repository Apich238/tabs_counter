// Добавляем список поддерживаемых языков
const supportedLangs = ['en', 'ru', 'de', 'fr', 'es'];

function initLocalization() {
    chrome.storage.local.get('userLang', ({ userLang }) => {
        // Получаем язык браузера без региона
        const browserLang = chrome.i18n.getUILanguage().split('-')[0];
        const defaultLang = supportedLangs.includes(browserLang) ? browserLang : 'en';
        const finalLang = userLang || defaultLang;
        
        // Применяем переводы
        applyTranslations();
        
    });
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const messageKey = element.getAttribute('data-i18n');
        const translation = chrome.i18n.getMessage(messageKey);
        element.textContent = translation || `[${messageKey}]`; // Отладка отсутствующих ключей
    });
}

let updateInProgress = false;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getDomain(url) {
    if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
        return chrome.i18n.getMessage('unknownDomain');
    }
    
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^(www\.|m\.)/, '');
    } catch {
        return chrome.i18n.getMessage('unknownDomain');
    }
}

function getTopDomains(domains, limit = 3) {
    const entries = Object.entries(domains)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);

    const ol = document.createElement('ol');
    ol.className = 'domain-list';
    
    entries.forEach(([domain, count], index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="domain-name">${index + 1}. ${escapeHtml(domain)}</span>
            <span class="domain-count">${count}</span>
        `;
        ol.appendChild(li);
    });
    
    return ol;
}

function processTabs(tabs) {
    const result = {
        normal: { domains: {}, count: 0 },
        incognito: { domains: {}, count: 0 }
    };

    tabs.forEach(tab => {
        const mode = tab.incognito ? 'incognito' : 'normal';
        result[mode].count++;
        
        const domain = getDomain(tab.url) || chrome.i18n.getMessage('unknownDomain');
        result[mode].domains[domain] = (result[mode].domains[domain] || 0) + 1;
    });

    return result;
}

async function updateStatistics() {
    if (updateInProgress) return;
    updateInProgress = true;

    try {
        const [allTabs, allWindows] = await Promise.all([
            chrome.tabs.query({}),
            chrome.windows.getAll({ populate: false })
        ]);

        const { normal, incognito } = processTabs(allTabs);
        const windowCounts = allWindows.reduce((acc, window) => {
            window.incognito ? acc.incognito++ : acc.normal++;
            return acc;
        }, { normal: 0, incognito: 0 });

        // Обновляем счетчики
        document.getElementById('normal-tab-count').textContent = normal.count;
        document.getElementById('incognito-tab-count').textContent = incognito.count;
        document.getElementById('normal-window-count').textContent = windowCounts.normal;
        document.getElementById('incognito-window-count').textContent = windowCounts.incognito;

        // Обновляем списки доменов
        const updateTopList = (elementId, data) => {
            const container = document.getElementById(elementId);
            container.innerHTML = '';
            
            if (data.count > 0) {
                const list = getTopDomains(data.domains);
                list ? container.appendChild(list) : 
                    (container.textContent = 'Нет вкладок');
            } else {
                container.textContent = 'Нет вкладок';
            }
        };

        // Скрываем/показываем колонку инкогнито
        const incognitoColumn = document.querySelector('[data-mode="incognito"]');
        incognitoColumn.style.display = windowCounts.incognito > 0 ? 'block' : 'none';

        updateTopList('normal-top-domains', normal);
        updateTopList('incognito-top-domains', incognito);

    } finally {
        updateInProgress = false;
    }
}

// Инициализация
document.getElementById('refresh-btn').addEventListener('click', updateStatistics);

// Обработчики событий
chrome.tabs.onCreated.addListener(updateStatistics);
chrome.tabs.onRemoved.addListener(updateStatistics);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
        updateStatistics();
    }
});

chrome.windows.onCreated.addListener(updateStatistics);
chrome.windows.onRemoved.addListener(updateStatistics);

// Первоначальный вызов и интервал
updateStatistics();
setInterval(updateStatistics, 20000);

initLocalization();