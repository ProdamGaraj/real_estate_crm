import io
import logging

import pandas as pd
from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

logger = logging.getLogger(__name__)
from permissions.permissions import (
    DiscountPermission, ProjectPermission, BuildingPermission, 
    BuildingTypePermission, PropertyPermission, LayoutPermission,
    HasPartnerViewProjectsScope, HasPartnerViewBuildingsScope, HasPartnerViewLayoutsScope
)
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
    permission_classes = [IsAuthenticated, ProjectPermission]
    filterset_class = ProjectFilter
    
    def get_queryset(self):
        """
        Фильтрация проектов по компании пользователя.
        Системные администраторы видят все проекты.
        """
        user = self.request.user
        queryset = Project.objects.all()
        
        # Проверяем профиль пользователя
        if hasattr(user, 'profile'):
            profile = user.profile
            # Системный админ видит все проекты
            if profile.is_system_admin:
                return queryset
            # Обычные пользователи видят только проекты своей компании
            if profile.company:
                return queryset.filter(company=profile.company)
            # Если у пользователя нет компании - не видит никаких проектов
            return queryset.none()
        
        return queryset.none()
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ProjectDetailSerializer
        return ProjectListSerializer

    def perform_create(self, serializer):
        """
        При создании проекта автоматически назначаем компанию пользователя.
        """
        user = self.request.user
        company = None
        if hasattr(user, 'profile') and user.profile.company:
            company = user.profile.company
        serializer.save(created_by=user, company=company)

class ProjectImageDetailView(generics.DestroyAPIView):
    """ View для удаления изображения из галереи """
    serializer_class = ProjectImageSerializer
    permission_classes = [IsAuthenticated, ProjectPermission]

    def get_queryset(self):
        """
        Фильтрация изображений проекта по компании пользователя.
        """
        project_pk = self.kwargs['project_pk']
        user = self.request.user
        
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return ProjectImage.objects.filter(project_id=project_pk)
            if profile.company:
                return ProjectImage.objects.filter(
                    project_id=project_pk,
                    project__company=profile.company
                )
        return ProjectImage.objects.none()

class ProjectImageCreateView(generics.CreateAPIView):
    """ View для загрузки нового изображения в галерею проекта """
    serializer_class = ProjectImageSerializer
    permission_classes = [IsAuthenticated, ProjectPermission]
    parser_classes = [MultiPartParser] # Для обработки загрузки файлов

    def perform_create(self, serializer):
        user = self.request.user
        project_pk = self.kwargs['project_pk']
        
        # Проверяем доступ к проекту через компанию
        queryset = Project.objects.filter(pk=project_pk)
        if hasattr(user, 'profile'):
            profile = user.profile
            if not profile.is_system_admin and profile.company:
                queryset = queryset.filter(company=profile.company)
        
        project = queryset.first()
        if project:
            serializer.save(project=project)

class ProjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProjectDetailSerializer
    permission_classes = [IsAuthenticated, ProjectPermission]
    
    def get_queryset(self):
        """
        Фильтрация проектов по компании пользователя.
        """
        user = self.request.user
        queryset = Project.objects.all()
        
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return queryset
            if profile.company:
                return queryset.filter(company=profile.company)
            return queryset.none()
        
        return queryset.none()


# --- Views for Buildings ---
class BuildingListCreateView(generics.ListCreateAPIView):
    serializer_class = BuildingSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]
    filterset_class = BuildingFilter # <--- ДОБАВЛЕНО

    def get_queryset(self):
        """
        Фильтрация домов по компании пользователя через родительский проект.
        """
        project_id = self.kwargs['project_pk']
        user = self.request.user
        
        # Проверяем доступ к проекту
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return Building.objects.filter(project_id=project_id)
            if profile.company:
                # Проверяем, что проект принадлежит компании пользователя
                return Building.objects.filter(
                    project_id=project_id,
                    project__company=profile.company
                )
        return Building.objects.none()

    def perform_create(self, serializer):
        project = Project.objects.get(pk=self.kwargs['project_pk'])
        serializer.save(created_by=self.request.user, project=project)


class BuildingDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BuildingSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]

    def get_queryset(self):
        """
        Фильтрация домов по компании пользователя через родительский проект.
        """
        project_id = self.kwargs['project_pk']
        user = self.request.user
        
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return Building.objects.filter(project_id=project_id)
            if profile.company:
                return Building.objects.filter(
                    project_id=project_id,
                    project__company=profile.company
                )
        return Building.objects.none()

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
    permission_classes = [IsAuthenticated, BuildingTypePermission]


