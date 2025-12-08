/**
 * Скрипт для разбиения больших файлов локализации на модули
 * Запуск: node scripts/split-locales.cjs
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const LANGUAGES = ['ru', 'en', 'uz'];

// Структура модулей - какие ключи куда переносим (теперь flatten = true извлекает значения напрямую)
const MODULE_MAPPING = {
  // common.json - общие переводы (flatten - извлекаем содержимое ключей напрямую)
  'common': {
    keys: ['common', 'validation', 'errors', 'table', 'months', 'weekdays', 'calendar', 'quarters'],
    flatten: true, // Объединяем все в плоскую структуру
  },
  // nav.json - навигация
  'nav': {
    extractFrom: 'nav',
  },
  // auth.json - авторизация  
  'auth': {
    extractFrom: 'auth',
  },
  // permissions.json - управление правами доступа
  'permissions': {
    extractFrom: 'pages.settings.permissions',
  },
  // clients.json - клиенты
  'clients': {
    extractFrom: 'pages.clients',
  },
  // applications.json - заявки
  'applications': {
    extractFrom: 'pages.applications',
  },
  // meetings.json - встречи
  'meetings': {
    extractFrom: 'pages.meetings',
  },
  // tasks.json - задачи
  'tasks': {
    extractFrom: 'pages.tasks',
  },
  // deals.json - сделки
  'deals': {
    extractFrom: 'pages.deals',
    mergeWith: ['deal_cancellation'],
  },
  // projects.json - проекты
  'projects': {
    extractFrom: 'pages.projects',
  },
  // buildings.json - здания
  'buildings': {
    extractFrom: 'pages.buildings',
    mergeWith: ['pages.properties', 'property_types'],
  },
  // finances.json - финансы
  'finances': {
    extractFrom: 'pages.finances',
    mergeWith: ['pages.payments'],
  },
  // reports.json - отчёты
  'reports': {
    extractFrom: 'pages.reports',
  },
  // discounts.json - скидки
  'discounts': {
    extractFrom: 'pages.discounts',
  },
  // documents.json - документы
  'documents': {
    keys: ['documents', 'files', 'template_tags'],
    mergeWith: ['pages.templates'],
    flatten: true,
  },
  // dashboard.json - дашборд
  'dashboard': {
    extractFrom: 'pages.dashboard',
  },
  // api_keys.json - API ключи
  'api_keys': {
    extractFrom: 'pages.api_keys',
  },
  // settings.json - настройки (общие, без permissions)
  'settings': {
    extractFrom: 'pages.settings',
    excludeKeys: ['permissions'],
  },
  // statuses.json - статусы
  'statuses': {
    keys: ['statuses', 'resources', 'logs'],
    flatten: true,
  },
  // forms.json - формы
  'forms': {
    extractFrom: 'forms',
  },
};

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function extractModule(sourceData, moduleConfig) {
  let result = {};
  
  // Извлекаем по extractFrom (вложенный путь) - возвращает напрямую содержимое
  if (moduleConfig.extractFrom) {
    const data = getNestedValue(sourceData, moduleConfig.extractFrom);
    if (data) {
      if (moduleConfig.excludeKeys) {
        const filtered = { ...data };
        moduleConfig.excludeKeys.forEach(key => delete filtered[key]);
        result = { ...result, ...filtered };
      } else {
        result = { ...result, ...data };
      }
    }
  }
  
  // Извлекаем по ключам и объединяем
  if (moduleConfig.keys) {
    moduleConfig.keys.forEach(key => {
      const data = key.includes('.') 
        ? getNestedValue(sourceData, key)
        : sourceData[key];
      
      if (data) {
        if (moduleConfig.flatten) {
          // Объединяем содержимое напрямую
          result = { ...result, ...data };
        } else {
          // Сохраняем как вложенный ключ
          const lastKey = key.split('.').pop();
          result[lastKey] = data;
        }
      }
    });
  }
  
  // Merge дополнительных ключей
  if (moduleConfig.mergeWith) {
    moduleConfig.mergeWith.forEach(key => {
      const data = key.includes('.')
        ? getNestedValue(sourceData, key)
        : sourceData[key];
      if (data) {
        result = { ...result, ...data };
      }
    });
  }
  
  return result;
}

function processLanguage(lang) {
  const sourceFile = path.join(LOCALES_DIR, `${lang}.json`);
  let sourceData;
  
  try {
    let content = fs.readFileSync(sourceFile, 'utf8');
    // Удаляем BOM если есть
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.substring(1);
    }
    sourceData = JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${sourceFile}:`, error.message);
    return;
  }
  
  // Создаём папку для языка
  const langDir = path.join(LOCALES_DIR, lang);
  if (!fs.existsSync(langDir)) {
    fs.mkdirSync(langDir, { recursive: true });
  }
  
  // Обрабатываем каждый модуль
  Object.entries(MODULE_MAPPING).forEach(([moduleName, moduleConfig]) => {
    const moduleData = extractModule(sourceData, moduleConfig);
    
    if (Object.keys(moduleData).length > 0) {
      const moduleFile = path.join(langDir, `${moduleName}.json`);
      fs.writeFileSync(moduleFile, JSON.stringify(moduleData, null, 2), 'utf8');
      console.log(`✓ Created ${lang}/${moduleName}.json (${Object.keys(moduleData).length} keys)`);
    } else {
      console.log(`⚠ Skipped ${lang}/${moduleName}.json (no data)`);
    }
  });
}

console.log('Splitting locale files into modules...\n');

LANGUAGES.forEach(lang => {
  console.log(`\n=== Processing ${lang.toUpperCase()} ===`);
  processLanguage(lang);
});

console.log('\n✅ Done! Now update src/i18n/config.ts to use namespaces.');
