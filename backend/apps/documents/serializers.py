from rest_framework import serializers
from .models import Template

class TemplateSerializer(serializers.ModelSerializer):
    # Чей это шаблон: пусто — общесистемный, виден всем компаниям.
    # Администратор видит все шаблоны сразу, и по списку нельзя было понять,
    # что шаблон лежит в чужой компании и менеджерам недоступен
    company_name = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = '__all__'
        read_only_fields = ['company', 'created_by', 'created_at', 'updated_at']

    def get_company_name(self, instance):
        return instance.company.name if instance.company_id else None

    def to_representation(self, instance):
        from real_estate_project.media_access import build_media_url

        representation = super().to_representation(instance)
        # Шаблон договора — внутренний документ компании, ссылка подписывается
        representation['file'] = build_media_url(instance.file)
        return representation