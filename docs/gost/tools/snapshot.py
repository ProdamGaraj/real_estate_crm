# -*- coding: utf-8 -*-
"""
Снимок структуры системы для проектной документации.

Читает модели Django и маршруты API и сохраняет их в docs/gost/data/*.json.
Из этих файлов сборщик строит каталог таблиц БД, классификаторы и перечень
маршрутов. Так описание данных в документах берётся из кода, а не
переписывается руками, и не расходится с ним.

Запуск (из каталога backend, в окружении проекта):

    python ../docs/gost/tools/snapshot.py

Базу данных скрипт не открывает: ему нужны только описания моделей.
"""

import io
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'data'
BACKEND = HERE.parents[2] / 'backend'

sys.path.insert(0, str(BACKEND))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'real_estate_project.settings')
# Снимок не обращается к БД; SQLite избавляет от необходимости поднимать PostgreSQL
os.environ.setdefault('USE_SQLITE', 'True')

import django  # noqa: E402

django.setup()

from django.apps import apps  # noqa: E402
from django.db import models  # noqa: E402
from django.urls import URLPattern, URLResolver, get_resolver  # noqa: E402

PROJECT_APPS = ('realty', 'crm', 'deals', 'finances', 'tasks', 'documents', 'reports', 'permissions')


def field_info(f):
    info = {
        'name': f.name,
        'column': getattr(f, 'column', None),
        'type': f.get_internal_type(),
        'verbose': str(getattr(f, 'verbose_name', '') or ''),
        'help': str(getattr(f, 'help_text', '') or ''),
        'null': bool(getattr(f, 'null', False)),
        'blank': bool(getattr(f, 'blank', False)),
        'unique': bool(getattr(f, 'unique', False)),
        'primary_key': bool(getattr(f, 'primary_key', False)),
        'max_length': getattr(f, 'max_length', None),
        'max_digits': getattr(f, 'max_digits', None),
        'decimal_places': getattr(f, 'decimal_places', None),
        'choices': [[str(a), str(b)] for a, b in (getattr(f, 'choices', None) or [])],
        'related_model': None,
        'related_table': None,
        'through_table': None,
        'on_delete': None,
        'default': None,
    }
    if f.is_relation and f.related_model is not None:
        info['related_model'] = f.related_model._meta.label
        info['related_table'] = f.related_model._meta.db_table
    if f.many_to_many:
        info['through_table'] = f.remote_field.through._meta.db_table
    remote = getattr(f, 'remote_field', None)
    if remote is not None and getattr(remote, 'on_delete', None) is not None:
        info['on_delete'] = remote.on_delete.__name__
    default = getattr(f, 'default', models.NOT_PROVIDED)
    if default is not models.NOT_PROVIDED:
        info['default'] = default.__name__ if callable(default) else repr(default)
    return info


def dump_models():
    result = []
    for model in apps.get_models():
        meta = model._meta
        if meta.app_label not in PROJECT_APPS:
            continue
        fields = []
        for f in meta.get_fields():
            # Обратные связи описываются на стороне владельца
            if f.auto_created and not f.concrete:
                continue
            if not f.concrete and not f.many_to_many:
                continue
            fields.append(field_info(f))
        result.append({
            'app': meta.app_label,
            'model': model.__name__,
            'table': meta.db_table,
            'verbose': str(meta.verbose_name),
            'verbose_plural': str(meta.verbose_name_plural),
            'doc': (model.__doc__ or '').strip(),
            'unique_together': [list(x) for x in (meta.unique_together or [])],
            'constraints': [getattr(c, 'name', str(c)) for c in meta.constraints],
            'indexes': [{'fields': list(i.fields), 'name': i.name} for i in meta.indexes],
            'ordering': [str(o) for o in (meta.ordering or [])],
            'fields': fields,
        })
    result.sort(key=lambda m: (PROJECT_APPS.index(m['app']), m['table']))
    return result


def dump_routes():
    rows = []

    def walk(patterns, prefix=''):
        for p in patterns:
            if isinstance(p, URLResolver):
                walk(p.url_patterns, prefix + str(p.pattern))
                continue
            if not isinstance(p, URLPattern):
                continue
            path = '/' + prefix + str(p.pattern)
            # Служебные дубли роутера DRF с суффиксом формата документировать незачем
            if 'format' in path or path.startswith('/admin/'):
                continue
            cb = p.callback
            view = getattr(cb, 'view_class', None) or getattr(cb, 'cls', None)
            actions = getattr(cb, 'actions', None)
            if actions:
                methods = sorted({m.upper() for m in actions})
            elif view is not None:
                methods = sorted(
                    m.upper() for m in getattr(view, 'http_method_names', [])
                    if m not in ('options', 'head', 'trace') and hasattr(view, m)
                )
            else:
                # Обычная функция-представление: в системе такие отвечают на GET
                methods = ['GET']
            doc = ((view.__doc__ if view else cb.__doc__) or '').strip().split('\n')[0]
            # Регулярные выражения роутера DRF приводим к читаемому виду
            readable = (path.replace('(?P<pk>[^/.]+)', '<id>')
                        .replace('(?P<log_id>[^/.]+)', '<log_id>')
                        .replace('^', '').replace('$', ''))
            rows.append({
                'path': readable,
                'methods': methods,
                'view': (view.__module__ + '.' + view.__name__) if view else cb.__module__,
                'doc': doc,
            })

    walk(get_resolver().url_patterns)
    seen, unique = set(), []
    for r in rows:
        key = (r['path'], tuple(r['methods']))
        if key not in seen:
            seen.add(key)
            unique.append(r)
    return unique


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    models_data = dump_models()
    routes = dump_routes()
    io.open(DATA / 'models.json', 'w', encoding='utf-8').write(
        json.dumps(models_data, ensure_ascii=False, indent=1))
    io.open(DATA / 'routes.json', 'w', encoding='utf-8').write(
        json.dumps(routes, ensure_ascii=False, indent=1))
    print(f'Моделей: {len(models_data)}, маршрутов: {len(routes)} -> {DATA}')


if __name__ == '__main__':
    main()
