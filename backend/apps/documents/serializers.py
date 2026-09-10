from rest_framework import serializers
from .models import Template

class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Template
        fields = '__all__'
        read_only_fields = ['company', 'created_by', 'created_at', 'updated_at']

    def to_representation(self, instance):
        from real_estate_project.media_access import build_media_url

        representation = super().to_representation(instance)
        # Шаблон договора — внутренний документ компании, ссылка подписывается
        representation['file'] = build_media_url(instance.file)
        return representation