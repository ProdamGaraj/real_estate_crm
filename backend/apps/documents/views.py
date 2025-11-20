from django.http import HttpResponse
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from rest_framework.views import APIView
from rest_framework.response import Response
from docxtpl import DocxTemplate
import io

from apps.deals.models import Deal
from .models import Template
from .serializers import TemplateSerializer


class TemplateListCreateView(generics.ListCreateAPIView):
    queryset = Template.objects.all()
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]


class TemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Template.objects.all()
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]


class DealTemplatesListView(generics.ListAPIView):
    serializer_class = TemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        deal_id = self.kwargs.get('deal_pk')
        try:
            deal = Deal.objects.select_related('property__building__project').get(pk=deal_id)
        except Deal.DoesNotExist:
            return Template.objects.none()

        prop = deal.property
        building = prop.building
        project = building.project

        # Сначала фильтруем по полям, которые поддерживаются базой данных
        queryset = Template.objects.filter(
            Q(applies_to_projects__isnull=True) | Q(applies_to_projects=project),
            Q(applies_to_buildings__isnull=True) | Q(applies_to_buildings=building),
        ).distinct()

        # Затем фильтруем по JSON-полю уже в Python
        prop_type = prop.property_type
        filtered_pks = []
        for template in queryset:
            applies_to_types = template.applies_to_property_types
            # Шаблон подходит, если список типов пуст (подходит для всех)
            # или если тип недвижимости сделки есть в списке
            if not applies_to_types or prop_type in applies_to_types:
                filtered_pks.append(template.pk)

        return Template.objects.filter(pk__in=filtered_pks)


class GenerateDocumentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, deal_pk, template_pk, *args, **kwargs):
        try:
            deal = Deal.objects.select_related('client', 'property__building__project', 'created_by').get(pk=deal_pk)
            template = Template.objects.get(pk=template_pk)
        except (Deal.DoesNotExist, Template.DoesNotExist):
            return Response(status=status.HTTP_404_NOT_FOUND)

        doc = DocxTemplate(template.file.path)
        context = {
            'deal': deal,
            'client': deal.client,
            'property': deal.property,
            'building': deal.property.building,
            'project': deal.property.building.project,
            'manager': deal.created_by,
        }

        doc.render(context)

        file_stream = io.BytesIO()
        doc.save(file_stream)
        file_stream.seek(0)

        response = HttpResponse(
            file_stream.read(),
            content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
        response['Content-Disposition'] = f'attachment; filename="generated_doc_{deal.id}.docx"'
        return response