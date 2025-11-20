import io

import pandas as pd
from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from permissions.permissions import DiscountPermission
from .serializers import (
    PublicProjectListSerializer, PublicProjectDetailSerializer, PublicBuildingDetailSerializer
)
from .filters import ProjectFilter, BuildingFilter
from .models import (
    Project, Building, BuildingType, Property, Layout, Discount, DiscountLog, BuildingLog, ProjectImage, BuildingImage
)
from .serializers import (
    ProjectListSerializer, ProjectDetailSerializer,
    BuildingSerializer, BuildingTypeSerializer,  # <-- Добавьте BuildingMiniSerializer
    LayoutSerializer, PropertyDetailSerializer,
    DiscountListSerializer, DiscountDetailSerializer, ProjectImageSerializer, BuildingImageSerializer, BuildingMiniSerializer
)


# --- Views for Projects ---
class ProjectListView(generics.ListCreateAPIView):
    queryset = Project.objects.all()
    permission_classes = [IsAuthenticated]
    filterset_class = ProjectFilter
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ProjectDetailSerializer
        return ProjectListSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

class ProjectImageDetailView(generics.DestroyAPIView):
    """ View для удаления изображения из галереи """
    serializer_class = ProjectImageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Убедимся, что можно удалить только фото из нужного проекта
        return ProjectImage.objects.filter(project_id=self.kwargs['project_pk'])

class ProjectImageCreateView(generics.CreateAPIView):
    """ View для загрузки нового изображения в галерею проекта """
    serializer_class = ProjectImageSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser] # Для обработки загрузки файлов

    def perform_create(self, serializer):
        project = Project.objects.get(pk=self.kwargs['project_pk'])
        serializer.save(project=project)
class ProjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Project.objects.all()
    serializer_class = ProjectDetailSerializer
    permission_classes = [IsAuthenticated]


# --- Views for Buildings ---
class BuildingListCreateView(generics.ListCreateAPIView):
    serializer_class = BuildingSerializer
    permission_classes = [IsAuthenticated]
    filterset_class = BuildingFilter # <--- ДОБАВЛЕНО

    def get_queryset(self):
        return Building.objects.filter(project_id=self.kwargs['project_pk'])

    def perform_create(self, serializer):
        project = Project.objects.get(pk=self.kwargs['project_pk'])
        serializer.save(created_by=self.request.user, project=project)


class BuildingDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BuildingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Building.objects.filter(project_id=self.kwargs['project_pk'])

    # --- ДОБАВЬТЕ ЭТОТ МЕТОД ДЛЯ ЛОГИРОВАНИЯ ---
    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_data = self.get_serializer(old_instance).data

        instance = serializer.save(updated_by=self.request.user)
        new_data = self.get_serializer(instance).data

        changes = []
        # Сравниваем старые и новые данные
        for key in old_data:
            if old_data.get(key) != new_data.get(key):
                # Исключаем поля, которые не нужно логировать
                if key not in ['updated_at', 'logs', 'properties', 'gallery_images', 'project', 'created_at']:
                    # Обрабатываем вложенные объекты (как building_type)
                    if isinstance(old_data.get(key), dict):
                        old_val_str = old_data.get(key, {}).get('name', 'пусто')
                        new_val_str = new_data.get(key, {}).get('name', 'пусто')
                    else:
                        old_val_str = old_data.get(key) or "пусто"
                        new_val_str = new_data.get(key) or "пусто"

                    if old_val_str != new_val_str:
                        changes.append(f"Поле '{key}' изменено с '{old_val_str}' на '{new_val_str}'")

        if changes:
            action_text = "Данные дома обновлены. " + "; ".join(changes)
            BuildingLog.objects.create(
                building=instance,
                user=self.request.user,
                action=action_text
            )


# --- Views for Building Types ---
class BuildingTypeListView(generics.ListCreateAPIView):
    queryset = BuildingType.objects.all()
    serializer_class = BuildingTypeSerializer
    permission_classes = [IsAuthenticated]


class BuildingTypeDetailView(generics.DestroyAPIView):
    queryset = BuildingType.objects.all()
    serializer_class = BuildingTypeSerializer
    permission_classes = [IsAuthenticated]


