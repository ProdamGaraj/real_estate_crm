import apiClient from './axios';

export interface PlanFactData {
    plan: number;
    fact: number;
    percentage: number;
    forecast: number;
    forecast_percentage: number;
}

export interface ProjectReportData {
    project_id: number | string;
    project_name: string;
    contracting_units: PlanFactData;
    contracting_money: PlanFactData;
    revenue_money: PlanFactData;
}

export interface EmployeeReportData {
    employee_id: number | string;
    employee_name: string;
    contracting_units: PlanFactData;
    contracting_money: PlanFactData;
    revenue_money: PlanFactData;
}


export interface ReportFilters {
    year: number;
    period_type: 'month' | 'quarter' | 'half_year' | 'year';
    period_value: number;
}

// Project Reports
export const getPlanFactReport = async (filters: ReportFilters): Promise<ProjectReportData[]> => {
    const response = await apiClient.get('/reports/plan-fact/', { params: filters });
    return response.data;
};

export const downloadPlanTemplate = async () => {
    const response = await apiClient.get('/reports/plan-template/', {
        responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plan_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

export const uploadPlan = async (formData: FormData): Promise<{ status: string }> => {
    const response = await apiClient.post('/reports/plan-upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};

// Employee Reports
export const getEmployeePlanFactReport = async (filters: ReportFilters): Promise<EmployeeReportData[]> => {
    const response = await apiClient.get('/reports/employee-plan-fact/', { params: filters });
    return response.data;
};

export const downloadEmployeePlanTemplate = async () => {
    const response = await apiClient.get('/reports/employee-plan-template/', {
        responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'employee_plan_template.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

export const uploadEmployeePlan = async (formData: FormData): Promise<{ status: string }> => {
    const response = await apiClient.post('/reports/employee-plan-upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
};