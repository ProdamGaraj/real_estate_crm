// real_estate_crm/frontend-new/src/api/dashboard.ts

import apiClient from './axios';

export interface KpiData {
    newClientsToday: number;
    newApplicationsToday: number;
    monthlySales: number;
    overduePayments: number;
}

export interface ChartData {
    status: string;
    count: number;
}

export interface TopManager {
    first_name: string;
    last_name: string;
    total_sales: number;
}

export interface UpcomingMeeting {
    client: string;
    time: string;
}

export interface DashboardData {
    kpi: KpiData;
    charts: {
        applicationStatuses: ChartData[];
        applicationSources: ChartData[];
        /** Заявки по дням за последнюю неделю: дата в формате ГГГГ-ММ-ДД */
        applicationsPerDay?: { date: string; count: number }[];
    };
    topManagers: TopManager[];
    upcomingMeetings: UpcomingMeeting[];
}

export const getDashboardData = async (): Promise<DashboardData> => {
    const response = await apiClient.get('/dashboard/analytics/');
    return response.data;
};