# --- Views for Excel ---
class PropertyTemplateDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_pk, building_pk, *args, **kwargs):
        header_map = {
            'unit_number': 'Номер объекта', 'floor': 'Этаж', 'entrance': 'Подъезд',
            'riser': 'Стояк', 'area': 'Площадь (кв.м)', 'price': 'Стоимость',
            'property_type': 'Тип объекта', 'status': 'Статус',
            'layout__name': 'Название планировки',
            'has_finishing': 'Наличие отделки (TRUE/FALSE)', 'description': 'Описание',
        }
        properties_qs = Property.objects.filter(building_id=building_pk).select_related('layout')
        properties_data = list(properties_qs.values(*header_map.keys()))
        if properties_data:
            df = pd.DataFrame(properties_data)
        else:
            df = pd.DataFrame(columns=header_map.keys())
        type_map_reverse = {k: v for k, v in Property.PropertyType.choices}
        status_map_reverse = {k: v for k, v in Property.PropertyStatus.choices}
        if 'property_type' in df.columns:
            df['property_type'] = df['property_type'].map(type_map_reverse)
        if 'status' in df.columns:
            df['status'] = df['status'].map(status_map_reverse)
        df.rename(columns=header_map, inplace=True)
        property_types = [pt[0] for pt in Property.PropertyType.choices]
        statuses = [st[0] for st in Property.PropertyStatus.choices]
        max_len = max(len(property_types), len(statuses))
        property_types.extend([None] * (max_len - len(property_types)))
        statuses.extend([None] * (max_len - len(statuses)))
        hints_df = pd.DataFrame({
            'Допустимые значения для "Тип объекта"': property_types,
            'Допустимые значения для "Статус"': statuses
        })
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Объекты для загрузки')
            hints_df.to_excel(writer, index=False, sheet_name='Подсказки')
        output.seek(0)
        response = HttpResponse(
            output, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="property_template.xlsx"'
        return response


class PropertyUploadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request, project_pk, building_pk, format=None):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'Файл не найден'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            df = pd.read_excel(file_obj)
            building = Building.objects.get(pk=building_pk, project_id=project_pk)
            type_map = {v: k for k, v in Property.PropertyType.choices}
            status_map = {v: k for k, v in Property.PropertyStatus.choices}
            allowed_statuses_from_excel = [Property.PropertyStatus.SELECTION, Property.PropertyStatus.RESERVE]
            created_count = 0
            updated_count = 0
            for index, row in df.iterrows():
                if row.isnull().all():
                    continue
                unit_number = row.get('Номер объекта')
                if not unit_number:
                    continue
                layout_name = row.get('Название планировки')
                layout_obj = None
                if layout_name and pd.notna(layout_name):
                    layout_obj, _ = Layout.objects.get_or_create(
                        building=building,
                        name=layout_name
                    )
                property_data = {
                    'floor': row.get('Этаж'),
                    'entrance': row.get('Подъезд'),
                    'riser': row.get('Стояк'),
                    'area': row.get('Площадь (кв.м)'),
                    'price': row.get('Стоимость'),
                    'has_finishing': row.get('Наличие отделки (TRUE/FALSE)', False),
                    'description': row.get('Описание'),
                    'property_type': type_map.get(row.get('Тип объекта'), Property.PropertyType.APARTMENT),
                    'layout': layout_obj,
                }
                status_from_file = status_map.get(row.get('Статус'), Property.PropertyStatus.SELECTION)
                existing_property = Property.objects.filter(building=building, unit_number=unit_number).first()
                if existing_property:
                    for key, value in property_data.items():
                        if pd.notna(value):
                            setattr(existing_property, key, value)
                    if existing_property.status in allowed_statuses_from_excel:
                        if status_from_file in allowed_statuses_from_excel:
                            existing_property.status = status_from_file
                    existing_property.updated_by = request.user
                    existing_property.save()
                    updated_count += 1
                else:
                    if status_from_file not in allowed_statuses_from_excel:
                        status_from_file = Property.PropertyStatus.SELECTION
                    property_data['status'] = status_from_file
                    Property.objects.create(
                        building=building,
                        unit_number=unit_number,
                        created_by=request.user,
                        **property_data
                    )
                    created_count += 1
            return Response({'status': f'Успешно загружено. Создано: {created_count}, Обновлено: {updated_count}'},
                            status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': f"Произошла ошибка: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


# --- Views for Properties ---
class PropertyDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = PropertyDetailSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Property.objects.filter(building_id=self.kwargs['building_pk'])


# --- Views for Layouts ---
class LayoutListView(generics.ListCreateAPIView):
    serializer_class = LayoutSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Layout.objects.filter(building_id=self.kwargs['building_pk'])

    def perform_create(self, serializer):
        building = Building.objects.get(pk=self.kwargs['building_pk'])
        serializer.save(building=building)


class LayoutDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = LayoutSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Layout.objects.filter(building_id=self.kwargs['building_pk'])


# --- Views for Discounts ---
class DiscountListView(generics.ListCreateAPIView):
    queryset = Discount.objects.prefetch_related('buildings').all()
    # Используем сериализатор для СПИСКА
    serializer_class = DiscountListSerializer
    permission_classes = [IsAuthenticated, DiscountPermission]

    def perform_create(self, serializer):
        instance = serializer.save(created_by=self.request.user)
        # Создаем лог при создании
        DiscountLog.objects.create(
            discount=instance,
            user=self.request.user,
            action="Скидка создана."
        )


class DiscountDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Discount.objects.all()
    # Используем ДЕТАЛЬНЫЙ сериализатор
    serializer_class = DiscountDetailSerializer
    permission_classes = [IsAuthenticated, DiscountPermission]

    def perform_update(self, serializer):
        # --- Логика логирования при обновлении ---
        old_instance = self.get_object()
        old_data = self.get_serializer(old_instance).data

        instance = serializer.save(updated_by=self.request.user)
        new_data = self.get_serializer(instance).data

        changes = []
        # Сравниваем старые и новые данные
        for key in old_data:
            if old_data[key] != new_data[key]:
                if key not in ['updated_at', 'logs', 'created_at', 'buildings_info']:
                    changes.append(f"Поле '{key}' изменено с '{old_data[key]}' на '{new_data[key]}'")

        if changes:
            action_text = "Скидка обновлена. " + "; ".join(changes)
            DiscountLog.objects.create(
                discount=instance,
                user=self.request.user,
                action=action_text
            )
# --- Views for Building Gallery ---

class BuildingImageCreateView(generics.CreateAPIView):
    """ View для загрузки нового изображения в галерею дома """
    serializer_class = BuildingImageSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def perform_create(self, serializer):
        building = Building.objects.get(pk=self.kwargs['building_pk'], project_id=self.kwargs['project_pk'])
        serializer.save(building=building)


class BuildingImageDetailView(generics.DestroyAPIView):
    """ View для удаления изображения из галереи дома """
    serializer_class = BuildingImageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return BuildingImage.objects.filter(building_id=self.kwargs['building_pk'])

# --- ДОБАВЬТЕ ЭТОТ НОВЫЙ КЛАСС В КОНЕЦ ФАЙЛА ---
class BuildingListViewAll(generics.ListAPIView):
    """
    Возвращает плоский список всех домов для использования в выпадающих списках.
    """
    queryset = Building.objects.select_related('project').all()
    serializer_class = BuildingMiniSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None # Отключаем пагинацию для этого эндпоинта

class PublicProjectListView(generics.ListAPIView):
    """
    Публичный список проектов. Доступен без аутентификации.
    """
    queryset = Project.objects.filter(
        buildings__status=Building.BuildingStatus.FOR_SALE
    ).distinct()
    serializer_class = PublicProjectListSerializer
    permission_classes = [] # Пустой список разрешает доступ всем

class PublicProjectDetailView(generics.RetrieveAPIView):
    """
    Публичная детальная страница проекта.
    """
    queryset = Project.objects.all()
    serializer_class = PublicProjectDetailSerializer
    permission_classes = []

class PublicBuildingDetailView(generics.RetrieveAPIView):
    """
    Публичная детальная страница дома.
    """
    queryset = Building.objects.filter(status=Building.BuildingStatus.FOR_SALE)
    serializer_class = PublicBuildingDetailSerializer
    permission_classes = []