#!/usr/bin/env bash
# Сборка самодостаточных HTML-инструкций из общего каркаса (head.html, tail.html)
# и текстов разделов (body-*.html). Запуск:  bash docs/_src/build.sh
set -euo pipefail

src="$(cd "$(dirname "$0")" && pwd)"
out="$(dirname "$src")"

build () {          # $1=имя body-файла  $2=lang  $3=<title>  $4=итоговый файл
  {
    printf '<!doctype html>\n<html lang="%s">\n<head>\n<title>%s</title>\n' "$2" "$3"
    cat "$src/head.html"
    printf '</head>\n<body>\n'
    cat "$src/body-$1.html"
    cat "$src/tail.html"
    printf '</body>\n</html>\n'
  } > "$out/$4"
  printf '  %-42s %6s KB\n' "$4" "$(( $(wc -c < "$out/$4") / 1024 ))"
}

echo "Сборка инструкций:"
build manager-ru       ru "Руководство менеджера по продажам"     "Инструкция-Менеджер-RU.html"
build manager-uz       uz "Sotuv menejeri uchun qo'llanma"        "Yoriqnoma-Menejer-UZ.html"
build head-ru          ru "Руководство руководителя отдела"       "Инструкция-Руководитель-RU.html"
build head-uz          uz "Bo'lim boshlig'i uchun qo'llanma"      "Yoriqnoma-Boshliq-UZ.html"
build admin-ru         ru "Руководство администратора CRM"        "Инструкция-Администратор-RU.html"
build admin-uz         uz "CRM administratori uchun qo'llanma"    "Yoriqnoma-Administrator-UZ.html"
build docs-ru          ru "Руководство отдела оформления"         "Инструкция-Оформление-RU.html"
build docs-uz          uz "Rasmiylashtirish bo'limi qo'llanmasi"  "Yoriqnoma-Rasmiylashtirish-UZ.html"
build finance-ru       ru "Руководство финансиста"                "Инструкция-Финансист-RU.html"
build finance-uz       uz "Moliyachi uchun qo'llanma"             "Yoriqnoma-Moliyachi-UZ.html"
build viewer-ru        ru "Руководство наблюдателя"               "Инструкция-Наблюдатель-RU.html"
build viewer-uz        uz "Kuzatuvchi uchun qo'llanma"            "Yoriqnoma-Kuzatuvchi-UZ.html"
# Указатель: инструкции по ролям и проектная документация
cp "$src/index.html" "$out/index.html"
printf '  %-42s %6s KB
' "index.html" "$(( $(wc -c < "$out/index.html") / 1024 ))"
echo "Готово."
