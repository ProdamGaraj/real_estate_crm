from rest_framework import serializers
from .models import Template

class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Template
        fields = '__all__'
        read_only_fields = ['company', 'created_by', 'created_at', 'updated_at']