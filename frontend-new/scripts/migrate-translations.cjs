/**
 * Скрипт для миграции переводов на namespaces
 * Автоматически заменяет старые пути переводов на новые с namespaces
 * 
 * Запуск: node scripts/migrate-translations.cjs
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const SRC_DIR = path.join(__dirname, '..', 'src');

// Маппинг старых путей на новые namespaces
const PATH_TO_NAMESPACE = {
  'pages.settings.permissions.': 'permissions:',
  'pages.clients.': 'clients:',
  'pages.applications.': 'applications:',
  'pages.meetings.': 'meetings:',
  'pages.tasks.': 'tasks:',
  'pages.deals.': 'deals:',
  'pages.projects.': 'projects:',
  'pages.buildings.': 'buildings:',
  'pages.properties.': 'buildings:',  // properties объединены с buildings
  'pages.finances.': 'finances:',
  'pages.payments.': 'finances:',      // payments объединены с finances
  'pages.reports.': 'reports:',
  'pages.discounts.': 'discounts:',
  'pages.templates.': 'documents:',    // templates в documents
  'pages.dashboard.': 'dashboard:',
  'pages.api_keys.': 'api_keys:',
  'pages.settings.': 'settings:',
  'common.': 'common:',
  'nav.': 'nav:',
  'auth.': 'auth:',
  'documents.': 'documents:',
  'files.': 'documents:',
  'statuses.': 'statuses:',
  'resources.': 'statuses:',
  'logs.': 'statuses:',
  'forms.': 'forms:',
  'validation.': 'common:',
  'errors.': 'common:',
  'table.': 'common:',
  'deal_cancellation.': 'deals:',
  'template_tags.': 'documents:',
  'property_types.': 'buildings:',
};

// Регулярное выражение для поиска вызовов t()
const TRANSLATION_REGEX = /t\(['"]([^'"]+)['"]\)/g;

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Находим все использования t() и заменяем пути
  const newContent = content.replace(TRANSLATION_REGEX, (match, translationKey) => {
    for (const [oldPath, newNamespace] of Object.entries(PATH_TO_NAMESPACE)) {
      if (translationKey.startsWith(oldPath)) {
        const newKey = translationKey.replace(oldPath, newNamespace);
        modified = true;
        return `t('${newKey}')`;
      }
    }
    return match;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    return true;
  }
  return false;
}

function findTsxFiles() {
  return glob.sync('**/*.tsx', {
    cwd: SRC_DIR,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });
}

console.log('Migrating translations to namespaces...\n');

const files = findTsxFiles();
let migratedCount = 0;

files.forEach(file => {
  try {
    if (migrateFile(file)) {
      const relativePath = path.relative(SRC_DIR, file);
      console.log(`✓ Migrated: ${relativePath}`);
      migratedCount++;
    }
  } catch (error) {
    console.error(`✗ Error processing ${file}:`, error.message);
  }
});

console.log(`\n✅ Done! Migrated ${migratedCount} files.`);
console.log('\n⚠️  Please review the changes and update useTranslation() calls manually:');
console.log('   Old: const { t } = useTranslation()');
console.log('   New: const { t } = useTranslation([\'namespace1\', \'namespace2\'])');
