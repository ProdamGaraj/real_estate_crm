"""
Пагинация, которую можно включать постранично.

Пагинации в проекте не было вовсе: списки клиентов, платежей, объектов и
сделок отдавались целиком, и время ответа росло вместе с базой. Включить
её глобально нельзя одним движением — клиент типизирует ответы как массивы
и постраничный формат не понимает.

Поэтому класс ведёт себя так:

* запрос без параметра ``page`` возвращает список целиком, как раньше;
* запрос с ``?page=1`` — обычный постраничный ответ DRF.

Это позволяет переводить экраны на пагинацию по одному, не ломая остальные.
Ограничение сверху (``max_page_size``) защищает от выгрузки всей базы одним
запросом даже в постраничном режиме.
"""

from rest_framework.pagination import PageNumberPagination


class OptionalPageNumberPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 500

    def paginate_queryset(self, queryset, request, view=None):
        # Клиент не просил страницу — отдаём всё, как до появления пагинации
        query_params = getattr(request, 'query_params', None)
        if query_params is None:
            query_params = request.GET
        if self.page_query_param not in query_params:
            return None
        return super().paginate_queryset(queryset, request, view=view)