class BuildingTypeDetailView(generics.DestroyAPIView):
    queryset = BuildingType.objects.all()
    serializer_class = BuildingTypeSerializer
    permission_classes = [IsAuthenticated, BuildingTypePermission]


# --- Views for Excel ---
class PropertyTemplateDownloadView(APIView):
    permission_classes = [IsAuthenticated, PropertyPermission]

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
        # Коды типов и статусов остаются как есть (не преобразуем в названия),
        # т.к. при импорте ожидаются именно коды для поддержки мультиязычности
        df.rename(columns=header_map, inplace=True)
        # Подсказки содержат коды (pt[0]), которые ожидаются при импорте
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
    permission_classes = [IsAuthenticated, PropertyPermission]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, project_pk, building_pk, format=None):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'Файл не найден', 'details': f'FILES: {list(request.FILES.keys())}, DATA: {list(request.data.keys())}'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            df = pd.read_excel(file_obj)
            building = Building.objects.get(pk=building_pk, project_id=project_pk)
            
            # Логирование для отладки
            total_rows = len(df)
            columns = list(df.columns)
            
            # Проверяем дубликаты в файле (по комбинации номер + подъезд + этаж)
            # Заполняем NaN пустой строкой перед формированием ключа
            df['_entrance_clean'] = df['Подъезд'].fillna('').astype(str).str.strip()
            df['_unit_clean'] = df['Номер объекта'].fillna('').astype(str).str.strip()
            df['_floor_clean'] = df['Этаж'].fillna('').astype(str).str.strip()
            df['_unit_key'] = df['_unit_clean'] + '_' + df['_entrance_clean'] + '_' + df['_floor_clean']
            duplicates_in_file = df[df['_unit_key'].duplicated()]['_unit_key'].unique().tolist()
            
            # Маппинг кодов: код -> код (для валидации что код существует)
            valid_types = {k: k for k, v in Property.PropertyType.choices}
            valid_statuses = {k: k for k, v in Property.PropertyStatus.choices}
            allowed_statuses_from_excel = [Property.PropertyStatus.SELECTION, Property.PropertyStatus.RESERVE]
            created_count = 0
            updated_count = 0
            skipped_empty = 0
            skipped_no_unit = 0
            skipped_duplicates = 0
            errors_list = []
            
            # Отслеживаем обработанные номера в этой загрузке
            processed_units = set()
            
            for index, row in df.iterrows():
                if row.isnull().all():
                    skipped_empty += 1
                    continue
                    
                unit_number = row.get('Номер объекта')
                # Проверяем на NaN и пустые значения
                if pd.isna(unit_number) or unit_number is None or str(unit_number).strip() == '':
                    skipped_no_unit += 1
                    continue
                    
                # Приводим к строке и убираем пробелы
                unit_number = str(unit_number).strip()
                
                # Получаем подъезд и этаж для формирования уникального ключа
                entrance_val = row.get('Подъезд')
                floor_val = row.get('Этаж')
                entrance_key = str(entrance_val).strip() if pd.notna(entrance_val) else ''
                floor_key = str(int(floor_val)) if pd.notna(floor_val) else ''
                unit_key = f"{unit_number}_{entrance_key}_{floor_key}"
                
                # Пропускаем дубликаты в файле (берём только первое вхождение)
                if unit_key in processed_units:
                    skipped_duplicates += 1
                    continue
                processed_units.add(unit_key)
                
                layout_name = row.get('Название планировки')
                layout_obj = None
                if layout_name and pd.notna(layout_name):
                    layout_obj, _ = Layout.objects.get_or_create(
                        building=building,
                        name=str(layout_name).strip()
                    )
                
                # Безопасное получение и преобразование значений
                floor_val = row.get('Этаж')
                entrance_val = row.get('Подъезд')
                riser_val = row.get('Стояк')
                area_val = row.get('Площадь (кв.м)')
                price_val = row.get('Стоимость')
                
                property_data = {
                    'floor': int(floor_val) if pd.notna(floor_val) else 0,
                    'entrance': str(entrance_val).strip() if pd.notna(entrance_val) else None,
                    'riser': str(riser_val).strip() if pd.notna(riser_val) else '',
                    'area': float(area_val) if pd.notna(area_val) else 0,
                    'price': float(price_val) if pd.notna(price_val) else 0,
                    'has_finishing': bool(row.get('Наличие отделки (TRUE/FALSE)', False)),
                    'description': str(row.get('Описание', '')).strip() if pd.notna(row.get('Описание')) else '',
                    'property_type': valid_types.get(row.get('Тип объекта'), Property.PropertyType.APARTMENT),
                    'layout': layout_obj,
                }
                
                status_from_file = valid_statuses.get(row.get('Статус'), Property.PropertyStatus.SELECTION)
                
                try:
                    # Ищем по building + unit_number + entrance + floor
                    entrance_for_search = str(entrance_val).strip() if pd.notna(entrance_val) else None
                    floor_for_search = int(floor_val) if pd.notna(floor_val) else 0
                    existing_property = Property.objects.filter(
                        building=building, 
                        unit_number=unit_number,
                        entrance=entrance_for_search,
                        floor=floor_for_search
                    ).first()
                    if existing_property:
                        for key, value in property_data.items():
                            if value is not None:
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
                except Exception as row_error:
                    errors_list.append(f"Строка {index + 2}: {str(row_error)}")
            
            result_message = f'Успешно загружено. Создано: {created_count}, Обновлено: {updated_count}'
            if skipped_empty > 0 or skipped_no_unit > 0 or skipped_duplicates > 0:
                result_message += f'. Пропущено: {skipped_empty} пустых, {skipped_no_unit} без номера, {skipped_duplicates} дубликатов'
            if duplicates_in_file:
                result_message += f'. ВНИМАНИЕ: В файле найдены дубликаты номеров объектов!'
            if errors_list:
                result_message += f'. Ошибки в {len(errors_list)} строках'
            
            return Response({
                'status': result_message,
                'details': {
                    'total_rows': total_rows,
                    'columns': columns,
                    'created': created_count,
                    'updated': updated_count,
                    'skipped_empty': skipped_empty,
                    'skipped_no_unit': skipped_no_unit,
                    'skipped_duplicates': skipped_duplicates,
                    'duplicates_in_file': duplicates_in_file[:20] if duplicates_in_file else [],  # Первые 20 дубликатов
                    'errors': errors_list[:10] if errors_list else []  # Первые 10 ошибок
                }
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': f"Произошла ошибка: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


class LayoutBulkUploadView(APIView):
    """
    Массовая загрузка изображений планировок.
    
    Формат имени файла: {layout_name}_{image_type}.{ext}
    Где image_type: main, extra, floor, usp
    
    Примеры:
    - 1-комн 35м_main.jpg -> планировка "1-комн 35м", поле main_layout_image
    - Студия_floor.png -> планировка "Студия", поле floor_plan_image
    
    Если планировка не существует, она будет создана автоматически.
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsAuthenticated, LayoutPermission]
    
    IMAGE_TYPE_MAP = {
        'main': 'main_layout_image',
        'extra': 'extra_layout_image', 
        'floor': 'floor_plan_image',
        'usp': 'usp_image',
    }
    
    def post(self, request, building_pk, **kwargs):
        import traceback as tb
        from django.core.exceptions import TooManyFilesSent
        
        logger.info(f"[LayoutBulkUpload] Начало загрузки файлов для дома {building_pk}")
        
        try:
            files = request.FILES.getlist('files')
            logger.info(f"[LayoutBulkUpload] Получено файлов: {len(files)}")
            
            if not files:
                logger.warning(f"[LayoutBulkUpload] Файлы не найдены в запросе")
                return Response(
                    {'error': 'Файлы не найдены. Используйте поле "files" для загрузки.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                building = Building.objects.get(pk=building_pk)
                logger.info(f"[LayoutBulkUpload] Найден дом: {building.name}")
            except Building.DoesNotExist:
                logger.error(f"[LayoutBulkUpload] Дом с ID {building_pk} не найден")
                return Response(
                    {'error': 'Дом не найден'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Проверяем доступ по компании
            user = request.user
            logger.info(f"[LayoutBulkUpload] Пользователь: {user.username}")
            
            if hasattr(user, 'profile'):
                profile = user.profile
                if not profile.is_system_admin:
                    if not profile.company or building.project.company != profile.company:
                        logger.error(f"[LayoutBulkUpload] Пользователь {user.username} не имеет доступ к дому {building_pk}")
                        return Response(
                            {'error': 'Нет доступа к этому дому'},
                            status=status.HTTP_403_FORBIDDEN
                        )
                logger.info(f"[LayoutBulkUpload] Доступ разрешён для пользователя {user.username}")
            
            results = {
                'success': [],
                'errors': [],
                'created_layouts': [],
            }
            
            for idx, file in enumerate(files):
                filename = file.name
                logger.info(f"[LayoutBulkUpload] Обработка файла {idx + 1}/{len(files)}: {filename} (размер: {file.size} байт)")
                
                try:
                    # Убираем расширение
                    name_without_ext = filename.rsplit('.', 1)[0] if '.' in filename else filename
                    file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
                    logger.debug(f"[LayoutBulkUpload] Имя без расширения: {name_without_ext}, расширение: {file_ext}")
                    
                    # Ищем разделитель типа изображения (последнее подчёркивание)
                    if '_' not in name_without_ext:
                        # Если нет подчёркивания — используем всё имя как название планировки, тип = main
                        layout_name = name_without_ext.strip()
                        image_type = 'main'
                        logger.debug(f"[LayoutBulkUpload] Нет подчёркивания, используется тип: main")
                    else:
                        # Разделяем на имя планировки и тип
                        last_underscore = name_without_ext.rfind('_')
                        potential_type = name_without_ext[last_underscore + 1:].lower().strip()
                        
                        # Проверяем, является ли последняя часть типом изображения
                        if potential_type in self.IMAGE_TYPE_MAP:
                            layout_name = name_without_ext[:last_underscore].strip()
                            image_type = potential_type
                            logger.debug(f"[LayoutBulkUpload] Найден тип: {image_type}")
                        else:
                            # Если последняя часть не тип — используем всё имя как название, тип = main
                            layout_name = name_without_ext.strip()
                            image_type = 'main'
                            logger.debug(f"[LayoutBulkUpload] Тип не распознан '{potential_type}', используется default: main")
                    
                    if not layout_name:
                        error_msg = 'Название планировки не может быть пустым'
                        logger.warning(f"[LayoutBulkUpload] {error_msg} для файла {filename}")
                        results['errors'].append({
                            'file': filename,
                            'error': error_msg
                        })
                        continue
                    
                    field_name = self.IMAGE_TYPE_MAP[image_type]
                    logger.info(f"[LayoutBulkUpload] Планировка: '{layout_name}', поле: {field_name}")
                    
                    # Находим или создаём планировку
                    layout, created = Layout.objects.get_or_create(
                        building=building,
                        name=layout_name
                    )
                    logger.info(f"[LayoutBulkUpload] {'Создана новая' if created else 'Найдена существующая'} планировка: {layout.name} (ID: {layout.id})")
                    
                    if created:
                        results['created_layouts'].append(layout_name)
                    
                    # Сохраняем изображение
                    logger.debug(f"[LayoutBulkUpload] Сохраняем файл в поле {field_name}")
                    setattr(layout, field_name, file)
                    layout.save()
                    logger.info(f"[LayoutBulkUpload] ✓ Файл {filename} успешно сохранён")
                    
                    results['success'].append({
                        'file': filename,
                        'layout': layout_name,
                        'field': field_name,
                        'created': created
                    })
                    
                except Exception as e:
                    error_msg = f"Ошибка при обработке файла: {str(e)}"
                    logger.error(f"[LayoutBulkUpload] {error_msg}\n{tb.format_exc()}")
                    results['errors'].append({
                        'file': filename,
                        'error': error_msg
                    })
            
            logger.info(f"[LayoutBulkUpload] Завершена загрузка. Успешно: {len(results['success'])}, Ошибок: {len(results['errors'])}, Создано планировок: {len(results['created_layouts'])}")
            
            return Response({
                'message': f'Обработано файлов: {len(files)}',
                'uploaded': len(results['success']),
                'errors_count': len(results['errors']),
                'created_layouts': results['created_layouts'],
                'details': results
            }, status=status.HTTP_200_OK)
            
        except TooManyFilesSent as e:
            error_msg = f"Слишком много файлов. Максимум: 10000 файлов в одном запросе. Загружайте в несколько раз."
            logger.error(f"[LayoutBulkUpload] {error_msg}")
            return Response({
                'error': error_msg,
                'detail': 'Разделите загрузку на несколько запросов'
            }, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
            
        except Exception as e:
            error_msg = f"Критическая ошибка при загрузке: {str(e)}"
            logger.critical(f"[LayoutBulkUpload] {error_msg}\n{tb.format_exc()}")
            return Response({
                'error': error_msg,
                'detail': 'Проверьте логи сервера для подробной информации'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# --- Views for Properties ---
class PropertyDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = PropertyDetailSerializer
    permission_classes = [IsAuthenticated, PropertyPermission]

    def get_queryset(self):
        """
        Фильтрация свойств по компании пользователя через цепочку building -> project.
        """
        building_pk = self.kwargs['building_pk']
        user = self.request.user
        
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return Property.objects.filter(building_id=building_pk)
            if profile.company:
                return Property.objects.filter(
                    building_id=building_pk,
                    building__project__company=profile.company
                )
        return Property.objects.none()


# --- Views for Layouts ---
class LayoutListView(generics.ListCreateAPIView):
    serializer_class = LayoutSerializer
    permission_classes = [IsAuthenticated, LayoutPermission]

    def get_queryset(self):
        """
        Фильтрация планировок по компании пользователя через цепочку building -> project.
        """
        building_pk = self.kwargs['building_pk']
        user = self.request.user
        
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return Layout.objects.filter(building_id=building_pk)
            if profile.company:
                return Layout.objects.filter(
                    building_id=building_pk,
                    building__project__company=profile.company
                )
        return Layout.objects.none()

    def perform_create(self, serializer):
        building = Building.objects.get(pk=self.kwargs['building_pk'])
        serializer.save(building=building)


class LayoutDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = LayoutSerializer
    permission_classes = [IsAuthenticated, LayoutPermission]

    def get_queryset(self):
        """
        Фильтрация планировок по компании пользователя через цепочку building -> project.
        """
        building_pk = self.kwargs['building_pk']
        user = self.request.user
        
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return Layout.objects.filter(building_id=building_pk)
            if profile.company:
                return Layout.objects.filter(
                    building_id=building_pk,
                    building__project__company=profile.company
                )
        return Layout.objects.none()


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
    permission_classes = [IsAuthenticated, BuildingPermission]
    parser_classes = [MultiPartParser]

    def perform_create(self, serializer):
        user = self.request.user
        project_pk = self.kwargs['project_pk']
        building_pk = self.kwargs['building_pk']
        
        # Проверяем доступ к проекту через компанию
        queryset = Building.objects.filter(pk=building_pk, project_id=project_pk)
        if hasattr(user, 'profile'):
            profile = user.profile
            if not profile.is_system_admin and profile.company:
                queryset = queryset.filter(project__company=profile.company)
        
        building = queryset.first()
        if building:
            serializer.save(building=building)


class BuildingImageDetailView(generics.DestroyAPIView):
    """ View для удаления изображения из галереи дома """
    serializer_class = BuildingImageSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]

    def get_queryset(self):
        """
        Фильтрация изображений зданий по компании пользователя.
        """
        building_pk = self.kwargs['building_pk']
        user = self.request.user
        
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return BuildingImage.objects.filter(building_id=building_pk)
            if profile.company:
                return BuildingImage.objects.filter(
                    building_id=building_pk,
                    building__project__company=profile.company
                )
        return BuildingImage.objects.none()

# --- ДОБАВЬТЕ ЭТОТ НОВЫЙ КЛАСС В КОНЕЦ ФАЙЛА ---
class BuildingListViewAll(generics.ListAPIView):
    """
    Возвращает плоский список всех домов для использования в выпадающих списках.
    """
    serializer_class = BuildingMiniSerializer
    permission_classes = [IsAuthenticated, BuildingPermission]
    pagination_class = None # Отключаем пагинацию для этого эндпоинта

    def get_queryset(self):
        """
        Фильтрация домов по компании пользователя.
        """
        user = self.request.user
        queryset = Building.objects.select_related('project').all()
        
        if hasattr(user, 'profile'):
            profile = user.profile
            if profile.is_system_admin:
                return queryset
            if profile.company:
                return queryset.filter(project__company=profile.company)
        return queryset.none()


# === PUBLIC API (для партнёров) ===

API_KEY_PARAMETER = OpenApiParameter(
    name='X-API-Key',
    type=OpenApiTypes.STR,
    location=OpenApiParameter.HEADER,
    required=True,
    description='API-ключ партнёра. Получите у администратора системы.'
)


@extend_schema(
    tags=['Public API'],
    parameters=[API_KEY_PARAMETER],
    description='''
Получить список проектов с активными продажами.

**Требует API-ключ партнёра** в заголовке `X-API-Key`.

Возвращает только проекты, у которых есть здания со статусом "В продаже" (FOR_SALE).
''',
    responses={
        200: PublicProjectListSerializer(many=True),
        401: {'description': 'API-ключ отсутствует или недействителен'},
        403: {'description': 'Доступ запрещён (IP не в белом списке, ключ деактивирован и т.д.)'},
    }
)
class PublicProjectListView(generics.ListAPIView):
    """
    Публичный список проектов. Требует валидный API-ключ партнёра.
    """
    queryset = Project.objects.filter(
        buildings__status=Building.BuildingStatus.FOR_SALE
    ).distinct()
    serializer_class = PublicProjectListSerializer
    authentication_classes = []  # API-ключ проверяется в permission_classes
    permission_classes = [HasPartnerViewProjectsScope]


@extend_schema(
    tags=['Public API'],
    parameters=[API_KEY_PARAMETER],
    description='''
Получить детальную информацию о проекте, включая здания и квартиры.

**Требует API-ключ партнёра** в заголовке `X-API-Key`.

Возвращает:
- Информацию о проекте (название, адрес, описание, USP)
- Список зданий со статусом "В продаже"
- Для каждого здания — список доступных квартир
- Галерею изображений проекта
''',
    responses={
        200: PublicProjectDetailSerializer,
        401: {'description': 'API-ключ отсутствует или недействителен'},
        403: {'description': 'Доступ запрещён'},
        404: {'description': 'Проект не найден'},
    }
)
class PublicProjectDetailView(generics.RetrieveAPIView):
    """
    Публичная детальная страница проекта. Требует валидный API-ключ партнёра.
    """
    queryset = Project.objects.all()
    serializer_class = PublicProjectDetailSerializer
    authentication_classes = []  # API-ключ проверяется в permission_classes
    permission_classes = [HasPartnerViewProjectsScope]


@extend_schema(
    tags=['Public API'],
    parameters=[API_KEY_PARAMETER],
    description='''
Получить детальную информацию о здании (доме).

**Требует API-ключ партнёра** в заголовке `X-API-Key`.

Возвращает только здания со статусом "В продаже" (FOR_SALE).
Включает список доступных квартир с ценами и характеристиками.
''',
    responses={
        200: PublicBuildingDetailSerializer,
        401: {'description': 'API-ключ отсутствует или недействителен'},
        403: {'description': 'Доступ запрещён'},
        404: {'description': 'Здание не найдено или не в продаже'},
    }
)
class PublicBuildingDetailView(generics.RetrieveAPIView):
    """
    Публичная детальная страница дома. Требует валидный API-ключ партнёра.
    """
    queryset = Building.objects.filter(status=Building.BuildingStatus.FOR_SALE)
    serializer_class = PublicBuildingDetailSerializer
    authentication_classes = []  # API-ключ проверяется в permission_classes
    permission_classes = [HasPartnerViewBuildingsScope]


@extend_schema(
    tags=['Public API'],
    parameters=[API_KEY_PARAMETER],
    description='''
Получить список планировок для указанного здания.

**Требует API-ключ партнёра** в заголовке `X-API-Key` с разрешением VIEW_LAYOUTS.

Возвращает только планировки зданий со статусом "В продаже".
''',
    responses={
        200: LayoutSerializer(many=True),
        401: {'description': 'API-ключ отсутствует или недействителен'},
        403: {'description': 'Доступ запрещён'},
        404: {'description': 'Здание не найдено или не в продаже'},
    }
)
class PublicLayoutListView(generics.ListAPIView):
    """
    Публичный список планировок здания. Требует валидный API-ключ партнёра.
    """
    serializer_class = LayoutSerializer
    authentication_classes = []  # API-ключ проверяется в permission_classes
    permission_classes = [HasPartnerViewLayoutsScope]
    
    def get_queryset(self):
        building_id = self.kwargs.get('building_pk')
        return Layout.objects.filter(
            building_id=building_id,
            building__status=Building.BuildingStatus.FOR_SALE
        )