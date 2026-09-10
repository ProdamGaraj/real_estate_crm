/**
 * Access-токен живёт только в памяти вкладки.
 *
 * Раньше оба токена лежали в localStorage: их читал любой скрипт на странице,
 * и одной XSS хватало, чтобы забрать сессию на сутки вперёд. Теперь
 * refresh-токен хранится в httpOnly-cookie (JavaScript его не видит),
 * а короткоживущий access — здесь, в замыкании модуля.
 *
 * Побочный эффект: после перезагрузки страницы токена нет. Сессия
 * восстанавливается обменом cookie на новый access — см. restoreSession().
 */

let accessToken: string | null = null;

export const getAccessToken = (): string | null => accessToken;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const clearAccessToken = (): void => {
  accessToken = null;
};
