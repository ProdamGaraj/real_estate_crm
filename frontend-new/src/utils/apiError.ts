// real_estate_crm/frontend-new/src/utils/apiError.ts

/**
 * Достаёт из ответа сервера текст, который стоит показать человеку.
 *
 * Формы показывали общее «произошла ошибка», хотя сервер объясняет причину:
 * «Укажите причину: она нужна для аналитики отказов», «Сумма платежей не
 * совпадает со стоимостью по договору», «Объект недоступен для брони».
 * Эти подсказки до пользователя не доходили, и он не понимал, что исправить.
 *
 * DRF отвечает по-разному в зависимости от того, где сработала проверка:
 *
 *   { "error": "текст" }                       — ручные проверки во views
 *   { "detail": "текст" }                      — отказ в правах, 404
 *   { "contract_price": ["текст", "текст"] }   — валидация поля сериализатора
 *   { "non_field_errors": ["текст"] }          — валидация всего объекта
 *   [ "текст" ]                                — сериализатор со списком
 *
 * Разбираем все формы, а если не нашли ничего осмысленного — отдаём
 * запасной текст, переданный вызывающим кодом.
 */

/** Поля, которые несут сообщение целиком, а не ошибку конкретного поля */
const WHOLE_MESSAGE_KEYS = ['error', 'detail', 'message', 'non_field_errors'];

function flatten(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flatten);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(flatten);
  }
  return [];
}

export function extractApiError(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;

  if (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')) {
    return data.trim();
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    // Сообщения об ошибке целиком показываем первыми — они самые понятные
    for (const key of WHOLE_MESSAGE_KEYS) {
      const found = flatten(record[key]);
      if (found.length) {
        return found.join(' ');
      }
    }

    // Иначе собираем ошибки полей: «поле: текст», чтобы было видно, где искать
    const fieldMessages = Object.entries(record)
      .filter(([key]) => !WHOLE_MESSAGE_KEYS.includes(key))
      .flatMap(([, value]) => flatten(value));

    if (fieldMessages.length) {
      return fieldMessages.join(' ');
    }
  }

  if (Array.isArray(data)) {
    const found = flatten(data);
    if (found.length) {
      return found.join(' ');
    }
  }

  return fallback;
}
