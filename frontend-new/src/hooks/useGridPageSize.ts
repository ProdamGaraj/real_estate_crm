import { useCallback, useState } from 'react';

/**
 * Сколько строк показывать в таблице — с запоминанием выбора пользователя.
 *
 * По умолчанию во всех списках стояли 10 строк, и выбор «50» сбрасывался
 * при каждом переходе на страницу. Значение хранится в localStorage по
 * ключу таблицы, поэтому у каждого списка свой размер страницы.
 */

export const DEFAULT_PAGE_SIZE = 25;

const storageKeyFor = (table: string) => `crm:pageSize:${table}`;

const readStored = (table: string, fallback: number) => {
  try {
    const stored = Number(localStorage.getItem(storageKeyFor(table)));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  } catch {
    // Приватный режим или запрет на хранилище — работаем со значением по умолчанию
    return fallback;
  }
};

export function useGridPageSize(table: string, fallback: number = DEFAULT_PAGE_SIZE) {
  const [pageSize, setPageSizeState] = useState(() => readStored(table, fallback));

  const setPageSize = useCallback((value: number) => {
    setPageSizeState(value);
    try {
      localStorage.setItem(storageKeyFor(table), String(value));
    } catch {
      // Не сохранилось — размер страницы останется только на эту сессию
    }
  }, [table]);

  return { pageSize, setPageSize };
}

export default useGridPageSize;
