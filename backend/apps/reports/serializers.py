from rest_framework import serializers
from .models import Plan, EmployeePlan

class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = '__all__'

class EmployeePlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeePlan
        fields = '__all__'