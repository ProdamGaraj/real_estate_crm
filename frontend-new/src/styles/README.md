# Руководство по использованию цветов в проекте

## 📂 Расположение файлов

- **Палитра цветов**: `src/styles/colors.css` - централизованный файл с CSS переменными
- **Тема MUI**: `src/theme.ts` - использует переменные из `colors.css`
- **Глобальные стили**: `src/index.css` - базовые стили с переменными

## 🎨 Основные цветовые переменные

### Бренд
```css
--color-primary        /* #D4A017 - Золотой основной */
--color-secondary      /* #2c3e50 - Серо-синий */
```

### Фоны
```css
--color-background-default   /* #f4f6f8 - Основной фон */
--color-background-paper     /* #ffffff - Фон карточек */
--color-background-total     /* #f0f0f0 - Фон итоговых строк */
```

### Текст
```css
--color-text-primary    /* #34495e - Основной текст */
--color-text-secondary  /* #7f8c8d - Вторичный текст */
--color-text-dark       /* #213547 - Темный текст */
```

### Состояния
```css
/* Успех */
--color-success-main, --color-success-light, --color-success-dark

/* Ошибка */
--color-error-main, --color-error-light, --color-error-lighter, --color-error-dark

/* Предупреждение */
--color-warning-main, --color-warning-light, --color-warning-dark

/* Информация */
--color-info-main, --color-info-light, --color-info-dark
```

### Бордеры
```css
--color-border-light    /* #eee */
--color-border-default  /* rgba(224, 224, 224, 1) */
--color-border-dark     /* rgba(0, 0, 0, 0.1) */
```

### Тени
```css
--shadow-small   /* 0 4px 12px rgba(0, 0, 0, 0.05) */
--shadow-medium  /* 0 8px 16px rgba(0, 0, 0, 0.1) */
--shadow-large   /* 0 12px 24px rgba(0, 0, 0, 0.15) */
```

### Градиенты
```css
--gradient-auth  /* linear-gradient(135deg, #667eea 0%, #764ba2 100%) */
```

## 💡 Примеры использования

### В CSS/SCSS
```css
.my-component {
  background-color: var(--color-background-paper);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-small);
}
```

### В Material-UI sx prop
```tsx
<Box sx={{ 
  backgroundColor: 'var(--color-background-paper)',
  border: '1px solid var(--color-border-light)',
  boxShadow: 'var(--shadow-small)'
}}>
  Content
</Box>
```

### В styled-components
```tsx
const StyledBox = styled(Box)`
  background-color: var(--color-background-paper);
  border: 1px solid var(--color-border-light);
`;
```

### В inline стилях (CSS-in-JS)
```tsx
<div style={{ 
  backgroundColor: 'var(--color-background-paper)',
  color: 'var(--color-text-primary)'
}}>
  Content
</div>
```

## ⚠️ Важные правила

1. **НЕ используйте хардкодные цвета** (`#fff`, `#000`, `rgb()`, `rgba()`) - используйте переменные
2. **Всегда используйте var()** при обращении к переменным: `var(--color-primary)`
3. **Для MUI компонентов** используйте тему где возможно: `color="primary"`, `color="error"` и т.д.
4. **Новые цвета** добавляйте в `colors.css`, а не в компоненты
5. **Семантические имена**: используйте переменные по назначению (например, `--color-error-light` для ошибок)

## 🔄 Миграция существующего кода

### Было (плохо)
```tsx
<Box sx={{ backgroundColor: '#f4f6f8' }}>
```

### Стало (хорошо)
```tsx
<Box sx={{ backgroundColor: 'var(--color-background-default)' }}>
```

### Было (плохо)
```tsx
boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
```

### Стало (хорошо)
```tsx
boxShadow: 'var(--shadow-small)'
```

## 🎯 Преимущества использования переменных

1. ✅ **Единая точка управления** - меняем цвет в одном месте
2. ✅ **Консистентность** - все компоненты используют одинаковые цвета
3. ✅ **Легкая поддержка темной темы** - достаточно переопределить переменные
4. ✅ **Читаемость кода** - `var(--color-primary)` понятнее чем `#D4A017`
5. ✅ **Простота рефакторинга** - можно быстро изменить всю палитру

## 📝 Добавление новых цветов

Если нужен новый цвет:

1. Откройте `src/styles/colors.css`
2. Добавьте переменную в соответствующую секцию
3. Дайте ей семантическое имя (например, `--color-highlight-blue`)
4. Добавьте комментарий с описанием использования
5. Используйте в компонентах через `var(--color-highlight-blue)`

Пример:
```css
/* ========== ДОПОЛНИТЕЛЬНЫЕ ЦВЕТА ========== */
--color-highlight-blue: #3498db;  /* Подсветка активных элементов */
```
